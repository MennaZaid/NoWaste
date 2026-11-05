// Vendors, partners and listings for the perishability (US-18) and routing (US-19) tests. Accounts apply through
// POST /auth/register like real users; their status is then set directly, as the approval tests do.
import request from 'supertest';
import type { Express } from 'express';
import { PASSWORD, tokenFor } from './accounts.js';
import { setUserStatus } from './database.js';

export const SHOP = { latitude: 30.0381, longitude: 31.2122 };

/** The smallest JPEG header, padded to 2 KB. */
export function jpeg(): Buffer {
  const bytes = Buffer.alloc(2048);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

export async function createVendor(
  app: Express,
  vendorType: 'formal' | 'informal' = 'formal',
  status = 'Approved',
  profile: Record<string, unknown> = {},
): Promise<{ id: string; token: string }> {
  const email = uniqueEmail(vendorType);
  const response = await request(app)
    .post('/auth/register')
    .send({
      email,
      password: PASSWORD,
      language: 'en',
      role: 'vendor',
      vendorProfile: {
        shopName: 'Fatma Bakery',
        vendorType,
        address: '12 Tahrir Street, Dokki, Giza',
        ...SHOP,
        contact: '01012345678',
        // D-62: opening hours are required; the whole day unless a test gives its own.
        opensAt: '00:00',
        closesAt: '23:59',
        ...profile,
      },
    });
  if (response.status !== 201) throw new Error(`vendor register failed: ${JSON.stringify(response.body)}`);
  const id = (response.body as { id: string }).id;
  await setUserStatus(id, status);
  return { id, token: await tokenFor(app, email) };
}

/** A charity or composting partner at the given place, accepting the given food types. */
export async function createPartner(
  app: Express,
  role: 'charity' | 'composting',
  options: { status?: string; acceptedFoodTypes?: string[]; latitude?: number; longitude?: number } = {},
): Promise<string> {
  const response = await request(app)
    .post('/auth/register')
    .send({
      email: uniqueEmail(role),
      password: PASSWORD,
      language: 'en',
      role,
      partnerProfile: {
        organisationName: role === 'charity' ? 'Giza Food Bank' : 'Green Compost',
        address: '5 Nile Corniche, Giza',
        latitude: options.latitude ?? 30.0131,
        longitude: options.longitude ?? 31.2089,
        acceptedFoodTypes: options.acceptedFoodTypes ?? ['cooked_meals'],
      },
    });
  if (response.status !== 201) throw new Error(`partner register failed: ${JSON.stringify(response.body)}`);
  const id = (response.body as { id: string }).id;
  await setUserStatus(id, options.status ?? 'Approved');
  return id;
}

export async function photoKeyFor(app: Express, token: string): Promise<string> {
  const response = await request(app)
    .post('/listings/photo')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'image/jpeg')
    .send(jpeg());
  return (response.body as { photoKey: string }).photoKey;
}

export function post(app: Express, path: string, token: string, body: unknown = {}) {
  return request(app)
    .post(path)
    .set('Authorization', `Bearer ${token}`)
    .send(body as object);
}

export function get(app: Express, path: string, token: string) {
  return request(app).get(path).set('Authorization', `Bearer ${token}`);
}

/** D-64: the id of the vendor's first (main) branch, the shop given at sign-up. */
export async function mainBranchId(app: Express, token: string): Promise<string> {
  const response = await get(app, '/vendors/me', token);
  const branches = (response.body as { branches?: { id: string }[] }).branches ?? [];
  if (branches[0] === undefined) throw new Error(`no branch: ${JSON.stringify(response.body)}`);
  return branches[0].id;
}

/**
 * A valid full listing body (D-63, D-64): cooked meals at room temperature (D-60 shelf-life 2 h), written in
 * English, starting at now + 10 min at the vendor's main branch. `overrides` replace any field.
 */
export async function listingBody(
  app: Express,
  token: string,
  at: (minutes: number) => string,
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  return {
    photoKey: await photoKeyFor(app, token),
    name: 'Koshari',
    description: 'Fresh koshari with crispy onions',
    language: 'en',
    foodCategory: 'cooked_meals',
    storage: 'room_temperature',
    bagsTotal: 3,
    originalValue: 100,
    price: 40,
    pickupStart: at(10),
    branchId: await mainBranchId(app, token),
    ...overrides,
  };
}

/** Saves a full Draft listing (formal vendors); `overrides` replace any field. Returns the listing id. */
export async function createDraft(
  app: Express,
  token: string,
  at: (minutes: number) => string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const response = await post(app, '/listings', token, await listingBody(app, token, at, overrides));
  if (response.status !== 201) throw new Error(`listing failed: ${JSON.stringify(response.body)}`);
  return (response.body as { id: string }).id;
}

/** A valid Quick Post body (informal vendors, D-63): ends at now + `minutes`. */
export async function quickPostBody(
  app: Express,
  token: string,
  at: (minutes: number) => string,
  minutes = 120,
): Promise<Record<string, unknown>> {
  return {
    photoKey: await photoKeyFor(app, token),
    name: 'Mixed pastries',
    description: 'Pastries from this morning',
    language: 'en',
    bagsTotal: 2,
    price: 15,
    pickupEnd: at(minutes),
  };
}

/** D-72: the category is set on saving, so only the destination (consumers) is chosen before publishing. */
export async function readyToPublish(app: Express, token: string, id: string): Promise<void> {
  const chosen = await post(app, `/listings/${id}/destination`, token, { destination: 'consumers' });
  if (chosen.status !== 200) throw new Error(`destination failed: ${JSON.stringify(chosen.body)}`);
}
