-- Poora Teeka - Synthetic Seed Data
-- Initial centre and WHO-approved PEP protocols

-- 1. Anti-rabies clinics
INSERT INTO centres (id, name, city, open_vial_minutes, day_start, day_end)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Civil Hospital Anti-Rabies Clinic',
  'Mumbai',
  480,
  '09:00',
  '17:00'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO centres (id, name, city, open_vial_minutes, day_start, day_end)
VALUES (
  '44444444-4444-4444-8444-444444444444',
  'Sassoon General Hospital ARV Clinic',
  'Pune',
  480,
  '08:30',
  '16:30'
)
ON CONFLICT (id) DO NOTHING;

-- 2. Protocols: Updated Thai Red Cross (ID) and Essen Regimen (IM)
-- Updated Thai Red Cross: 2-site intradermal on days 0, 3, 7, 28 (2 units per visit)
INSERT INTO protocols (id, label, vaccine_id, route, visit_offsets, units_per_visit, source, approved_by)
VALUES (
  'thai_red_cross_id',
  'Updated Thai Red Cross (2-site ID)',
  'RABIES',
  'ID',
  '{0,3,7,28}',
  2,
  'WHO Rabies Guidelines 2018 / National Rabies Control Program (NRCP)',
  'Ministry of Health and Family Welfare (MoHFW)'
)
ON CONFLICT (id) DO UPDATE SET vaccine_id = EXCLUDED.vaccine_id;

INSERT INTO protocols (id, label, vaccine_id, route, visit_offsets, units_per_visit, source, approved_by)
VALUES (
  'IN-UTRC-ID-v1',
  'Updated Thai Red Cross (2-site ID)',
  'RABIES',
  'ID',
  '{0,3,7,28}',
  2,
  'WHO Rabies Guidelines 2018 / National Rabies Control Program (NRCP)',
  'Ministry of Health and Family Welfare (MoHFW)'
)
ON CONFLICT (id) DO UPDATE SET vaccine_id = EXCLUDED.vaccine_id;

-- Essen Regimen: 1-site intramuscular on days 0, 3, 7, 14, 28 (1 unit per visit: 1 full vial)
INSERT INTO protocols (id, label, vaccine_id, route, visit_offsets, units_per_visit, source, approved_by)
VALUES (
  'essen_im',
  'Essen Regimen (1-site IM)',
  'RABIES',
  'IM',
  '{0,3,7,14,28}',
  1,
  'WHO Rabies Guidelines 2018 / National Rabies Control Program (NRCP)',
  'Ministry of Health and Family Welfare (MoHFW)'
)
ON CONFLICT (id) DO UPDATE SET vaccine_id = EXCLUDED.vaccine_id;

INSERT INTO protocols (id, label, vaccine_id, route, visit_offsets, units_per_visit, source, approved_by)
VALUES (
  'IN-ESSEN-IM-v1',
  'Essen Regimen (1-site IM)',
  'RABIES',
  'IM',
  '{0,3,7,14,28}',
  1,
  'WHO Rabies Guidelines 2018 / National Rabies Control Program (NRCP)',
  'Ministry of Health and Family Welfare (MoHFW)'
)
ON CONFLICT (id) DO UPDATE SET vaccine_id = EXCLUDED.vaccine_id;

-- 3. BCG: Single-dose intradermal for newborns (1 unit per visit, 6-hour open vial window)
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
ON CONFLICT (id) DO UPDATE SET vaccine_id = EXCLUDED.vaccine_id;

-- 4. Hepatitis B: 3-dose intramuscular series (0, 30, 180 days, 1 unit per visit, 28-day open vial window)
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
ON CONFLICT (id) DO UPDATE SET vaccine_id = EXCLUDED.vaccine_id;
