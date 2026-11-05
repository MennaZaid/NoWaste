-- Up Migration

-- US-18 (FR-RTE-01) [FEEDBACK CHANGE]: the shelf-life for each food category and storage condition is read from this
-- table, never from code, so an administrator can manage it later. The SRS and SDD give no values, so every
-- shelf-life starts NULL; a NULL shelf-life makes the estimate Highly perishable, the safest result (open question 48,
-- new TBD-6). Storage Unknown has no row: Unknown storage is always Highly perishable (FR-RTE-02).
CREATE TABLE perishability_rules (
  food_category food_category NOT NULL,
  storage TEXT NOT NULL CHECK (storage IN ('room_temperature', 'chilled', 'frozen')),
  shelf_life_hours NUMERIC NULL CHECK (shelf_life_hours IS NULL OR shelf_life_hours > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (food_category, storage)
);

INSERT INTO perishability_rules (food_category, storage)
SELECT category, storage
FROM unnest(enum_range(NULL::food_category)) AS category
CROSS JOIN (VALUES ('room_temperature'), ('chilled'), ('frozen')) AS s (storage);

-- US-19 (FR-RTE-05): the largest distance from the pickup location to a charity or composting partner that counts
-- as eligible. The SRS gives no limit, so it is NULL (no limit) until the team decides (open question 49).
INSERT INTO settings (key, value, description, source) VALUES
  ('FR-RTE-05',
   '{"partner_radius_km": null}',
   'Routing: largest distance in km from the pickup location to an eligible charity or composting partner; null = no limit',
   'SRS FR-RTE-05 (no value given); open question 49');

-- Down Migration

DELETE FROM settings WHERE key = 'FR-RTE-05';
DROP TABLE IF EXISTS perishability_rules;
