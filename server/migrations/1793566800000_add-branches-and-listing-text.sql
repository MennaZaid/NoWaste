-- Up Migration

-- Decision D-64 (2026-11-03, asked for by Maryam; not in the SRS yet): a vendor has one or more branches, each with
-- a name, a written address, a map pin and its own opening hours (D-62 rules: both or neither; a closing time
-- earlier than the opening time means after midnight). The shop given at sign-up is the first branch. A listing is
-- picked up at one branch, which replaces the movable pickup pin (docs/feedback-changes.md, US-10).
CREATE TABLE vendor_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  address TEXT NOT NULL CHECK (btrim(address) <> ''),
  location GEOGRAPHY(Point, 4326) NOT NULL,
  opens_at TIME NULL,
  closes_at TIME NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT vendor_branches_opening_hours_check
    CHECK ((opens_at IS NULL) = (closes_at IS NULL) AND (opens_at IS NULL OR opens_at <> closes_at))
);
CREATE INDEX vendor_branches_vendor_idx ON vendor_branches (vendor_id);
CREATE INDEX vendor_branches_location_idx ON vendor_branches USING GIST (location);

-- Every existing vendor gets its shop as the first branch (hours may still be missing for vendors who registered
-- before D-62; they set them before posting food).
INSERT INTO vendor_branches (vendor_id, name, address, location, opens_at, closes_at, created_at)
SELECT user_id, shop_name, address, location, opens_at, closes_at, now() FROM vendor_profiles;

-- Decision D-63: the vendor writes the listing name and description once, in Arabic or English; the server
-- translates them into the other language (description_ar / description_en already exist). D-64: the branch.
ALTER TABLE listings
  ADD COLUMN name_ar TEXT NULL,
  ADD COLUMN name_en TEXT NULL,
  ADD COLUMN source_language TEXT NULL CHECK (source_language IS NULL OR source_language IN ('ar', 'en')),
  ADD COLUMN branch_id UUID NULL REFERENCES vendor_branches (id) ON DELETE SET NULL;

-- Down Migration

ALTER TABLE listings
  DROP COLUMN branch_id,
  DROP COLUMN source_language,
  DROP COLUMN name_en,
  DROP COLUMN name_ar;
DROP TABLE IF EXISTS vendor_branches;
