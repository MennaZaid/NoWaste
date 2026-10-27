-- Up Migration

-- SRS Appendix A "Food category": the six groups. One shared type, used by partner profiles now (US-03) and by
-- listings (US-10) and routing (US-19) later. The same values are in @nowaste/shared FOOD_CATEGORIES.
CREATE TYPE food_category AS ENUM (
  'bread_and_baked_goods',
  'cooked_meals',
  'fruit_and_vegetables',
  'dairy_and_eggs',
  'meat_poultry_and_fish',
  'packaged_and_dry_food'
);

-- SDD 4.2 Data Dictionary, entity "VendorProfile" (US-02, FR-ACC-02).
-- docs/feedback-changes.md: the shop location is a map pin plus a written address (address is not in SDD 4.2 yet).
CREATE TABLE vendor_profiles (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  shop_name TEXT NOT NULL CHECK (btrim(shop_name) <> ''),
  vendor_type TEXT NOT NULL CHECK (vendor_type IN ('formal', 'informal')),
  address TEXT NOT NULL CHECK (btrim(address) <> ''),
  location GEOGRAPHY(Point, 4326) NOT NULL,
  contact TEXT NOT NULL CHECK (btrim(contact) <> ''),
  auto_charity_opt_in BOOLEAN NOT NULL DEFAULT false,
  average_rating NUMERIC NULL
);

CREATE INDEX vendor_profiles_location_idx ON vendor_profiles USING GIST (location);

-- SDD 4.2 Data Dictionary, entity "PartnerProfile" (US-03, FR-ACC-03), with the same pin and address as vendors.
CREATE TABLE partner_profiles (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  organisation_name TEXT NOT NULL CHECK (btrim(organisation_name) <> ''),
  partner_type TEXT NOT NULL CHECK (partner_type IN ('charity', 'composting')),
  -- One or more of the six food categories.
  accepted_food_types food_category[] NOT NULL CHECK (cardinality(accepted_food_types) >= 1),
  address TEXT NOT NULL CHECK (btrim(address) <> ''),
  location GEOGRAPHY(Point, 4326) NOT NULL
);

CREATE INDEX partner_profiles_location_idx ON partner_profiles USING GIST (location);

-- Down Migration

DROP TABLE IF EXISTS partner_profiles;
DROP TABLE IF EXISTS vendor_profiles;
DROP TYPE IF EXISTS food_category;
