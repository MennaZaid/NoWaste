// C-27 Data Access: the sessions table (US-04, IF-COM-03). One row per login; logout sets ended_at.
import { getPool } from './db.js';

export interface SessionRecord {
  jti: string;
  userId: string;
  createdAt: Date;
  endedAt: Date | null;
}

export async function insertSession(jti: string, userId: string, createdAt: Date): Promise<void> {
  await getPool().query('INSERT INTO sessions (jti, user_id, created_at) VALUES ($1, $2, $3)', [
    jti,
    userId,
    createdAt,
  ]);
}

export async function findSession(jti: string): Promise<SessionRecord | undefined> {
  const result = await getPool().query<SessionRecord>(
    `SELECT jti, user_id AS "userId", created_at AS "createdAt", ended_at AS "endedAt"
     FROM sessions WHERE jti = $1`,
    [jti],
  );
  return result.rows[0];
}

/** Ends the session if it is still open. */
export async function endSession(jti: string, endedAt: Date): Promise<void> {
  await getPool().query('UPDATE sessions SET ended_at = $2 WHERE jti = $1 AND ended_at IS NULL', [
    jti,
    endedAt,
  ]);
}
