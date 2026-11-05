-- Up Migration

-- Decision D-65 (2026-11-03): the consumer home shows offers within a distance of the consumer (FR-RES-01, US-26).
-- The SRS gives no distances; the SDD mentions "within 10 km" searches. Default 10 km; the slider goes from 1 to 50 km
-- in steps of 1 km (chosen by Maryam). Kept here so the team can change them without changing code.
INSERT INTO settings (key, value, description, source) VALUES
  ('FR-RES-01',
   '{"default_radius_km": 10, "min_radius_km": 1, "max_radius_km": 50, "step_km": 1}',
   'Consumer map search distance: default and slider range in km (D-65)',
   'SRS FR-RES-01; SDD 2.2 ("within 10 km"); decision D-65');

-- Down Migration

DELETE FROM settings WHERE key = 'FR-RES-01';
