-- Up Migration

-- US-22 Charity pickup (FR-RTE-10, E-RTE-03, E-RTE-04), SDD 4.2 PartnerOffer and PickupCode. Decisions D-108 to D-110.
-- D-109: a Donation listing that nobody has taken is the "Offered" state, so a row is written only when a charity
-- accepts it (partner_id is then always known). One Accepted or Completed row per listing: the first charity wins.
CREATE TABLE partner_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  partner_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('Accepted', 'Completed', 'Cancelled')),
  pickup_time TIMESTAMPTZ NOT NULL,
  is_automatic BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX partner_offers_one_taker ON partner_offers (listing_id) WHERE status IN ('Accepted', 'Completed');
CREATE INDEX partner_offers_partner ON partner_offers (partner_id, created_at DESC);

-- SDD 4.2 PickupCode: a code belongs to a reservation or to an accepted partner offer.
ALTER TABLE pickup_codes ALTER COLUMN reservation_id DROP NOT NULL;
ALTER TABLE pickup_codes ADD COLUMN partner_offer_id UUID UNIQUE REFERENCES partner_offers (id) ON DELETE CASCADE;
ALTER TABLE pickup_codes ADD CONSTRAINT pickup_codes_one_owner
  CHECK ((reservation_id IS NULL) <> (partner_offer_id IS NULL));

-- Down Migration

ALTER TABLE pickup_codes DROP CONSTRAINT pickup_codes_one_owner;
DELETE FROM pickup_codes WHERE partner_offer_id IS NOT NULL;
ALTER TABLE pickup_codes DROP COLUMN partner_offer_id;
ALTER TABLE pickup_codes ALTER COLUMN reservation_id SET NOT NULL;
DROP TABLE partner_offers;
