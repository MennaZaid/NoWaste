-- Up Migration

-- SDD 4.2 Data Dictionary, entity "Listing" (US-10, US-11, US-13; FR-LST-01, FR-LST-02, FR-LST-04).
-- listing_type and perishability_category stay NULL on full listings until turn 5 (US-18, US-19) sets them before
-- publishing. "Unknown" is stored as NULL for the food category, preparation time and expiry, and as the word
-- 'unknown' for storage (decision D-44). Quick Post never asks for preparation time, storage or expiry, so those
-- stay NULL on a Quick Post.
CREATE TABLE listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  listing_type TEXT NULL CHECK (listing_type IN ('Discounted Surplus Bag', 'Donation', 'Compost offer')),
  status TEXT NOT NULL DEFAULT 'Draft'
    CHECK (status IN ('Draft', 'Active', 'Fully reserved', 'Closed', 'Cancelled')),
  is_quick_post BOOLEAN NOT NULL DEFAULT false,
  food_type TEXT NULL,
  -- One of the six categories of SRS Appendix A, or NULL for Unknown.
  food_category food_category NULL,
  photo_key TEXT NOT NULL,
  description_ar TEXT NULL,
  description_en TEXT NULL,
  calorie_min INT NULL,
  calorie_max INT NULL,
  bags_total INT NOT NULL CHECK (bags_total >= 1),
  bags_available INT NOT NULL CHECK (bags_available >= 0 AND bags_available <= bags_total),
  -- NULL only for a Quick Post (FR-LST-02).
  original_value NUMERIC NULL CHECK (original_value IS NULL OR original_value > 0),
  -- EGP. A price of 0 is refused for now (open question 24).
  price NUMERIC NOT NULL CHECK (price > 0),
  pickup_start TIMESTAMPTZ NOT NULL,
  pickup_end TIMESTAMPTZ NOT NULL,
  prep_time TIMESTAMPTZ NULL,
  storage TEXT NULL CHECK (storage IN ('room_temperature', 'chilled', 'frozen', 'unknown')),
  expiry_at TIMESTAMPTZ NULL,
  perishability_category TEXT NULL
    CHECK (perishability_category IN ('Highly perishable', 'Short-life', 'Long-life')),
  unfit_for_people BOOLEAN NOT NULL DEFAULT false,
  -- The pickup location (docs/feedback-changes.md): starts at the shop pin, the vendor can move it.
  location GEOGRAPHY(Point, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT listings_pickup_window CHECK (pickup_end > pickup_start),
  -- NFR-05c / E-LST-03: the pickup window ends no later than the expiry.
  CONSTRAINT listings_pickup_before_expiry CHECK (expiry_at IS NULL OR pickup_end <= expiry_at),
  CONSTRAINT listings_price_not_above_original CHECK (original_value IS NULL OR price <= original_value),
  -- Only a Quick Post may leave out the original value.
  CONSTRAINT listings_original_value_needed CHECK (is_quick_post OR original_value IS NOT NULL)
);

CREATE INDEX listings_location_idx ON listings USING GIST (location);
CREATE INDEX listings_vendor_idx ON listings (vendor_id);

-- NFR-08a: the largest listing photo the server accepts. The app compresses to the same value (@nowaste/shared
-- PHOTO_MAX_BYTES); a server test checks that they match.
INSERT INTO settings (key, value, description, source) VALUES
  ('NFR-08a',
   '{"max_photo_bytes": 512000}',
   'Listing photo: compressed to 500 KB (500 x 1024 bytes) or less before upload',
   'SRS 5.1 NFR-08a; IF-COM-05');

-- Down Migration

DELETE FROM settings WHERE key = 'NFR-08a';
DROP TABLE IF EXISTS listings;
