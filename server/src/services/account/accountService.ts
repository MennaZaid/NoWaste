// C-03 Account Service: sign-up for consumers (US-01, FR-ACC-01), vendors (US-02, FR-ACC-02) and charity or
// composting partners (US-03, FR-ACC-03), with E-ACC-01, E-ACC-02 and NFR-09b.
// Consumers are Active at once; vendors and partners are Pending until an administrator reviews them (US-07).
// Administrator accounts are created by the team, never here (SRS 2.7).
import bcrypt from 'bcryptjs';
import { validateSignUp, type SignUpInput, type SignUpRole } from '@nowaste/shared';
import { SrsError } from '../../domain/errors.js';
import { DuplicateUserError, insertUser, type NewUser, type UserRecord } from '../../data/userRepository.js';
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
