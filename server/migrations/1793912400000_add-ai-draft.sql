-- Up Migration

-- US-12 AI draft listing (FR-LST-03). Decisions D-80 to D-83 (2026-11-08).
-- The AI draft time limit is the existing BR-12 row (10 seconds, E-LST-01, NFR-02).
-- AI-CONFIDENCE: below this confidence an AI food category counts as uncertain and the listing is Highly perishable
-- (NFR-05d). The SRS gives no value; 0.7 is a placeholder the team must confirm (open question 59).
INSERT INTO settings (key, value, description, source) VALUES
  ('AI-CONFIDENCE', '{"min_confidence": 0.7}',
   'Lowest AI confidence for which the AI food category counts as confident (placeholder, open question 59)',
   'SRS NFR-05d; decision D-80');

-- The draft the AI gave for an uploaded photo, kept so the server knows which listing fields the AI filled
-- (NFR-05b) and how confident it was (NFR-05d). One row per photo; the photo key is made by the Storage Adapter.
CREATE TABLE ai_drafts (
  photo_key TEXT PRIMARY KEY,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Down Migration

DROP TABLE ai_drafts;
DELETE FROM settings WHERE key = 'AI-CONFIDENCE';
