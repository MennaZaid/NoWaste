-- Up Migration

-- Decision D-62 (2026-10-31, not in the SRS yet): optional shop opening hours, the same every day, in Egypt time.
-- Both or neither; a closing time earlier than the opening time means the shop closes after midnight. A listing's
-- pickup window must lie inside one opening period. Existing vendors have no hours, so nothing is checked for them.
ALTER TABLE vendor_profiles
  ADD COLUMN opens_at TIME NULL,
  ADD COLUMN closes_at TIME NULL,
  ADD CONSTRAINT vendor_profiles_opening_hours_check
    CHECK ((opens_at IS NULL) = (closes_at IS NULL) AND (opens_at IS NULL OR opens_at <> closes_at));

-- The time zone of opening hours and other local times (vendors in Egypt, SRS section 1).
INSERT INTO settings (key, value, description, source) VALUES
  ('LOCAL-TIME',
   '{"time_zone": "Africa/Cairo"}',
   'Time zone of shop opening hours (D-62)',
   'SRS section 1 (vendors in Egypt); decision D-62');

-- Down Migration

DELETE FROM settings WHERE key = 'LOCAL-TIME';
ALTER TABLE vendor_profiles
  DROP CONSTRAINT vendor_profiles_opening_hours_check,
  DROP COLUMN closes_at,
  DROP COLUMN opens_at;
