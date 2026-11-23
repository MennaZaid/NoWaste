-- Up Migration

-- US-43 Zakat donation and receipt (FR-TGI-05, FR-TGI-06, E-TGI-02, E-TGI-03, BR-11), SDD 4.2 ZakatDonation and C-14.
-- Decisions D-113 to D-116.

-- D-113: the paid bags become a Donation listing that only the chosen charity sees (reserved_for_partner_id).
ALTER TABLE listings ADD COLUMN reserved_for_partner_id UUID REFERENCES users (id) ON DELETE CASCADE;

-- D-114: receipt numbers ZK-<year>-<6 digits>, from one sequence so they never repeat.
CREATE SEQUENCE zakat_receipt_seq;

CREATE TABLE zakat_donations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- The consumer listing the bags were paid for, and the Donation listing they became.
  listing_id UUID NOT NULL REFERENCES listings (id) ON DELETE CASCADE,
  donation_listing_id UUID NOT NULL UNIQUE REFERENCES listings (id) ON DELETE CASCADE,
  charity_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  bags INT NOT NULL CHECK (bags > 0),
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  receipt_number TEXT UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('Pending payment', 'Paid', 'Delivered', 'Refunded')),
  -- The bank's reference only, never card data (NFR-10).
  gateway_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  delivered_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  CONSTRAINT zakat_paid_has_receipt CHECK (status = 'Pending payment' OR receipt_number IS NOT NULL)
);
CREATE INDEX zakat_donations_consumer ON zakat_donations (consumer_id, created_at DESC);

-- The pretend bank (D-99) gives money back for an approved charge (E-TGI-03, BR-11), once.
CREATE TABLE mock_bank.refunds (
  charge_reference UUID PRIMARY KEY REFERENCES mock_bank.charges (reference) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE mock_bank.refunds;
DROP TABLE zakat_donations;
DROP SEQUENCE zakat_receipt_seq;
ALTER TABLE listings DROP COLUMN reserved_for_partner_id;
