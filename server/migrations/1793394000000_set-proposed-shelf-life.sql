-- Up Migration

-- US-18 (FR-RTE-01), decision D-60: proposed shelf-life values in hours for perishability_rules (open question 48,
-- TBD-6). The SRS and SDD give none. These were proposed by Maryam on 2026-10-31 and need team approval; they can be
-- changed here (or by an administrator screen in a later story) without changing code.
-- They are conservative values based on common food-handling guidance (for example: cooked food, dairy and meat out
-- of the fridge for at most about 2 hours; cooked leftovers chilled for 3 days; raw meat and fish chilled for 1 day),
-- shortened for Egypt's warm climate. A value is only an earlier limit: the vendor's expiry date still wins when it
-- is earlier (FR-RTE-01). The result says how soon to collect the food, never that the food is safe (NFR-05a).
UPDATE perishability_rules AS r
SET shelf_life_hours = v.hours, updated_at = now()
FROM (VALUES
  ('bread_and_baked_goods', 'room_temperature', 48),
  ('bread_and_baked_goods', 'chilled', 120),
  ('bread_and_baked_goods', 'frozen', 720),
  ('cooked_meals', 'room_temperature', 2),
  ('cooked_meals', 'chilled', 72),
  ('cooked_meals', 'frozen', 720),
  ('fruit_and_vegetables', 'room_temperature', 48),
  ('fruit_and_vegetables', 'chilled', 120),
  ('fruit_and_vegetables', 'frozen', 720),
  ('dairy_and_eggs', 'room_temperature', 2),
  ('dairy_and_eggs', 'chilled', 120),
  ('dairy_and_eggs', 'frozen', 720),
  ('meat_poultry_and_fish', 'room_temperature', 2),
  ('meat_poultry_and_fish', 'chilled', 24),
  ('meat_poultry_and_fish', 'frozen', 720),
  ('packaged_and_dry_food', 'room_temperature', 720),
  ('packaged_and_dry_food', 'chilled', 720),
  ('packaged_and_dry_food', 'frozen', 720)
) AS v (food_category, storage, hours)
WHERE r.food_category = v.food_category::food_category AND r.storage = v.storage;

-- Down Migration

UPDATE perishability_rules SET shelf_life_hours = NULL, updated_at = now();
