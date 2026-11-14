// US-26 map search (FR-RES-01) with the US-20 / US-21 order (FR-RTE-08, FR-RTE-09), decision D-65: a consumer sees
// the Active Discounted Surplus Bags within a distance of their location, as offers grouped by branch on the map.
// GET /listings/nearby?latitude&longitude&radiusKm (SDD 3.2.3 IApi), GET /listings/nearby/:id and its photo. The
// radius limits come from the settings row FR-RES-01 (default 10 km, 1 to 50 km). Runs against nowaste_test.
import request from 'supertest';
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { getSetting } from '../src/data/settingsRepository.js';
import { clock } from '../src/domain/clock.js';
import { createAccount, tokenFor } from './helpers/accounts.js';
import {
  deleteAllUsers,
  readSettingValue,
  setBagsAvailable,
  setSettingValue,
  setUserStatus,
} from './helpers/database.js';
import { SHOP, createDraft, createVendor, get, jpeg, post, readyToPublish } from './helpers/listings.js';

const app = createApp();
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

// One degree of latitude is about 111 km.
const NORTH_KM = (km: number) => ({ latitude: SHOP.latitude + km / 111.2, longitude: SHOP.longitude });

let consumer: string;
let savedSetting: unknown;

beforeAll(async () => {
  await deleteAllUsers();
  savedSetting = await readSettingValue('FR-RES-01');
});

beforeEach(async () => {
  clock.now = () => NOW;
  await deleteAllUsers();
  const account = await createAccount(app, 'consumer');
  consumer = await tokenFor(app, account.email);
});

afterEach(async () => {
  clock.now = realNow;
  await setSettingValue('FR-RES-01', savedSetting);
});

afterAll(async () => {
  await deleteAllUsers();
  await closePool();
});

/** A formal vendor whose shop (main branch) is `km` north of the consumer, with one published listing. */
async function offerAt(
  km: number,
  options: {
    shopName?: string;
    overrides?: Record<string, unknown>;
    publish?: boolean;
  } = {},
) {
  const vendor = await createVendor(app, 'formal', 'Approved', {
    shopName: options.shopName ?? `Shop ${String(km)} km`,
    ...NORTH_KM(km),
  });
  const id = await createDraft(app, vendor.token, at, options.overrides ?? {});
  if (options.publish !== false) {
    await readyToPublish(app, vendor.token, id);
    const published = await post(app, `/listings/${id}/publish`, vendor.token);
    if (published.status !== 200) throw new Error(`publish failed: ${JSON.stringify(published.body)}`);
  }
  return { vendor, id };
}

const nearby = (query: Record<string, unknown> = {}) =>
  request(app)
    .get('/listings/nearby')
    .query({ latitude: SHOP.latitude, longitude: SHOP.longitude, ...query })
    .set('Authorization', `Bearer ${consumer}`);

type Offer = { id: string; distanceMeters: number; place: { shopName: string } };
const idsOf = (body: unknown) => (body as { offers: Offer[] }).offers.map((o) => o.id);

describe('FR-RES-01 the distance comes from the settings table', () => {
  test('FR-RES-01 the settings row FR-RES-01 holds the default 10 km and the 1 to 50 km slider range', async () => {
    expect((await getSetting('FR-RES-01'))?.value).toEqual({
      default_radius_km: 10,
      min_radius_km: 1,
      max_radius_km: 50,
      step_km: 1,
    });
  });

  test('FR-RES-01 without a distance, 10 km is used and the slider range is returned', async () => {
    const near = await offerAt(0);
    const five = await offerAt(5);
    await offerAt(20);

    const response = await nearby();

    expect(response.status).toBe(200);
    expect((response.body as { radius: unknown }).radius).toEqual({
      km: 10,
      defaultKm: 10,
      minKm: 1,
      maxKm: 50,
      stepKm: 1,
    });
    expect(new Set(idsOf(response.body))).toEqual(new Set([near.id, five.id]));
  });

  test('FR-RES-01 a larger distance shows farther branches and a smaller one fewer', async () => {
    const near = await offerAt(0);
    const five = await offerAt(5);
    const twenty = await offerAt(20);

    expect(new Set(idsOf((await nearby({ radiusKm: 25 })).body))).toEqual(
      new Set([near.id, five.id, twenty.id]),
    );
    expect(idsOf((await nearby({ radiusKm: 1 })).body)).toEqual([near.id]);
  });

  test('FR-RES-01 changing the settings row changes the default without changing code', async () => {
    await offerAt(0);
    await offerAt(20);
    await setSettingValue('FR-RES-01', {
      default_radius_km: 30,
      min_radius_km: 1,
      max_radius_km: 50,
      step_km: 1,
    });

    const response = await nearby();

    expect((response.body as { radius: { km: number } }).radius.km).toBe(30);
    expect(idsOf(response.body)).toHaveLength(2);
  });

  test.each<[string, Record<string, unknown>, string[]]>([
    ['no location', { latitude: undefined, longitude: undefined }, ['latitude', 'longitude']],
    ['a latitude out of range', { latitude: 91 }, ['latitude']],
    ['a distance of 0 km (below 1)', { radiusKm: 0 }, ['radiusKm']],
    ['a distance of 51 km (above 50)', { radiusKm: 51 }, ['radiusKm']],
    ['a distance that is not a number', { radiusKm: 'far' }, ['radiusKm']],
  ])('FR-RES-01 %s is refused', async (_case, query, fields) => {
    const response = await nearby(query);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_search', fields });
  });

  test('FR-RES-01 the limits 1 km and 50 km themselves are accepted', async () => {
    expect((await nearby({ radiusKm: 1 })).status).toBe(200);
    expect((await nearby({ radiusKm: 50 })).status).toBe(200);
  });
});

describe('FR-RES-01 only food a consumer can buy now is shown', () => {
  test('FR-RES-01 a Draft, a sold-out listing and one whose pickup has ended are not shown', async () => {
    const shown = await offerAt(0);
    await offerAt(1, { publish: false });
    const soldOut = await offerAt(2);
    await setBagsAvailable(soldOut.id, 0);
    const ended = await offerAt(3, { overrides: { pickupStart: at(5) } });

    // Cooked meals at room temperature are picked up by start + 2 h: at(125) for `ended`, at(130) for the others.
    clock.now = () => new Date(NOW.getTime() + 127 * 60_000);

    expect(idsOf((await nearby()).body)).toEqual([shown.id]);
    expect(ended.id).not.toBe(shown.id);
  });

  test('FR-RES-01 the listings of a vendor who is no longer Approved are not shown', async () => {
    const offer = await offerAt(0);
    await setUserStatus(offer.vendor.id, 'Suspended');

    expect(idsOf((await nearby()).body)).toEqual([]);
  });
});

describe('FR-RTE-08 FR-RTE-09 the order of the offers', () => {
  test('FR-RTE-08 Highly perishable food comes first, then the others by distance (FR-RTE-09)', async () => {
    // Chilled cooked meals last 72 h, so the vendor may confirm Long-life.
    // Chilled cooked meals (72 h) are saved as Long-life (D-70, D-72).
    const longNear = await offerAt(1, { overrides: { storage: 'chilled' } });
    const longFar = await offerAt(4, { overrides: { storage: 'chilled' } });
    const highlyFar = await offerAt(6);

    expect(idsOf((await nearby()).body)).toEqual([highlyFar.id, longNear.id, longFar.id]);
  });

  test('FR-RTE-09 at the same distance, the offer whose pickup ends sooner comes first', async () => {
    const vendor = await createVendor(app, 'formal', 'Approved');
    const later = await createDraft(app, vendor.token, at, { pickupStart: at(30) });
    const sooner = await createDraft(app, vendor.token, at, { pickupStart: at(10) });
    for (const id of [later, sooner]) {
      await readyToPublish(app, vendor.token, id);
      await post(app, `/listings/${id}/publish`, vendor.token);
    }

    expect(idsOf((await nearby()).body)).toEqual([sooner, later]);
  });
});

describe('D-65 each offer carries what the map, the list and the product page show', () => {
  test('FR-RES-01 an offer has its text in both languages, prices, bags, pickup times, category and its branch', async () => {
    const { id } = await offerAt(5, { shopName: 'Fatma Bakery' });

    const offer = (await nearby()).body as { offers: Record<string, unknown>[] };

    expect(offer.offers[0]).toMatchObject({
      id,
      nameEn: 'Koshari',
      nameAr: null,
      descriptionEn: 'Fresh koshari with crispy onions',
      sourceLanguage: 'en',
      foodCategory: 'cooked_meals',
      bagsAvailable: 3,
      originalValue: 100,
      price: 40,
      pickupStart: at(10),
      pickupEnd: at(130),
      place: {
        shopName: 'Fatma Bakery',
        branchName: 'Fatma Bakery',
        address: '12 Tahrir Street, Dokki, Giza',
        latitude: NORTH_KM(5).latitude,
        longitude: SHOP.longitude,
      },
    });
    // D-73: customers see the pickup window, not the perishability category.
    expect(offer.offers[0]).not.toHaveProperty('perishabilityCategory');
    expect(offer.offers[0]).not.toHaveProperty('urgency');
    const distance = (offer.offers[0] as { distanceMeters: number }).distanceMeters;
    expect(distance).toBeGreaterThan(4900);
    expect(distance).toBeLessThan(5100);
  });

  test("D-65 a listing at a second branch is placed at that branch, with the branch's name and address", async () => {
    const vendor = await createVendor(app, 'formal', 'Approved', {
      shopName: 'Fatma Bakery',
      ...NORTH_KM(30),
    });
    const branch = await post(app, '/vendors/me/branches', vendor.token, {
      name: 'Dokki branch (ignored: branches carry the store name, D-69)',
      address: '3 Mossadak Street, Dokki',
      ...NORTH_KM(2),
      opensAt: '00:00',
      closesAt: '23:59',
    });
    const branchId = (branch.body as { id: string }).id;
    const id = await createDraft(app, vendor.token, at, { branchId });
    await readyToPublish(app, vendor.token, id);
    await post(app, `/listings/${id}/publish`, vendor.token);

    const offers = ((await nearby()).body as { offers: { place: unknown }[] }).offers;

    expect(offers).toHaveLength(1);
    expect(offers[0]?.place).toEqual({
      key: branchId,
      branchId,
      shopName: 'Fatma Bakery',
      branchName: 'Fatma Bakery',
      address: '3 Mossadak Street, Dokki',
      ...NORTH_KM(2),
    });
  });
});

describe('D-65 the product page (GET /listings/nearby/:id) and its photo', () => {
  test('FR-RES-01 a shown offer can be opened by id', async () => {
    const { id } = await offerAt(3);

    const response = await get(app, `/listings/nearby/${id}`, consumer);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id, nameEn: 'Koshari', price: 40, distanceMeters: null });
  });

  test('FR-RES-01 a Draft, an unknown id or an id that is not a UUID is not found', async () => {
    const draft = await offerAt(1, { publish: false });

    for (const id of [draft.id, '00000000-0000-0000-0000-000000000000', 'nearby']) {
      expect((await get(app, `/listings/nearby/${id}`, consumer)).status).toBe(404);
    }
  });

  test('FR-RES-01 the photo of a shown offer is returned; the photo of a Draft is not', async () => {
    const shown = await offerAt(0);
    const draft = await offerAt(1, { publish: false });

    const photo = await request(app)
      .get(`/listings/nearby/${shown.id}/photo`)
      .set('Authorization', `Bearer ${consumer}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          done(null, Buffer.concat(chunks));
        });
      });

    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toBe('image/jpeg');
    expect((photo.body as Buffer).length).toBe(jpeg().length);
    expect((await get(app, `/listings/nearby/${draft.id}/photo`, consumer)).status).toBe(404);
  });
});

// D-87 (Maryam, 2026-11-14): the price filter is a maximum price; the pickup-time filter is "I can come by" a time;
// the vendor rating filter waits for ratings (a later story). Filters work together and leave the FR-RTE-08 / 09 order.
describe('FR-RES-01 D-87 filter by maximum price', () => {
  test('FR-RES-01 D-87 only offers at or below the maximum price are shown', async () => {
    const cheap = await offerAt(1, { overrides: { price: 30 } });
    const atMax = await offerAt(2, { overrides: { price: 40 } });
    await offerAt(3, { overrides: { price: 40.01 } });

    expect(idsOf((await nearby({ maxPrice: 40 })).body)).toEqual([cheap.id, atMax.id]);
  });

  test.each<[string, unknown]>([
    ['0', 0],
    ['a negative price', -5],
    ['not a number', 'cheap'],
  ])('FR-RES-01 D-87 a maximum price of %s is refused', async (_case, maxPrice) => {
    const response = await nearby({ maxPrice });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_search', fields: ['maxPrice'] });
  });
});

describe('FR-RES-01 D-87 filter by pickup time ("I can come by")', () => {
  test('FR-RES-01 D-87 only offers whose pickup starts by the chosen time are shown', async () => {
    const soon = await offerAt(1, { overrides: { pickupStart: at(10) } });
    const exactly = await offerAt(2, { overrides: { pickupStart: at(60) } });
    await offerAt(3, { overrides: { pickupStart: at(61) } });

    expect(idsOf((await nearby({ pickupBy: at(60) })).body)).toEqual([soon.id, exactly.id]);
  });

  test('FR-RES-01 D-87 an offer whose pickup has already started still counts', async () => {
    const started = await offerAt(1, { overrides: { pickupStart: at(10) } });
    clock.now = () => new Date(NOW.getTime() + 20 * 60_000);

    expect(idsOf((await nearby({ pickupBy: at(30) })).body)).toEqual([started.id]);
  });

  test.each<[string, unknown]>([
    ['a time already passed', '2026-11-01T09:59:00.000Z'],
    ['not a time', 'tonight'],
  ])('FR-RES-01 D-87 a pickup time that is %s is refused', async (_case, pickupBy) => {
    const response = await nearby({ pickupBy });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_search', fields: ['pickupBy'] });
  });
});

describe('FR-RES-01 D-87 the filters work together', () => {
  test('FR-RES-01 D-87 with both filters only offers matching both are shown', async () => {
    const both = await offerAt(1, { overrides: { price: 30, pickupStart: at(10) } });
    await offerAt(2, { overrides: { price: 30, pickupStart: at(120) } });
    await offerAt(3, { overrides: { price: 60, pickupStart: at(10) } });

    expect(idsOf((await nearby({ maxPrice: 40, pickupBy: at(60) })).body)).toEqual([both.id]);
  });

  test('FR-RES-01 D-87 filters with no results give an empty list, not an error', async () => {
    await offerAt(1, { overrides: { price: 30 } });

    const response = await nearby({ maxPrice: 10 });

    expect(response.status).toBe(200);
    expect(idsOf(response.body)).toEqual([]);
  });

  test('FR-RTE-08 D-87 a filter keeps the order: Highly perishable first, then by distance', async () => {
    const longNear = await offerAt(1, { overrides: { storage: 'chilled', price: 30 } });
    const highlyFar = await offerAt(5, { overrides: { price: 30 } });
    await offerAt(2, { overrides: { price: 90 } });

    expect(idsOf((await nearby({ maxPrice: 50 })).body)).toEqual([highlyFar.id, longNear.id]);
  });

  test('FR-RES-01 D-87 two or more errors are named together', async () => {
    const response = await nearby({ radiusKm: 0, maxPrice: 0, pickupBy: 'tonight' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_search', fields: ['radiusKm', 'maxPrice', 'pickupBy'] });
  });
});
