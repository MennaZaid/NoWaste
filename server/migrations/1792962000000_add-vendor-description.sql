-- Up Migration

-- Decision D-26: a vendor can add an optional short description of the shop (not in SDD 4.2 yet).
-- The length limit is checked by @nowaste/shared (validateSignUp); the column only refuses empty text.
ALTER TABLE vendor_profiles
  ADD COLUMN description TEXT NULL CHECK (description IS NULL OR btrim(description) <> '');

-- Down Migration

ALTER TABLE vendor_profiles DROP COLUMN IF EXISTS description;
