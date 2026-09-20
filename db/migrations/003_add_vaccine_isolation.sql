-- 003_add_vaccine_isolation.sql
-- Adds vaccine_id to protocols and vial_lots for physical vaccine stock isolation

-- 1. Add vaccine_id to protocols
ALTER TABLE protocols ADD COLUMN IF NOT EXISTS vaccine_id text;

-- Backfill protocols
UPDATE protocols SET vaccine_id = 'RABIES' WHERE id IN ('thai_red_cross_id', 'essen_im', 'IN-UTRC-ID-v1', 'IN-ESSEN-IM-v1');
UPDATE protocols SET vaccine_id = 'BCG' WHERE id = 'IN-BCG-v1';
UPDATE protocols SET vaccine_id = 'HEPB' WHERE id = 'IN-HEPB-IM-v1';
UPDATE protocols SET vaccine_id = 'RABIES' WHERE vaccine_id IS NULL;

-- Ensure IN-UTRC-ID-v1 and IN-ESSEN-IM-v1 exist in protocols alongside thai_red_cross_id / essen_im
INSERT INTO protocols (id, label, vaccine_id, route, visit_offsets, units_per_visit, open_vial_minutes, source, approved_by)
VALUES (
  'IN-UTRC-ID-v1',
  'Updated Thai Red Cross (2-site ID)',
  'RABIES',
  'ID',
  '{0,3,7,28}',
  2,
  480,
  'WHO Rabies Guidelines 2018 / National Rabies Control Program (NRCP)',
  'Ministry of Health and Family Welfare (MoHFW)'
)
ON CONFLICT (id) DO UPDATE SET vaccine_id = EXCLUDED.vaccine_id;

INSERT INTO protocols (id, label, vaccine_id, route, visit_offsets, units_per_visit, open_vial_minutes, source, approved_by)
VALUES (
  'IN-ESSEN-IM-v1',
  'Essen Regimen (1-site IM)',
  'RABIES',
  'IM',
  '{0,3,7,14,28}',
  1,
  480,
  'WHO Rabies Guidelines 2018 / National Rabies Control Program (NRCP)',
  'Ministry of Health and Family Welfare (MoHFW)'
)
ON CONFLICT (id) DO UPDATE SET vaccine_id = EXCLUDED.vaccine_id;

ALTER TABLE protocols ALTER COLUMN vaccine_id SET NOT NULL;

-- 2. Add vaccine_id to vial_lots with default 'RABIES'
ALTER TABLE vial_lots ADD COLUMN IF NOT EXISTS vaccine_id text NOT NULL DEFAULT 'RABIES';

-- Backfill existing lots accurately
UPDATE vial_lots SET vaccine_id = 'BCG' WHERE brand ILIKE '%BCG%';
UPDATE vial_lots SET vaccine_id = 'HEPB' WHERE brand ILIKE '%HepB%' OR brand ILIKE '%Hepatitis%';
UPDATE vial_lots SET vaccine_id = 'RABIES' WHERE vaccine_id IS NULL;

-- 3. Rewrite reserve_units() to derive vaccine_id directly from the dose's course protocol
CREATE OR REPLACE FUNCTION reserve_units(p_dose uuid, p_centre uuid, p_units int)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_vial uuid;
  v_vaccine_id text;
BEGIN
  -- Derive required vaccine_id directly from the dose's course protocol
  SELECT p.vaccine_id INTO v_vaccine_id
  FROM doses d
  JOIN courses c ON d.course_id = c.id
  JOIN protocols p ON c.protocol_id = p.id
  WHERE d.id = p_dose;

  IF v_vaccine_id IS NULL THEN
    RAISE EXCEPTION 'Could not derive vaccine_id for dose %', p_dose;
  END IF;

  SELECT ov.id INTO v_vial
  FROM open_vials ov
  JOIN vial_lots vl ON ov.lot_id = vl.id
  WHERE ov.centre_id = p_centre
    AND vl.vaccine_id = v_vaccine_id
    AND ov.usable @> now()
    AND ov.units_total - ov.units_used >= p_units
  ORDER BY upper(ov.usable) ASC
  FOR UPDATE OF ov SKIP LOCKED
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
