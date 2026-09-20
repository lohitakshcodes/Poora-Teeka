-- 002_add_bcg_and_hepb_protocols.sql
-- Adds BCG and Hepatitis B protocols and per-protocol open-vial window support

-- 1. Add open_vial_minutes to protocols table (defaults to 480 min = 8 hours)
ALTER TABLE protocols
  ADD COLUMN IF NOT EXISTS open_vial_minutes int NOT NULL DEFAULT 480;

-- 2. Add protocol_id and open_vial_minutes to vial_lots for disease-agnostic lot tracking
ALTER TABLE vial_lots
  ADD COLUMN IF NOT EXISTS protocol_id text REFERENCES protocols(id),
  ADD COLUMN IF NOT EXISTS open_vial_minutes int;

-- 3. Insert BCG protocol: single dose, ID route, 1 unit (0.05 ml), 6-hour open-vial window (360 min)
INSERT INTO protocols (id, label, vaccine_id, route, visit_offsets, units_per_visit, open_vial_minutes, source, approved_by)
VALUES (
  'IN-BCG-v1',
  'BCG — single dose (newborn)',
  'BCG',
  'ID',
  '{0}',
  1,
  360,
  'WHO Expanded Programme on Immunization (EPI) / National Immunization Schedule (NIS) India',
  'Ministry of Health and Family Welfare (MoHFW)'
)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  vaccine_id = COALESCE(EXCLUDED.vaccine_id, 'BCG'),
  route = EXCLUDED.route,
  visit_offsets = EXCLUDED.visit_offsets,
  units_per_visit = EXCLUDED.units_per_visit,
  open_vial_minutes = EXCLUDED.open_vial_minutes;

-- 4. Insert Hepatitis B protocol: 3 doses (Days 0, 30, 180), IM route, 1 unit (1 full vial), 28-day window (40320 min)
INSERT INTO protocols (id, label, vaccine_id, route, visit_offsets, units_per_visit, open_vial_minutes, source, approved_by)
VALUES (
  'IN-HEPB-IM-v1',
  'Hepatitis B — 3 doses',
  'HEPB',
  'IM',
  '{0,30,180}',
  1,
  40320,
  'WHO Position Paper on Hepatitis B / National Immunization Schedule (NIS) India',
  'Ministry of Health and Family Welfare (MoHFW)'
)
ON CONFLICT (id) DO UPDATE SET
  label = EXCLUDED.label,
  vaccine_id = COALESCE(EXCLUDED.vaccine_id, 'HEPB'),
  route = EXCLUDED.route,
  visit_offsets = EXCLUDED.visit_offsets,
  units_per_visit = EXCLUDED.units_per_visit,
  open_vial_minutes = EXCLUDED.open_vial_minutes;

-- 5. Upgrade open_vial function to respect lot/protocol open_vial_minutes with centre fallback
CREATE OR REPLACE FUNCTION open_vial(p_centre uuid, p_lot uuid, p_serial text)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_id      uuid;
  v_units   int;
  v_minutes int;
BEGIN
  SELECT vl.units_per_vial,
         COALESCE(vl.open_vial_minutes, p.open_vial_minutes)
    INTO v_units, v_minutes
    FROM vial_lots vl
    LEFT JOIN protocols p ON vl.protocol_id = p.id
   WHERE vl.id = p_lot AND vl.remaining_unopened > 0
   FOR UPDATE OF vl;

  IF v_units IS NULL THEN
    RAISE EXCEPTION 'lot % has no unopened vials', p_lot;
  END IF;

  IF v_minutes IS NULL THEN
    SELECT open_vial_minutes INTO v_minutes FROM centres WHERE id = p_centre;
  END IF;

  IF v_minutes IS NULL THEN
    v_minutes := 480;
  END IF;

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
