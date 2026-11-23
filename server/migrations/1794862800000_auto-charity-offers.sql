-- Up Migration

-- US-23 Automatic charity offers (FR-RTE-11, BR-10, D-112). When the worker offers a consumer listing's unreserved bags
-- to charities, it writes a new Donation listing for those bags (auto_from_listing_id = the consumer listing) and marks
-- the consumer listing auto_charity_offered_at, so the offer is made once.
ALTER TABLE listings ADD COLUMN auto_from_listing_id UUID REFERENCES listings (id) ON DELETE CASCADE;
ALTER TABLE listings ADD COLUMN auto_charity_offered_at TIMESTAMPTZ;
CREATE UNIQUE INDEX listings_one_auto_donation ON listings (auto_from_listing_id) WHERE auto_from_listing_id IS NOT NULL;

-- Down Migration

DROP INDEX listings_one_auto_donation;
ALTER TABLE listings DROP COLUMN auto_charity_offered_at;
ALTER TABLE listings DROP COLUMN auto_from_listing_id;
