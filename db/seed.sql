-- Poora Teeka - Synthetic Seed Data
-- Initial centre and WHO-approved PEP protocols

-- 1. Primary anti-rabies clinic centre
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

-- 2. Protocols: Updated Thai Red Cross (ID) and Essen Regimen (IM)
-- Updated Thai Red Cross: 2-site intradermal on days 0, 3, 7, 28 (2 units per visit)
INSERT INTO protocols (id, label, route, visit_offsets, units_per_visit, source, approved_by)
VALUES (
  'thai_red_cross_id',
  'Updated Thai Red Cross (2-site ID)',
  'ID',
  '{0,3,7,28}',
  2,
  'WHO Rabies Guidelines 2018 / National Rabies Control Program (NRCP)',
  'Ministry of Health and Family Welfare (MoHFW)'
)
ON CONFLICT (id) DO NOTHING;

-- Essen Regimen: 1-site intramuscular on days 0, 3, 7, 14, 28 (1 unit per visit: 1 full vial)
INSERT INTO protocols (id, label, route, visit_offsets, units_per_visit, source, approved_by)
VALUES (
  'essen_im',
  'Essen Regimen (1-site IM)',
  'IM',
  '{0,3,7,14,28}',
  1,
  'WHO Rabies Guidelines 2018 / National Rabies Control Program (NRCP)',
  'Ministry of Health and Family Welfare (MoHFW)'
)
ON CONFLICT (id) DO NOTHING;
