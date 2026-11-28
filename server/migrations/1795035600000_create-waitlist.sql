-- Up Migration

-- US-29 Waitlist (FR-RES-06, BR-04, BR-05), SDD 4.2 WaitlistEntry and 5.3. Decisions D-117 to D-119.
-- `seq` keeps the join order (the SDD "position" is worked out from it, so leaving needs no renumbering).
-- An Offered entry has a bag set aside for it until offer_expires_at.
CREATE TABLE waitlist_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq BIGSERIAL NOT NULL,
  listing_id UUID NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  consumer_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('Waiting', 'Offered', 'Accepted', 'Expired', 'Declined', 'Left')),
  offer_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT waitlist_offer_has_expiry CHECK (status <> 'Offered' OR offer_expires_at IS NOT NULL)
);
-- One active place per consumer per listing.
CREATE UNIQUE INDEX waitlist_one_active ON waitlist_entries (listing_id, consumer_id)
  WHERE status IN ('Waiting', 'Offered');
CREATE INDEX waitlist_listing_order ON waitlist_entries (listing_id, seq) WHERE status = 'Waiting';
CREATE INDEX waitlist_offer_expiry ON waitlist_entries (offer_expires_at) WHERE status = 'Offered';

-- US-35 (FR-RES-12): when a reservation was cancelled.
ALTER TABLE reservations ADD COLUMN cancelled_at TIMESTAMPTZ;

-- Down Migration

ALTER TABLE reservations DROP COLUMN cancelled_at;
DROP TABLE waitlist_entries;
