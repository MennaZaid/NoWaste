// C-03 Account Service, login and logout (US-04, FR-ACC-04), with the C-02 session and lockout rules: E-ACC-03 (the
// same answer for every wrong credential), NFR-09d (lockout read from the settings table) and IF-COM-03 (a token
// whose session ended at logout is refused). Pending and Rejected vendors and partners may log in to see their
// status (E-ACC-05); Removed accounts may not (E-ACC-06).
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parseLoginIdentifier } from '@nowaste/shared';
import { loadConfig } from '../../config/index.js';
import { BCRYPT_COST } from '../../config/security.js';
import { clock } from '../../domain/clock.js';
import { SrsError } from '../../domain/errors.js';
import { insertLoginAttempt, recentFailures } from '../../data/loginAttemptRepository.js';
import { endSession, findSession, insertSession } from '../../data/sessionRepository.js';
import { getSetting } from '../../data/settingsRepository.js';
import {
  findUserByEmail,
  findUserById,
  findUserByPhone,
  type Language,
  type Role,
  type AccountStatus,
  type UserRecord,
} from '../../data/userRepository.js';

export interface SessionUser {
  id: string;
  role: Role;
  status: AccountStatus;
  language: Language;
}

export interface LoginResult {
  token: string;
  user: SessionUser;
}

export interface Authenticated {
  user: UserRecord;
  jti: string;
}

const invalidCredentials = () => new SrsError(401, { error: 'E-ACC-03' });
const unauthorized = () => new SrsError(401, { error: 'unauthorized' });

interface LockoutRule {
  maxFailed: number;
  withinMs: number;
  lockMs: number;
}

async function lockoutRule(): Promise<LockoutRule> {
  const value = (await getSetting('NFR-09d'))?.value as Record<string, unknown> | undefined;
  const { max_failed_logins: max, within_minutes: within, lock_minutes: lock } = value ?? {};
  if (typeof max !== 'number' || typeof within !== 'number' || typeof lock !== 'number') {
    throw new Error('The NFR-09d settings row is missing or incomplete');
  }
  return { maxFailed: max, withinMs: within * 60_000, lockMs: lock * 60_000 };
}

/** NFR-09d: locked while the newest failure is less than lockMs ago and it completed maxFailed within withinMs. */
function isLocked(failures: Date[], now: Date, rule: LockoutRule): boolean {
  if (failures.length < rule.maxFailed) return false;
  const newest = failures[0] as Date;
  const oldest = failures[rule.maxFailed - 1] as Date;
  return (
    newest.getTime() - oldest.getTime() <= rule.withinMs && now.getTime() - newest.getTime() < rule.lockMs
  );
}

// Unknown accounts are checked against this hash too, so a wrong email takes as long as a wrong password.
let dummyHash: Promise<string> | undefined;
async function compareWithDummy(password: string): Promise<void> {
  dummyHash ??= bcrypt.hash(randomUUID(), BCRYPT_COST);
  await bcrypt.compare(password, await dummyHash);
}

function toSessionUser(user: UserRecord): SessionUser {
  return { id: user.id, role: user.role, status: user.status, language: user.language };
}

export async function logIn(emailOrPhone: unknown, password: unknown): Promise<LoginResult> {
  const identifier = parseLoginIdentifier(emailOrPhone);
  const secret = typeof password === 'string' ? password : '';
  const user =
    identifier === null
      ? undefined
      : 'email' in identifier
        ? await findUserByEmail(identifier.email)
        : await findUserByPhone(identifier.phone);

  if (user === undefined || user.status === 'Removed' || typeof password !== 'string') {
    await compareWithDummy(secret);
    throw invalidCredentials();
  }

  const now = clock.now();
  const rule = await lockoutRule();
  const passwordMatches = await bcrypt.compare(secret, user.passwordHash);
  // While locked even the right password is refused, and the attempt is not counted, so the lock does not grow.
  if (isLocked(await recentFailures(user.id, now, rule.maxFailed), now, rule)) {
    throw invalidCredentials();
  }
  await insertLoginAttempt(user.id, now, passwordMatches);
  if (!passwordMatches) throw invalidCredentials();

  const jti = randomUUID();
  await insertSession(jti, user.id, now);
  const token = jwt.sign({ role: user.role }, loadConfig().jwtSecret, {
    algorithm: 'HS256',
    subject: user.id,
    jwtid: jti,
  });
  return { token, user: toSessionUser(user) };
}

/** IF-COM-03: checks the Bearer token of a request and returns its user and session id. */
export async function authenticate(authorization: string | undefined): Promise<Authenticated> {
  const match = /^Bearer (\S+)$/.exec(authorization ?? '');
  if (match === null) throw unauthorized();
  let payload: jwt.JwtPayload;
  try {
    const decoded = jwt.verify(match[1] as string, loadConfig().jwtSecret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string') throw unauthorized();
    payload = decoded;
  } catch {
    throw unauthorized();
  }
  const { sub, jti } = payload;
  if (typeof sub !== 'string' || typeof jti !== 'string') throw unauthorized();

  const session = await findSession(jti).catch(() => undefined);
  if (session === undefined || session.endedAt !== null || session.userId !== sub) throw unauthorized();
  const user = await findUserById(sub);
  // E-ACC-06: a Removed account no longer has valid access credentials.
  if (user === undefined || user.status === 'Removed') throw unauthorized();
  return { user, jti };
}

export async function logOut(jti: string): Promise<void> {
  await endSession(jti, clock.now());
}
