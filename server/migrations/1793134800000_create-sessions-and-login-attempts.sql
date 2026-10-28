-- Up Migration

-- US-04 (FR-ACC-04, IF-COM-03): one row per login. The access token (JWT) carries the session id as its jti; logout
-- sets ended_at, and a token whose session has ended is refused. Not in the SDD 4.2 data dictionary yet.
CREATE TABLE sessions (
  jti UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

-- NFR-09d (E-ACC-03): every login attempt on an existing account, to lock the account after repeated failures.
-- Not in the SDD 4.2 data dictionary yet.
CREATE TABLE login_attempts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  attempted_at TIMESTAMPTZ NOT NULL,
  success BOOLEAN NOT NULL
);

CREATE INDEX login_attempts_user_time_idx ON login_attempts (user_id, attempted_at DESC);

-- NFR-09d: the lockout limits, read by the Account Service (never constants in code).
INSERT INTO settings (key, value, description, source) VALUES
  ('NFR-09d',
   '{"max_failed_logins": 5, "within_minutes": 15, "lock_minutes": 15}',
   'Login lockout: after 5 failed login attempts on an account within 15 minutes, refuse further logins to that account for 15 minutes',
   'SRS 5.3 NFR-09d; E-ACC-03');

-- Down Migration

DELETE FROM settings WHERE key = 'NFR-09d';
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS sessions;
