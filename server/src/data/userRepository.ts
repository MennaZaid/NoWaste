// C-27 Data Access: the users table (SDD 4.2 "User").
import { DatabaseError, type Pool, type PoolClient } from 'pg';
import { getPool } from './db.js';

export type Role = 'consumer' | 'vendor' | 'charity' | 'composting' | 'other' | 'admin';
export type AccountStatus = 'Active' | 'Pending' | 'Approved' | 'Rejected' | 'Suspended' | 'Removed';
export type Language = 'ar' | 'en';

export interface UserRecord {
  id: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  role: Role;
  status: AccountStatus;
  language: Language;
  createdAt: Date;
}

export interface NewUser {
  email: string | null;
  phone: string | null;
  passwordHash: string;
  role: Role;
  status: AccountStatus;
  language: Language;
}

/** Thrown when the email or phone already exists (unique constraint), so the service can answer E-ACC-01. */
export class DuplicateUserError extends Error {
  constructor(readonly field: 'email' | 'phone') {
    super(`A user with this ${field} already exists`);
  }
}

const columns = `id, email, phone, password_hash AS "passwordHash", role, status, language, created_at AS "createdAt"`;

/** Anything that can run a query: the pool, or a client inside a transaction. */
type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>;

export async function insertUser(user: NewUser, db: Queryable = getPool()): Promise<UserRecord> {
  try {
    const result = await db.query<UserRecord>(
      `INSERT INTO users (email, phone, password_hash, role, status, language)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${columns}`,
      [user.email, user.phone, user.passwordHash, user.role, user.status, user.language],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('INSERT INTO users returned no row');
    }
    return row;
  } catch (error) {
    // 23505 = unique_violation. The email check comes first, matching the order the app shows the fields.
    if (error instanceof DatabaseError && error.code === '23505') {
      throw new DuplicateUserError(error.constraint === 'users_phone_key' ? 'phone' : 'email');
    }
    throw error;
  }
}

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  const result = await getPool().query<UserRecord>(`SELECT ${columns} FROM users WHERE email = $1`, [email]);
  return result.rows[0];
}

export async function findUserByPhone(phone: string): Promise<UserRecord | undefined> {
  const result = await getPool().query<UserRecord>(`SELECT ${columns} FROM users WHERE phone = $1`, [phone]);
  return result.rows[0];
}

/** Returns undefined for an unknown id, including text that is not a UUID. */
export async function findUserById(id: string): Promise<UserRecord | undefined> {
  const result = await getPool().query<UserRecord>(`SELECT ${columns} FROM users WHERE id::text = $1`, [id]);
  return result.rows[0];
}

export async function updateLanguage(id: string, language: Language): Promise<UserRecord | undefined> {
  const result = await getPool().query<UserRecord>(
    `UPDATE users SET language = $2 WHERE id = $1 RETURNING ${columns}`,
    [id, language],
  );
  return result.rows[0];
}

/**
 * Moves a vendor or partner from `from` to `to` in one statement, so two administrators deciding at the same time
 * cannot both succeed. Returns undefined when the user is not a vendor or partner in status `from`.
 */
export async function updateApplicantStatus(
  id: string,
  from: AccountStatus,
  to: AccountStatus,
): Promise<UserRecord | undefined> {
  const result = await getPool().query<UserRecord>(
    `UPDATE users SET status = $3
     WHERE id::text = $1 AND status = $2 AND role IN ('vendor', 'charity', 'composting', 'other')
     RETURNING ${columns}`,
    [id, from, to],
  );
  return result.rows[0];
}
