// C-03 Account Service: sign-up for consumers (US-01, FR-ACC-01), vendors (US-02, FR-ACC-02) and charity or
// composting partners (US-03, FR-ACC-03), with E-ACC-01, E-ACC-02 and NFR-09b.
// Consumers are Active at once; vendors and partners are Pending until an administrator reviews them (US-07).
// Administrator accounts are created by the team, never here (SRS 2.7). Also the user's own account (GET and PATCH
// /users/me, FR-ACC-09). Login and logout are in authService.ts.
import bcrypt from 'bcryptjs';
import {
  LANGUAGES,
  validateRegistration,
  validateSignUp,
  type Language,
  type SignUpInput,
  type SignUpRole,
} from '@nowaste/shared';
import { SrsError } from '../../domain/errors.js';
import {
  DuplicateUserError,
  insertUser,
  updateLanguage,
  type NewUser,
  type UserRecord,
} from '../../data/userRepository.js';
import { insertPartnerApplication, insertVendorApplication } from '../../data/profileRepository.js';
import { BCRYPT_COST } from '../../config/security.js';

export interface SignedUpUser {
  id: string;
  role: SignUpRole;
  status: 'Active' | 'Pending';
}

export async function signUp(input: SignUpInput): Promise<SignedUpUser> {
  const validation = validateSignUp(input);
  if (!validation.ok) {
    // E-ACC-02: identify every invalid field and create nothing.
    throw new SrsError(400, { error: 'E-ACC-02', fields: validation.fields });
  }

  const { email, phone, password, language, role, vendorProfile, partnerProfile } = validation.value;
  const status = role === 'consumer' ? 'Active' : 'Pending';
  // NFR-09b: bcrypt adds a random salt to every hash.
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const user: NewUser = { email, phone, passwordHash, role, status, language };

  let created: UserRecord;
  try {
    if (vendorProfile !== null) {
      created = await insertVendorApplication(user, vendorProfile);
    } else if (partnerProfile !== null && role !== 'consumer' && role !== 'vendor') {
      created = await insertPartnerApplication(user, { ...partnerProfile, partnerType: role });
    } else {
      created = await insertUser(user);
    }
  } catch (error) {
    if (error instanceof DuplicateUserError) {
      // E-ACC-01: the app then offers Log in and Reset password.
      throw new SrsError(409, { error: 'E-ACC-01', field: error.field });
    }
    throw error;
  }
  return { id: created.id, role, status };
}

export interface Me {
  id: string;
  role: SignUpRole | 'admin';
  status: UserRecord['status'];
  language: UserRecord['language'];
  email: string | null;
  phone: string | null;
}

function toMe(user: UserRecord): Me {
  return {
    id: user.id,
    role: user.role,
    status: user.status,
    language: user.language,
    email: user.email,
    phone: user.phone,
  };
}

/** GET /users/me. */
export function getMe(user: UserRecord): Me {
  return toMe(user);
}

/** PATCH /users/me: saves the language on the account (FR-ACC-09, decision D-16). */
export async function setLanguage(user: UserRecord, language: unknown): Promise<Me> {
  if (!LANGUAGES.includes(language as Language)) {
    throw new SrsError(400, { error: 'invalid_input', fields: ['language'] });
  }
  const updated = await updateLanguage(user.id, language as Language);
  return toMe(updated ?? user);
}

/**
 * SRS 2.7: the team creates administrator accounts (npm run seed:admin). The email and password follow the US-01
 * rules; the account is Active at once.
 */
export async function createAdmin(input: {
  email: unknown;
  password: unknown;
  language?: unknown;
}): Promise<{ id: string; role: 'admin'; status: 'Active' }> {
  const validation = validateRegistration({ ...input, language: input.language ?? 'en' });
  if (!validation.ok) throw new SrsError(400, { error: 'E-ACC-02', fields: validation.fields });
  const { email, phone, password, language } = validation.value;
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  try {
    const created = await insertUser({
      email,
      phone,
      passwordHash,
      role: 'admin',
      status: 'Active',
      language,
    });
    return { id: created.id, role: 'admin', status: 'Active' };
  } catch (error) {
    if (error instanceof DuplicateUserError)
      throw new SrsError(409, { error: 'E-ACC-01', field: error.field });
    throw error;
  }
}
