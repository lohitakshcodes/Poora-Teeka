CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE protocols (
  id              text PRIMARY KEY,
  label           text        NOT NULL,
  route           text        NOT NULL CHECK (route IN ('ID','IM')),
  visit_offsets   int[]       NOT NULL,
  units_per_visit int         NOT NULL CHECK (units_per_visit > 0),
  source          text        NOT NULL,
  approved_by     text        NOT NULL,
  valid_period    tstzrange   NOT NULL DEFAULT tstzrange(now(), NULL),
  CHECK (array_length(visit_offsets, 1) >= 1),
  CHECK (visit_offsets[1] = 0)
);

CREATE TABLE centres (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  city              text NOT NULL,
  open_vial_minutes int  NOT NULL DEFAULT 480 CHECK (open_vial_minutes BETWEEN 60 AND 480),
  day_start         time NOT NULL DEFAULT '09:00',
  day_end           time NOT NULL DEFAULT '17:00',
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE patients (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id      uuid NOT NULL REFERENCES centres(id),
  name           text NOT NULL,
  phone_e164     text NOT NULL CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  language       text NOT NULL DEFAULT 'hi' CHECK (language IN ('hi','mr','en')),
  guardian_phone text CHECK (guardian_phone IS NULL OR guardian_phone ~ '^\+[1-9][0-9]{7,14}$'),
  status_token   text NOT NULL DEFAULT encode(gen_random_bytes(12), 'hex'),
  consent_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (status_token)
);

CREATE TABLE courses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  uuid NOT NULL REFERENCES patients(id),
  centre_id   uuid NOT NULL REFERENCES centres(id),
  protocol_id text NOT NULL REFERENCES protocols(id),
  route       text NOT NULL CHECK (route IN ('ID','IM')),
  day0        date NOT NULL,
  status      text NOT NULL DEFAULT 'ACTIVE'
              CHECK (status IN ('ACTIVE','COMPLETED','ABANDONED')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, route)
);
CREATE INDEX courses_patient_idx ON courses (patient_id);

CREATE TABLE doses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id  uuid NOT NULL,
  route      text NOT NULL,
  seq        int  NOT NULL CHECK (seq >= 1),
  due_date   date NOT NULL,
  status     text NOT NULL DEFAULT 'SCHEDULED'
             CHECK (status IN ('SCHEDULED','DUE','GIVEN','MISSED','RECOVERED')),
  given_at         timestamptz,
  slot_start       timestamptz,
  escalation_level varchar,
  dropout_risk     float,
  version          int  NOT NULL DEFAULT 1,
  FOREIGN KEY (course_id, route) REFERENCES courses(id, route),
  UNIQUE (course_id, seq),
  CHECK ((status = 'GIVEN') = (given_at IS NOT NULL))
);
CREATE INDEX doses_due_idx    ON doses (due_date, status);
CREATE INDEX doses_course_idx ON doses (course_id);

CREATE TABLE vial_lots (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id          uuid NOT NULL REFERENCES centres(id),
  brand              text NOT NULL,
  ml                 numeric(4,2) NOT NULL CHECK (ml > 0),
  units_per_vial     int  NOT NULL CHECK (units_per_vial > 0),
  expiry             date NOT NULL,
  received           int  NOT NULL CHECK (received >= 0),
  remaining_unopened int  NOT NULL CHECK (remaining_unopened >= 0),
  CHECK (remaining_unopened <= received)
);

CREATE TABLE open_vials (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  centre_id    uuid NOT NULL REFERENCES centres(id),
  lot_id       uuid NOT NULL REFERENCES vial_lots(id),
  vial_serial  text NOT NULL,
  opened_at    timestamptz NOT NULL DEFAULT now(),
  usable       tstzrange   NOT NULL,
  units_total  int NOT NULL CHECK (units_total > 0),
  units_used   int NOT NULL DEFAULT 0,
  CHECK (units_used >= 0 AND units_used <= units_total),
  EXCLUDE USING gist (vial_serial WITH =, usable WITH &&)
);
CREATE INDEX open_vials_live_idx ON open_vials (centre_id, upper(usable))
  WHERE units_used < units_total;

CREATE TABLE dose_reservations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dose_id      uuid NOT NULL UNIQUE REFERENCES doses(id),
  open_vial_id uuid NOT NULL REFERENCES open_vials(id),
  units        int  NOT NULL CHECK (units > 0),
  taken_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dose_reservations_vial_idx ON dose_reservations (open_vial_id);

CREATE TABLE reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dose_id         uuid NOT NULL REFERENCES doses(id),
  kind            text NOT NULL CHECK (kind IN ('PRE','MISSED')),
  scheduled_for   timestamptz NOT NULL,
  schedule_name   text,
  status          text NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','SENT','FAILED')),
  idempotency_key text NOT NULL UNIQUE,
  provider_msg_id text,
  attempts        int  NOT NULL DEFAULT 0,
  last_error      text
);
CREATE INDEX reminders_dose_idx ON reminders (dose_id);

CREATE TABLE outbox (
  id           bigserial PRIMARY KEY,
  topic        text  NOT NULL,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);
CREATE INDEX outbox_unpublished_idx ON outbox (id) WHERE published_at IS NULL;

CREATE TABLE idempotency_keys (
  key        text PRIMARY KEY,
  endpoint   text NOT NULL,
  response   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id        bigserial PRIMARY KEY,
  actor     text NOT NULL,
  action    text NOT NULL,
  entity    text NOT NULL,
  entity_id uuid,
  detail    jsonb,
  at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_events (entity, entity_id);

CREATE OR REPLACE FUNCTION reserve_units(p_dose uuid, p_centre uuid, p_units int)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_vial uuid;
BEGIN
  SELECT id INTO v_vial
  FROM open_vials
  WHERE centre_id = p_centre
    AND usable @> now()
    AND units_total - units_used >= p_units
  ORDER BY upper(usable) ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_vial IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE open_vials
     SET units_used = units_used + p_units
   WHERE id = v_vial;

  INSERT INTO dose_reservations (dose_id, open_vial_id, units)
  VALUES (p_dose, v_vial, p_units);

  RETURN v_vial;
END $$;

CREATE OR REPLACE FUNCTION open_vial(p_centre uuid, p_lot uuid, p_serial text)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id      uuid;
  v_units   int;
  v_minutes int;
BEGIN
  SELECT units_per_vial INTO v_units FROM vial_lots
   WHERE id = p_lot AND remaining_unopened > 0
   FOR UPDATE;

  IF v_units IS NULL THEN
    RAISE EXCEPTION 'lot % has no unopened vials', p_lot;
  END IF;

  SELECT open_vial_minutes INTO v_minutes FROM centres WHERE id = p_centre;

  UPDATE vial_lots SET remaining_unopened = remaining_unopened - 1 WHERE id = p_lot;

  INSERT INTO open_vials (centre_id, lot_id, vial_serial, usable, units_total)
  VALUES (
    p_centre, p_lot, p_serial,
    tstzrange(now(), now() + make_interval(mins => v_minutes), '[)'),
    v_units
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

CREATE OR REPLACE VIEW v_invariant_violations AS
SELECT ov.id,
       ov.units_total,
       ov.units_used,
       COALESCE(SUM(dr.units), 0) AS reserved
FROM open_vials ov
LEFT JOIN dose_reservations dr ON dr.open_vial_id = ov.id
GROUP BY ov.id, ov.units_total, ov.units_used
HAVING ov.units_used <> COALESCE(SUM(dr.units), 0)
    OR ov.units_used > ov.units_total;

CREATE OR REPLACE FUNCTION log_dose_change()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO audit_events (actor, action, entity, entity_id, detail)
    VALUES (
      current_setting('app.actor', true),
      'dose.status_change',
      'dose',
      NEW.id,
      jsonb_build_object('from', OLD.status, 'to', NEW.status, 'seq', NEW.seq)
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER doses_audit
AFTER UPDATE ON doses
FOR EACH ROW EXECUTE FUNCTION log_dose_change();
