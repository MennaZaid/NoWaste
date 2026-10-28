// Test accounts for the login, RBAC and approval tests. Vendors and partners apply through POST /auth/register
// like real users; administrators are inserted directly, as the team does (SRS 2.7).
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { Express } from 'express';
import { insertAdmin, setUserStatus } from './database.js';

export const PASSWORD = 'abcd1234';

/** The four role groups of NFR-09c. Charity, composting and other partners all count as "partner". */
export type RoleGroup = 'consumer' | 'vendor' | 'partner' | 'admin';

export interface TestAccount {
  id: string;
  email: string;
  role: string;
}

const vendorProfile = {
  shopName: 'Fatma Bakery',
  vendorType: 'formal',
  address: '12 Tahrir Street, Dokki, Giza',
  latitude: 30.0381,
  longitude: 31.2122,
  contact: '01012345678',
};

const partnerProfile = {
  organisationName: 'Giza Food Bank',
  address: '5 Nile Corniche, Giza',
  latitude: 30.0131,
  longitude: 31.2089,
  acceptedFoodTypes: ['cooked_meals'],
};

/**
 * Creates an account of the given group. Vendors and partners start Pending; pass `status` to move them on
 * (for example Approved) without going through the admin API.
 */
export async function createAccount(
  app: Express,
  group: RoleGroup,
  options: { email?: string; phone?: string; status?: string; partnerRole?: string } = {},
): Promise<TestAccount> {
  const email = options.email ?? `${group}-${Math.random().toString(36).slice(2, 10)}@example.com`;
  let id: string;
  let role: string;
  if (group === 'admin') {
    id = await insertAdmin(email, await bcrypt.hash(PASSWORD, 4));
    role = 'admin';
  } else {
    role = group === 'partner' ? (options.partnerRole ?? 'charity') : group;
    const login = options.phone !== undefined ? { phone: options.phone } : { email };
    const response = await request(app)
      .post('/auth/register')
      .send({
        ...login,
        password: PASSWORD,
        language: 'ar',
        role,
        ...(group === 'vendor' ? { vendorProfile } : {}),
        ...(group === 'partner'
          ? {
              partnerProfile: {
                ...partnerProfile,
                ...(role === 'other' ? { otherPartnerType: 'Mosque' } : {}),
              },
            }
          : {}),
      });
    if (response.status !== 201) throw new Error(`register failed: ${JSON.stringify(response.body)}`);
    id = (response.body as { id: string }).id;
  }
  if (options.status !== undefined) await setUserStatus(id, options.status);
  return { id, email, role };
}

/** Logs in and returns the access token. */
export async function tokenFor(app: Express, emailOrPhone: string, password = PASSWORD): Promise<string> {
  const response = await request(app).post('/auth/login').send({ emailOrPhone, password });
  if (response.status !== 200) throw new Error(`login failed: ${JSON.stringify(response.body)}`);
  return (response.body as { token: string }).token;
}
