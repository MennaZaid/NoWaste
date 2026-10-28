// C-27 Data Access: the login_attempts table (NFR-09d). Attempts are recorded only for existing accounts.
import { getPool } from './db.js';

export async function insertLoginAttempt(userId: string, attemptedAt: Date, success: boolean): Promise<void> {
  await getPool().query('INSERT INTO login_attempts (user_id, attempted_at, success) VALUES ($1, $2, $3)', [
    userId,
    attemptedAt,
    success,
  ]);
}

/**
 * The times of the newest failed attempts since the account's last successful login, newest first, at most
 * `limit` of them, and none after `before`.
 */
export async function recentFailures(userId: string, before: Date, limit: number): Promise<Date[]> {
  const result = await getPool().query<{ attemptedAt: Date }>(
    `SELECT attempted_at AS "attemptedAt" FROM login_attempts
     WHERE user_id = $1 AND success = false AND attempted_at <= $2
       AND attempted_at > COALESCE(
         (SELECT max(attempted_at) FROM login_attempts
          WHERE user_id = $1 AND success = true AND attempted_at <= $2),
         '-infinity')
     ORDER BY attempted_at DESC
     LIMIT $3`,
    [userId, before, limit],
  );
  return result.rows.map((row) => row.attemptedAt);
}
