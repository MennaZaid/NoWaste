-- Up Migration

-- US-34 notifications shown in the app (FR-RES-11, IF-SW-06), decision D-121. Each notification is kept so the app can
-- list it; push delivery waits for a development build (D-118). `data` holds only ids, names and times: the phone
-- builds the text in its own language (NFR-06).
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('reservation_confirmed', 'reservation_released', 'waitlist_offer', 'window_open')),
  data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL,
  read_at TIMESTAMPTZ
);
CREATE INDEX notifications_user ON notifications (user_id, created_at DESC);

-- FR-RES-11 "bag ready": sent once per reservation when its pickup (or its no-card slot) starts.
ALTER TABLE reservations ADD COLUMN window_notified_at TIMESTAMPTZ;

-- Down Migration

ALTER TABLE reservations DROP COLUMN window_notified_at;
DROP TABLE notifications;
