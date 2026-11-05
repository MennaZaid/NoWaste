// Shop opening hours (decision D-62, asked for by Maryam on 2026-10-31 and made required on 2026-11-03; not in the
// SRS yet, see "Document updates needed"). A vendor gives one opening time and one closing time for every day (Egypt
// time, the settings row LOCAL-TIME); a closing time earlier than the opening time means after midnight. A vendor
// registered before the hours were required cannot post food until the hours are set.
// A listing's pickup start must be inside an opening period of its branch (E-LST-04 pickupStart) and its pick-by time
// is capped at that period's closing time (D-64); a Quick Post must end inside the period (E-LST-04 pickupEnd). Tests come from FR-ACC-02 (vendor profile), FR-LST-01, FR-LST-02 and E-LST-04.
import request from 'supertest';
import { parseClockTime, validateOpeningHours, validateSignUp } from '@nowaste/shared';
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { clock } from '../src/domain/clock.js';
import { openingPeriodFor } from '../src/domain/openingHours.js';
import { clearOpeningHours, deleteAllUsers, readOpeningHours } from './helpers/database.js';
import { createVendor, get, listingBody, post, quickPostBody } from './helpers/listings.js';

const app = createApp();
const CAIRO = 'Africa/Cairo';
// 2026-11-01 10:00 UTC is 12:00 in Cairo (UTC+2 in November).
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

describe('FR-ACC-02 D-62 opening hours in the shared validator', () => {
  test.each<[unknown, string | null]>([
    ['09:00', '09:00'],
    ['9:00', '09:00'],
    [' 22:30 ', '22:30'],
    ['٠٩:٠٠', '09:00'],
    ['00:00', '00:00'],
    ['23:59', '23:59'],
    ['24:00', null],
    ['9:60', null],
    ['9', null],
    ['nine', null],
    [930, null],
  ])('FR-ACC-02 the time %j is read as %j', (input, expected) => {
    expect(parseClockTime(input)).toBe(expected);
  });

  test('E-ACC-02 opening hours are required: none at all marks both times', () => {
    expect(validateOpeningHours({})).toEqual({ ok: false, fields: ['opensAt', 'closesAt'] });
    expect(validateOpeningHours({ opensAt: ' ', closesAt: '' })).toEqual({
      ok: false,
      fields: ['opensAt', 'closesAt'],
    });
  });

  test('FR-ACC-02 both times are returned in HH:MM form', () => {
    expect(validateOpeningHours({ opensAt: '9:00', closesAt: '22:00' })).toEqual({
      ok: true,
      value: { opensAt: '09:00', closesAt: '22:00' },
    });
  });

  test('FR-ACC-02 a closing time after midnight (earlier than the opening time) is accepted', () => {
    expect(validateOpeningHours({ opensAt: '18:00', closesAt: '02:00' }).ok).toBe(true);
  });

  test.each<[Record<string, unknown>, string[]]>([
    [{ opensAt: '09:00' }, ['closesAt']],
    [{ closesAt: '22:00' }, ['opensAt']],
    [{ opensAt: '25:00', closesAt: '22:00' }, ['opensAt']],
    [{ opensAt: '09:00', closesAt: '09:00' }, ['closesAt']],
  ])('E-ACC-02 opening hours %j mark %j', (hours, fields) => {
    expect(validateOpeningHours(hours)).toEqual({ ok: false, fields });
  });

  test('FR-ACC-02 a vendor sign-up keeps the opening hours and needs them', () => {
    const base = {
      email: 'shop@example.com',
      password: 'abcd1234',
      language: 'en',
      role: 'vendor',
      vendorProfile: {
        shopName: 'Fatma Bakery',
        vendorType: 'formal',
        address: 'Dokki',
        latitude: 30,
        longitude: 31,
        contact: '01012345678',
      },
    };
    const withHours = validateSignUp({
      ...base,
      vendorProfile: { ...base.vendorProfile, opensAt: '8:00', closesAt: '23:00' },
    });
    const without = validateSignUp(base);

    expect(withHours.ok && withHours.value.vendorProfile).toMatchObject({
      opensAt: '08:00',
      closesAt: '23:00',
    });
    expect(without).toEqual({ ok: false, fields: ['opensAt', 'closesAt'] });
    expect(
      validateSignUp({ ...base, vendorProfile: { ...base.vendorProfile, opensAt: '8:00' } }),
    ).toMatchObject({ ok: false, fields: ['closesAt'] });
  });
});

describe('D-62 the opening period that contains a time (Egypt time)', () => {
  test('D-62 at 12:00 in Cairo, a shop open 09:00 to 22:00 is open from 07:00 to 20:00 UTC', () => {
    expect(openingPeriodFor(NOW, { opensAt: '09:00', closesAt: '22:00' }, CAIRO)).toEqual({
      opens: new Date('2026-11-01T07:00:00.000Z'),
      closes: new Date('2026-11-01T20:00:00.000Z'),
    });
  });

  test('D-62 a shop open after midnight (20:00 to 02:00) is open at 01:00 from the day before', () => {
    // 2026-11-01 23:00 UTC = 2026-11-02 01:00 in Cairo.
    expect(
      openingPeriodFor(new Date('2026-11-01T23:00:00.000Z'), { opensAt: '20:00', closesAt: '02:00' }, CAIRO),
    ).toEqual({ opens: new Date('2026-11-01T18:00:00.000Z'), closes: new Date('2026-11-02T00:00:00.000Z') });
  });

  test('D-62 the opening time is inside the period and the closing time is not', () => {
    const hours = { opensAt: '12:00', closesAt: '13:00' };
    expect(openingPeriodFor(NOW, hours, CAIRO)).not.toBeNull();
    expect(openingPeriodFor(new Date('2026-11-01T11:00:00.000Z'), hours, CAIRO)).toBeNull();
  });

  test('D-62 a time when the shop is closed has no period', () => {
    expect(openingPeriodFor(NOW, { opensAt: '18:00', closesAt: '23:00' }, CAIRO)).toBeNull();
  });

  test('D-62 summer time is followed (Cairo is UTC+3 in July)', () => {
    expect(
      openingPeriodFor(new Date('2026-07-01T10:00:00.000Z'), { opensAt: '09:00', closesAt: '22:00' }, CAIRO),
    ).toEqual({ opens: new Date('2026-07-01T06:00:00.000Z'), closes: new Date('2026-07-01T19:00:00.000Z') });
  });
});

// ---------------------------------------------------------------------------------------------------------------
// API, real database.

beforeAll(async () => {
  await deleteAllUsers();
});

beforeEach(() => {
  clock.now = () => NOW;
});

afterEach(() => {
  clock.now = realNow;
});

afterAll(async () => {
  await deleteAllUsers();
  await closePool();
});

describe('FR-ACC-02 D-62 the vendor gives and changes the opening hours', () => {
  test('FR-ACC-02 a vendor application with opening hours stores them', async () => {
    const vendor = await createVendor(app, 'formal', 'Pending', { opensAt: '9:00', closesAt: '22:00' });

    expect(await readOpeningHours(vendor.id)).toEqual({ opensAt: '09:00:00', closesAt: '22:00:00' });
  });

  test('E-ACC-02 a vendor application with only an opening time is refused', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({
        email: 'half-hours@example.com',
        password: 'abcd1234',
        language: 'en',
        role: 'vendor',
        vendorProfile: {
          shopName: 'Fatma Bakery',
          vendorType: 'formal',
          address: 'Dokki',
          latitude: 30,
          longitude: 31,
          contact: '01012345678',
          opensAt: '09:00',
        },
      });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['closesAt'] });
  });

  test('FR-ACC-02 GET /vendors/me returns the opening hours, or null for a vendor registered before D-62', async () => {
    const withHours = await createVendor(app, 'formal', 'Approved', { opensAt: '09:00', closesAt: '22:00' });
    const without = await createVendor(app);
    await clearOpeningHours(without.id);

    expect((await get(app, '/vendors/me', withHours.token)).body).toMatchObject({
      opensAt: '09:00',
      closesAt: '22:00',
    });
    expect((await get(app, '/vendors/me', without.token)).body).toMatchObject({
      opensAt: null,
      closesAt: null,
    });
  });

  test('FR-ACC-02 PATCH /vendors/me saves new opening hours', async () => {
    const vendor = await createVendor(app);

    const saved = await request(app)
      .patch('/vendors/me')
      .set('Authorization', `Bearer ${vendor.token}`)
      .send({ opensAt: '10:00', closesAt: '01:00' });

    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ opensAt: '10:00', closesAt: '01:00' });
  });

  test('E-ACC-02 PATCH /vendors/me cannot remove the opening hours', async () => {
    const vendor = await createVendor(app, 'formal', 'Approved', { opensAt: '09:00', closesAt: '22:00' });

    const response = await request(app)
      .patch('/vendors/me')
      .set('Authorization', `Bearer ${vendor.token}`)
      .send({ opensAt: '', closesAt: '' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['opensAt', 'closesAt'] });
    expect((await get(app, '/vendors/me', vendor.token)).body).toMatchObject({ opensAt: '09:00' });
  });

  test('FR-ACC-02 a vendor registered before D-62 can set the hours and then post food', async () => {
    const vendor = await createVendor(app);
    await clearOpeningHours(vendor.id);

    const saved = await request(app)
      .patch('/vendors/me')
      .set('Authorization', `Bearer ${vendor.token}`)
      .send({ opensAt: '00:00', closesAt: '23:59' });

    expect(saved.status).toBe(200);
  });

  test('E-ACC-02 PATCH /vendors/me with an invalid time marks it and changes nothing', async () => {
    const vendor = await createVendor(app, 'formal', 'Approved', { opensAt: '09:00', closesAt: '22:00' });

    const response = await request(app)
      .patch('/vendors/me')
      .set('Authorization', `Bearer ${vendor.token}`)
      .send({ opensAt: '09:00', closesAt: '26:00' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['closesAt'] });
    expect((await get(app, '/vendors/me', vendor.token)).body).toMatchObject({ closesAt: '22:00' });
  });
});

describe('E-LST-04 D-62 D-64 the pickup window is inside the opening hours', () => {
  // Packaged food lasts 720 h (D-60), so the pick-by time is decided by the closing time.
  async function listing(token: string, pickupStart: string) {
    return post(
      app,
      '/listings',
      token,
      await listingBody(app, token, at, { foodCategory: 'packaged_and_dry_food', pickupStart }),
    );
  }
  const pickupEndOf = (response: { body: unknown }) => (response.body as { pickupEnd: string }).pickupEnd;

  test('D-64 the pick-by time of long-lasting food is the closing time', async () => {
    // Open 09:00 to 13:00 Cairo: closes at 11:00 UTC = at(60).
    const vendor = await createVendor(app, 'formal', 'Approved', { opensAt: '09:00', closesAt: '13:00' });

    const response = await listing(vendor.token, at(10));

    expect(response.status).toBe(201);
    expect(pickupEndOf(response)).toBe(at(60));
  });

  test('E-LST-04 a pickup start at closing time is refused, one minute before is accepted', async () => {
    const vendor = await createVendor(app, 'formal', 'Approved', { opensAt: '09:00', closesAt: '13:00' });

    expect((await listing(vendor.token, at(59))).status).toBe(201);
    expect((await listing(vendor.token, at(60))).body).toEqual({
      error: 'E-LST-04',
      fields: ['pickupStart'],
      opensAt: '09:00',
      closesAt: '13:00',
    });
  });

  test('E-LST-04 a pickup start before opening time is refused', async () => {
    // Open 12:30 to 22:00 Cairo: opens at 10:30 UTC = at(30).
    const vendor = await createVendor(app, 'formal', 'Approved', { opensAt: '12:30', closesAt: '22:00' });

    const refused = await listing(vendor.token, at(10));
    const accepted = await listing(vendor.token, at(30));

    expect(refused.body).toEqual({
      error: 'E-LST-04',
      fields: ['pickupStart'],
      opensAt: '12:30',
      closesAt: '22:00',
    });
    expect(accepted.status).toBe(201);
  });

  test('D-64 a shop open after midnight is picked up by its closing time after midnight', async () => {
    // Open 11:00 to 01:00 Cairo: from 09:00 UTC today to 23:00 UTC = at(13 * 60).
    const vendor = await createVendor(app, 'formal', 'Approved', { opensAt: '11:00', closesAt: '01:00' });

    expect(pickupEndOf(await listing(vendor.token, at(10)))).toBe(at(13 * 60));
  });

  test('FR-LST-01 a vendor without opening hours (registered before D-62) cannot post a listing', async () => {
    const vendor = await createVendor(app);
    await clearOpeningHours(vendor.id);

    const response = await listing(vendor.token, at(10));

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'opening_hours_required' });
  });

  test('FR-LST-02 a vendor without opening hours cannot post a Quick Post', async () => {
    const vendor = await createVendor(app, 'informal');
    await clearOpeningHours(vendor.id);

    const response = await post(
      app,
      '/listings/quick',
      vendor.token,
      await quickPostBody(app, vendor.token, at, 60),
    );

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'opening_hours_required' });
  });

  test('FR-LST-02 a Quick Post must end by closing time', async () => {
    const vendor = await createVendor(app, 'informal', 'Approved', { opensAt: '09:00', closesAt: '13:00' });
    const quick = async (minutes: number) =>
      post(app, '/listings/quick', vendor.token, await quickPostBody(app, vendor.token, at, minutes));

    expect((await quick(60)).status).toBe(201);
    expect((await quick(61)).body).toEqual({
      error: 'E-LST-04',
      fields: ['pickupEnd'],
      opensAt: '09:00',
      closesAt: '13:00',
    });
  });

  // D-75: the Quick Post pickup starts now (or at the chosen start), so the closed shop is reported on the start.
  test('FR-LST-02 D-75 a Quick Post while the shop is closed is refused on the pickup start', async () => {
    const vendor = await createVendor(app, 'informal', 'Approved', { opensAt: '18:00', closesAt: '23:00' });

    const response = await post(
      app,
      '/listings/quick',
      vendor.token,
      await quickPostBody(app, vendor.token, at, 60),
    );

    expect(response.body).toMatchObject({ error: 'E-LST-04', fields: ['pickupStart'], opensAt: '18:00' });
  });
});
