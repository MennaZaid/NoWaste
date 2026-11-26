-- Up Migration

-- US-25 Landfill record (FR-RTE-13), SDD 4.2 LandfillRecord, decision D-117 (Farah, 2026-11-26). After the pickup
-- window ends, the vendor records the bags nobody took as a landfill disposal, once per listing.
CREATE TABLE landfill_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL UNIQUE REFERENCES listings (id) ON DELETE CASCADE,
  bags INT NOT NULL CHECK (bags > 0),
  recorded_at TIMESTAMPTZ NOT NULL
);

-- US-44 Impact numbers (FR-TGI-07), decision D-118 (Farah, 2026-11-26): estimated CO2 avoided is 2.5 kg for each
-- rescued bag (one bag = one meal). A rule value, so a settings row, never a constant in code.
INSERT INTO settings (key, value, description, source) VALUES
  ('FR-TGI-07', '{"co2_kg_per_bag": 2.5}',
   'Impact numbers: estimated CO2 avoided per rescued bag (kg), D-118',
   'SRS FR-TGI-07; US-44; D-118');

-- Down Migration

DELETE FROM settings WHERE key = 'FR-TGI-07';
DROP TABLE landfill_records;
