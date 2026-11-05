// US-18 Perishability category and pickup urgency (SDD C-06, section 5.1). Tests come from FR-RTE-01, FR-RTE-02,
// FR-RTE-03, FR-RTE-04, E-RTE-01, NFR-05d and BR-01. The rules are pure functions (first part); the API part runs
// against the real nowaste_test database with a fixed clock.
import request from 'supertest';
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { clock } from '../src/domain/clock.js';
import {
  estimate,
  foodLimit,
  pickBy,
  type EstimateInput,
  type Thresholds,
} from '../src/domain/perishability.js';
import {
  deleteAllUsers,
  listPerishabilityRules,
  readSettingValue,
  setSettingValue,
  setShelfLife,
  setUserStatus,
} from './helpers/database.js';
import { createAccount, tokenFor } from './helpers/accounts.js';
import { createDraft, createVendor, get, post, quickPostBody } from './helpers/listings.js';

const NOW = new Date('2026-11-01T10:00:00.000Z');
const hoursFromNow = (hours: number, minutes = 0) =>
  new Date(NOW.getTime() + (hours * 60 + minutes) * 60_000);
const THRESHOLDS: Thresholds = { highlyPerishableMaxHours: 6, shortLifeMaxHours: 48 };

/** Every input known and long-lasting, picked up from now: Long-life unless a test changes one input. */
function known(overrides: Partial<EstimateInput> = {}): EstimateInput {
  return {
    foodCategory: 'packaged_and_dry_food',
    storage: 'room_temperature',
    pickupStart: NOW,
    isQuickPost: false,
    aiConfident: true,
    ...overrides,
  };
}

const rules = (shelfLifeHours: number | null = 24 * 30) => ({
  now: NOW,
  thresholds: THRESHOLDS,
  shelfLifeHours,
});

describe('NFR-05d FR-RTE-02 missing or uncertain information gives Highly perishable', () => {
  test('NFR-05d with every input known and far away, the estimate is Long-life (the control case)', () => {
    expect(estimate(known(), rules()).category).toBe('Long-life');
  });

  test.each<[string, Partial<EstimateInput>]>([
    ['storage Unknown', { storage: 'unknown' }],
    ['food category Unknown', { foodCategory: 'unknown' }],
    ['an uncertain estimate (not confident)', { aiConfident: false }],
  ])('NFR-05d a listing with %s is Highly perishable', (_name, missing) => {
    expect(estimate(known(missing), rules()).category).toBe('Highly perishable');
  });

  test('FR-RTE-02 a Quick Post is always Highly perishable', () => {
    expect(estimate(known({ isQuickPost: true }), rules()).category).toBe('Highly perishable');
  });
});

describe('BR-01 boundaries: Highly perishable up to 6 h, Short-life up to 48 h, Long-life above', () => {
  // D-71: the hours are counted from the pickup start, so the shelf-life decides the category.
  test.each<[string, number, string]>([
    ['5 h 59 min', 5 + 59 / 60, 'Highly perishable'],
    ['6 h 00 min', 6, 'Highly perishable'],
    ['6 h 01 min', 6 + 1 / 60, 'Short-life'],
    ['47 h 59 min', 47 + 59 / 60, 'Short-life'],
    ['48 h 00 min', 48, 'Short-life'],
    ['48 h 01 min', 48 + 1 / 60, 'Long-life'],
  ])('BR-01 %s from the pickup start is %s', (_left, shelfLife, category) => {
    expect(estimate(known({ pickupStart: hoursFromNow(20) }), rules(shelfLife)).category).toBe(category);
  });

  test('BR-01 a limit already passed is Highly perishable', () => {
    expect(estimate(known({ pickupStart: hoursFromNow(-3) }), rules(1)).category).toBe('Highly perishable');
  });

  test('BR-01 D-71 a pickup that has already started counts the hours from now (never less urgent)', () => {
    // Started 30 h ago with a 40 h shelf-life: 10 h left now, Short-life (not Long-life from the 40 h).
    expect(estimate(known({ pickupStart: hoursFromNow(-30) }), rules(40)).category).toBe('Short-life');
  });
});

describe('FR-RTE-01 D-71 the category does not depend on how early the listing is saved', () => {
  test('FR-RTE-01 D-71 a cooked meal at room temperature (2 h) for tomorrow is Highly perishable', () => {
    expect(estimate(known({ pickupStart: hoursFromNow(24) }), rules(2)).category).toBe('Highly perishable');
  });

  test('FR-RTE-01 D-71 the same food saved 1 hour or 3 days before the pickup gets the same category', () => {
    for (const shelfLife of [2, 24, 72]) {
      expect(estimate(known({ pickupStart: hoursFromNow(1) }), rules(shelfLife)).category).toBe(
        estimate(known({ pickupStart: hoursFromNow(72) }), rules(shelfLife)).category,
      );
    }
  });
});

describe('FR-RTE-01 D-64 the food limit is the pickup start + the shelf-life', () => {
  test('FR-RTE-01 the limit counts from the pickup start, not from now', () => {
    expect(foodLimit(known({ pickupStart: hoursFromNow(2) }), rules(30))).toEqual(hoursFromNow(32));
    // D-71: 30 h from the pickup start: Short-life.
    expect(estimate(known({ pickupStart: hoursFromNow(2) }), rules(30)).category).toBe('Short-life');
  });

  test('FR-RTE-01 a shelf-life that is not set (NULL) gives no limit and Highly perishable, the safest result', () => {
    expect(foodLimit(known(), rules(null))).toBeNull();
    expect(estimate(known(), rules(null)).category).toBe('Highly perishable');
  });
});

describe('D-64 the pick-by time: start + shelf-life, or start + 6 h when unknown, never after closing', () => {
  const start = hoursFromNow(1);

  test('D-64 with every input known it is the pickup start + the shelf-life', () => {
    expect(pickBy(known({ pickupStart: start }), rules(2), null)).toEqual(hoursFromNow(3));
  });

  test.each<[string, Partial<EstimateInput>, number | null]>([
    ['storage Unknown', { storage: 'unknown' }, 2],
    ['food category Unknown', { foodCategory: 'unknown' }, 2],
    ['an empty (NULL) shelf-life', {}, null],
    ['a Quick Post', { isQuickPost: true }, 2],
  ])('FR-RTE-02 with %s it is the pickup start + 6 hours (BR-01)', (_name, unknown, shelfLife) => {
    expect(pickBy(known({ pickupStart: start, ...unknown }), rules(shelfLife), null)).toEqual(
      hoursFromNow(7),
    );
  });

  test('D-64 a pick-by later than the closing time is set to the closing time', () => {
    expect(pickBy(known({ pickupStart: start }), rules(24), hoursFromNow(5))).toEqual(hoursFromNow(5));
  });

  test('D-64 a closing time later than the pick-by does not change it', () => {
    expect(pickBy(known({ pickupStart: start }), rules(2), hoursFromNow(5))).toEqual(hoursFromNow(3));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// API (C-06 through the Listing routes), real database.

const app = createApp();
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();
// Full listings are for formal vendors and Quick Posts for informal vendors (D-64).
let vendor: { id: string; token: string };
let informal: { id: string; token: string };
let savedBr01: unknown;
let savedRules: Awaited<ReturnType<typeof listPerishabilityRules>>;

beforeAll(async () => {
  await deleteAllUsers();
  vendor = await createVendor(app, 'formal');
  informal = await createVendor(app, 'informal');
  savedBr01 = await readSettingValue('BR-01');
  savedRules = await listPerishabilityRules();
});

beforeEach(() => {
  clock.now = () => NOW;
});

afterEach(async () => {
  clock.now = realNow;
  await setSettingValue('BR-01', savedBr01);
  // Tests change single shelf-lives; put every row back as it was.
  for (const { foodCategory, storage, shelfLifeHours } of savedRules) {
    await setShelfLife(foodCategory, storage, shelfLifeHours);
  }
});

afterAll(async () => {
  await deleteAllUsers();
  await closePool();
});

const estimateFor = (id: string, token = vendor.token) =>
  post(app, `/listings/${id}/perishability/estimate`, token);
const quickPost = async () =>
  post(app, '/listings/quick', informal.token, await quickPostBody(app, informal.token, at));

describe('[FEEDBACK CHANGE] the rules come from tables, not from code', () => {
  // D-60: the proposed shelf-lives in hours (team approval needed; open question 48).
  const PROPOSED: Record<string, Record<string, number>> = {
    bread_and_baked_goods: { room_temperature: 48, chilled: 120, frozen: 720 },
    cooked_meals: { room_temperature: 2, chilled: 72, frozen: 720 },
    fruit_and_vegetables: { room_temperature: 48, chilled: 120, frozen: 720 },
    dairy_and_eggs: { room_temperature: 2, chilled: 120, frozen: 720 },
    meat_poultry_and_fish: { room_temperature: 2, chilled: 24, frozen: 720 },
    packaged_and_dry_food: { room_temperature: 720, chilled: 720, frozen: 720 },
  };

  test('FR-RTE-01 perishability_rules has one row per food category and storage, with the D-60 shelf-lives', async () => {
    const rows = await listPerishabilityRules();
    expect(rows).toHaveLength(18);
    expect(new Set(rows.map((r) => r.storage))).toEqual(new Set(['room_temperature', 'chilled', 'frozen']));
    expect(new Set(rows.map((r) => r.foodCategory)).size).toBe(6);
    for (const row of rows) {
      expect([row.foodCategory, row.storage, row.shelfLifeHours]).toEqual([
        row.foodCategory,
        row.storage,
        PROPOSED[row.foodCategory]?.[row.storage],
      ]);
    }
  });

  test.each<[string, string, Record<string, unknown>]>([
    // D-71: the time left is counted from the pickup start (now + 10 min), so the shelf-life decides.
    ['cooked meals at room temperature (2 h from the pickup start)', 'Highly perishable', {}],
    ['meat kept chilled (24 h)', 'Short-life', { foodCategory: 'meat_poultry_and_fish', storage: 'chilled' }],
    ['cooked meals kept chilled (72 h)', 'Long-life', { storage: 'chilled' }],
    ['bread at room temperature (48 h, D-71)', 'Short-life', { foodCategory: 'bread_and_baked_goods' }],
    ['storage Unknown', 'Highly perishable', { storage: 'unknown', foodCategory: 'packaged_and_dry_food' }],
  ])('FR-RTE-01 with the D-60 shelf-lives, %s is %s', async (_name, category, overrides) => {
    const id = await createDraft(app, vendor.token, at, overrides);

    expect(((await estimateFor(id)).body as { category: string }).category).toBe(category);
  });

  test('FR-RTE-01 a shelf-life that is empty (NULL) still gives Highly perishable, the safest result', async () => {
    await setShelfLife('cooked_meals', 'room_temperature', null);
    const id = await createDraft(app, vendor.token, at);

    const response = await estimateFor(id);

    // No shelf-life: the pick-by time is the start + 6 hours (BR-01).
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ category: 'Highly perishable', urgency: { collectBy: at(10 + 360) } });
  });

  test('FR-RTE-01 once the team fills a shelf-life, the estimate uses it (shelf-life 30 h)', async () => {
    await setShelfLife('cooked_meals', 'room_temperature', 30);
    const id = await createDraft(app, vendor.token, at);

    // Starts in 10 min + 30 hours = 30 h 10 min left: Short-life. The pick-by is capped at closing (D-64).
    expect((await estimateFor(id)).body).toEqual({
      category: 'Short-life',
      urgency: { collectBy: at(719) },
    });
  });

  test('BR-01 changing the BR-01 row in settings changes the result without changing code', async () => {
    await setShelfLife('cooked_meals', 'room_temperature', 30);
    const id = await createDraft(app, vendor.token, at);
    expect(((await estimateFor(id)).body as { category: string }).category).toBe('Short-life');

    await setSettingValue('BR-01', { highly_perishable_max_hours: 6, short_life_max_hours: 24 });

    expect((await estimateFor(id)).body).toEqual({
      category: 'Long-life',
      urgency: { collectBy: at(719) },
    });
  });

  test('FR-RTE-02 a Quick Post is estimated Highly perishable', async () => {
    const quick = await quickPost();

    const estimated = await estimateFor((quick.body as { id: string }).id, informal.token);
    expect((estimated.body as { category: string }).category).toBe('Highly perishable');
  });
});

describe('E-RTE-01 a failing estimate gives Highly perishable and the vendor continues', () => {
  test('E-RTE-01 when the BR-01 rule cannot be read, the estimate is Highly perishable, not an error', async () => {
    await setShelfLife('cooked_meals', 'room_temperature', 30);
    const id = await createDraft(app, vendor.token, at);
    await setSettingValue('BR-01', {});

    const response = await estimateFor(id);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ category: 'Highly perishable' });

    await setSettingValue('BR-01', savedBr01);
    // D-72: the vendor continues straight to the destination.
    const chosen = await post(app, `/listings/${id}/destination`, vendor.token, { destination: 'consumers' });
    expect(chosen.status).toBe(200);
  });
});

// D-72 (2026-11-05, asked for by Maryam): the vendor no longer confirms or changes the category; it is the estimate set
// on saving (D-70). A vendor who wants the food collected sooner chooses an earlier pickup end (D-69).
describe('FR-RTE-03 FR-RTE-04 D-72 the category is the estimate; the vendor does not change it', () => {
  test('FR-RTE-03 D-72 there is no confirm step: POST /listings/:id/perishability/confirm does not exist', async () => {
    const id = await createDraft(app, vendor.token, at);

    const response = await post(app, `/listings/${id}/perishability/confirm`, vendor.token, {
      category: 'Highly perishable',
    });

    expect(response.status).toBe(404);
  });

  test('FR-RTE-04 GET /listings/:id returns the saved category and the collect-by time (the pickup end)', async () => {
    await setShelfLife('cooked_meals', 'room_temperature', 24 * 30);
    const id = await createDraft(app, vendor.token, at);

    const response = await get(app, `/listings/${id}`, vendor.token);

    expect(response.body).toMatchObject({
      perishabilityCategory: 'Long-life',
      urgency: { collectBy: at(719) },
    });
  });

  test('FR-RTE-04 D-70 a saved listing already has its estimated category and collect-by time', async () => {
    const id = await createDraft(app, vendor.token, at);

    expect((await get(app, `/listings/${id}`, vendor.token)).body).toMatchObject({
      perishabilityCategory: 'Highly perishable',
      urgency: { collectBy: at(130) },
    });
  });

  test("FR-RTE-01 a vendor cannot estimate another vendor's listing", async () => {
    const other = await createVendor(app);
    const id = await createDraft(app, vendor.token, at);

    expect((await post(app, `/listings/${id}/perishability/estimate`, other.token)).status).toBe(404);
  });

  test('FR-RTE-04 a Quick Post shows Highly perishable with its collect-by time', async () => {
    const quick = await quickPost();

    expect(quick.body).toMatchObject({
      perishabilityCategory: 'Highly perishable',
      urgency: { collectBy: at(120) },
    });
  });
});

describe('E-LST-06 only approved vendors may estimate', () => {
  test('E-LST-06 a vendor who became Rejected cannot estimate a Draft', async () => {
    const pending = await createVendor(app);
    const id = await createDraft(app, pending.token, at);
    await setUserStatus(pending.id, 'Rejected');

    const response = await request(app)
      .post(`/listings/${id}/perishability/estimate`)
      .set('Authorization', `Bearer ${pending.token}`);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'E-LST-06' });
  });
});

// D-70 (2026-11-04, asked for by Maryam): users see what each category means in hours. The hours are the BR-01
// settings row, so the app reads them from the server instead of writing them into its texts.
describe('BR-01 D-70 the hours of each category (GET /perishability/categories)', () => {
  test('BR-01 every logged-in user gets the BR-01 hours', async () => {
    const consumer = await createAccount(app, 'consumer');
    const token = await tokenFor(app, consumer.email);

    for (const who of [token, vendor.token]) {
      const response = await get(app, '/perishability/categories', who);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ highlyPerishableMaxHours: 6, shortLifeMaxHours: 48 });
    }
  });

  test('BR-01 changing the BR-01 row changes the hours without changing code', async () => {
    await setSettingValue('BR-01', { highly_perishable_max_hours: 4, short_life_max_hours: 24 });

    expect((await get(app, '/perishability/categories', vendor.token)).body).toEqual({
      highlyPerishableMaxHours: 4,
      shortLifeMaxHours: 24,
    });
  });
});
