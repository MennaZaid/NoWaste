// US-10 Create listing, US-11 Quick Post and US-13 (SDD C-05 Listing Service, C-26 Storage Adapter).
// Since D-63, D-64 and D-66 (2026-11-03): the vendor writes the name and description once, in Arabic or English, and
// they are stored as written (no translation); a listing is picked up at one of the vendor's branches; preparation
// time and expiry are no longer asked, and the pick-by time is the pickup start + the shelf-life (or + 6 h when unknown), capped at the
// branch's closing time. Full listings are for formal vendors, Quick Posts for informal vendors.
// Tests come from FR-LST-01, FR-LST-02, FR-LST-04, FR-LST-06, E-LST-02, E-LST-03, E-LST-04, E-LST-06 and NFR-08a.
// They run against the real nowaste_test database with a fixed clock; photos go to a temporary folder.
import request from 'supertest';
import { PHOTO_MAX_BYTES } from '@nowaste/shared';
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { getSetting } from '../src/data/settingsRepository.js';
import { clock } from '../src/domain/clock.js';
import {
  clearOpeningHours,
  countListings,
  deleteAllUsers,
  readListingRow,
  setUserStatus,
} from './helpers/database.js';
import {
  SHOP,
  createDraft,
  createVendor,
  get,
  jpeg,
  listingBody,
  mainBranchId,
  post,
  quickPostBody,
  readyToPublish,
} from './helpers/listings.js';

const app = createApp();
// 2026-11-01 10:00 UTC is 12:00 in Cairo. Test vendors are open 00:00 to 23:59 Cairo time (21:59 UTC = at(719)).
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

function uploadPhoto(token: string, body: Buffer = jpeg(), type = 'image/jpeg') {
  return request(app)
    .post('/listings/photo')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', type)
    .send(body);
}

const listings = (token: string, body: Record<string, unknown>) => post(app, '/listings', token, body);

let formal: { id: string; token: string };
let informal: { id: string; token: string };

beforeAll(async () => {
  await deleteAllUsers();
  formal = await createVendor(app, 'formal');
  informal = await createVendor(app, 'informal');
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

describe('FR-LST-01 create and publish a listing', () => {
  test('FR-LST-01 an approved formal vendor creates a Draft at a branch and publishes it as Active', async () => {
    const body = await listingBody(app, formal.token, at);

    const created = await listings(formal.token, body);

    expect(created.status).toBe(201);
    const listing = created.body as Record<string, unknown>;
    expect(listing).toMatchObject({
      status: 'Draft',
      isQuickPost: false,
      listingType: null,
      // D-70: the estimate is set when the listing is saved (cooked meals at room temperature: 2 h from the pickup start, D-71).
      perishabilityCategory: 'Highly perishable',
      urgency: { collectBy: at(130) },
      nameEn: 'Koshari',
      descriptionEn: 'Fresh koshari with crispy onions',
      sourceLanguage: 'en',
      foodCategory: 'cooked_meals',
      storage: 'room_temperature',
      bagsTotal: 3,
      bagsAvailable: 3,
      originalValue: 100,
      price: 40,
      pickupStart: at(10),
      branchId: body.branchId,
      latitude: SHOP.latitude,
      longitude: SHOP.longitude,
      photoKey: body.photoKey,
    });

    const id = String(listing.id);
    await readyToPublish(app, formal.token, id);
    const published = await post(app, `/listings/${id}/publish`, formal.token);
    expect((published.body as { status: string }).status).toBe('Active');
    expect(((await get(app, `/listings/${id}`, formal.token)).body as { status: string }).status).toBe(
      'Active',
    );
  });

  test('FR-LST-01 a listing that is not a Draft cannot be published again', async () => {
    const id = await createDraft(app, formal.token, at);
    await readyToPublish(app, formal.token, id);
    await post(app, `/listings/${id}/publish`, formal.token);

    const again = await post(app, `/listings/${id}/publish`, formal.token);

    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: 'listing_not_draft', status: 'Active' });
  });

  test("FR-LST-01 a vendor cannot see or publish another vendor's listing", async () => {
    const id = await createDraft(app, formal.token, at);

    expect((await get(app, `/listings/${id}`, informal.token)).status).toBe(404);
    expect((await post(app, `/listings/${id}/publish`, informal.token)).status).toBe(404);
  });

  test('FR-LST-01 an id that is not a UUID is not found', async () => {
    expect((await get(app, '/listings/not-a-uuid', formal.token)).status).toBe(404);
  });

  test('FR-LST-01 a photo key that was never uploaded is refused', async () => {
    const response = await listings(
      formal.token,
      await listingBody(app, formal.token, at, { photoKey: 'x.jpg' }),
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['photoKey'] });
  });

  test('FR-LST-01 D-64 full listings are for formal vendors; an informal vendor gets 403', async () => {
    const response = await listings(informal.token, await listingBody(app, informal.token, at));

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'full_listing_formal_only' });
  });
});

describe('D-66 the name and description are stored exactly as the vendor wrote them', () => {
  test('FR-LST-01 English text is stored under English only; nothing is translated', async () => {
    const created = await listings(formal.token, await listingBody(app, formal.token, at));

    expect(created.body).toMatchObject({
      sourceLanguage: 'en',
      nameEn: 'Koshari',
      descriptionEn: 'Fresh koshari with crispy onions',
      nameAr: null,
      descriptionAr: null,
    });
  });

  test('FR-LST-01 Arabic text is stored under Arabic only, unchanged', async () => {
    const created = await listings(
      formal.token,
      await listingBody(app, formal.token, at, {
        name: 'عيش بلدي',
        description: 'عيش بلدي طازج',
        language: 'ar',
      }),
    );

    expect(created.body).toMatchObject({
      sourceLanguage: 'ar',
      nameAr: 'عيش بلدي',
      descriptionAr: 'عيش بلدي طازج',
      nameEn: null,
      descriptionEn: null,
    });
  });
});

describe('D-70 the estimated category is set when the listing is saved', () => {
  test.each<[string, Record<string, unknown>, string]>([
    ['cooked meals at room temperature (2 h)', {}, 'Highly perishable'],
    ['chilled meat (24 h)', { foodCategory: 'meat_poultry_and_fish', storage: 'chilled' }, 'Short-life'],
    ['chilled cooked meals (72 h)', { storage: 'chilled' }, 'Long-life'],
    ['storage Unknown', { storage: 'unknown' }, 'Highly perishable'],
  ])('FR-RTE-01 D-70 a listing of %s is saved as %s', async (_name, overrides, category) => {
    const response = await listings(formal.token, await listingBody(app, formal.token, at, overrides));

    expect(response.body).toMatchObject({ perishabilityCategory: category });
  });

  test('FR-RTE-01 D-71 cooked meals at room temperature saved a day before the pickup are still Highly perishable', async () => {
    const tomorrow = 24 * 60 + 10;
    const response = await listings(
      formal.token,
      await listingBody(app, formal.token, at, { pickupStart: at(tomorrow) }),
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      perishabilityCategory: 'Highly perishable',
      pickupEnd: at(tomorrow + 120),
    });
  });

  test('FR-RTE-03 D-70 a Draft can be published after only choosing its destination', async () => {
    const id = await createDraft(app, formal.token, at);
    await post(app, `/listings/${id}/destination`, formal.token, { destination: 'consumers' });

    const published = await post(app, `/listings/${id}/publish`, formal.token);

    expect(published.status).toBe(200);
    expect(published.body).toMatchObject({ status: 'Active', perishabilityCategory: 'Highly perishable' });
  });

  test('FR-RTE-03 D-72 the vendor no longer changes the category; an earlier pickup end is the way to be quicker', async () => {
    const id = await createDraft(app, formal.token, at, { storage: 'chilled' });

    const response = await post(app, `/listings/${id}/perishability/confirm`, formal.token, {
      category: 'Short-life',
    });

    expect(response.status).toBe(404);
    expect(
      ((await get(app, `/listings/${id}`, formal.token)).body as { perishabilityCategory: string })
        .perishabilityCategory,
    ).toBe('Long-life');
  });
});

describe('D-69 the vendor may choose an earlier pickup end, never later than the worked-out limit', () => {
  // Cooked meals at room temperature from now + 10 min: the limit is now + 130 min.
  test('FR-LST-01 D-69 an end time before the limit is saved as chosen', async () => {
    const response = await listings(
      formal.token,
      await listingBody(app, formal.token, at, { pickupEnd: at(60) }),
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ pickupStart: at(10), pickupEnd: at(60) });
  });

  test('FR-LST-01 D-69 an end time equal to the limit is accepted', async () => {
    const response = await listings(
      formal.token,
      await listingBody(app, formal.token, at, { pickupEnd: at(130) }),
    );

    expect((response.body as { pickupEnd: string }).pickupEnd).toBe(at(130));
  });

  test('E-LST-03 D-69 an end time one minute after the limit is refused with the latest allowed end', async () => {
    const before = await countListings();

    const response = await listings(
      formal.token,
      await listingBody(app, formal.token, at, { pickupEnd: at(131) }),
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-LST-03', field: 'pickupEnd', latestPickupEnd: at(130) });
    expect(await countListings()).toBe(before);
  });

  test('E-LST-03 D-69 the limit includes the closing time: an end after closing is refused', async () => {
    // Open 09:00 to 13:00 Cairo: closes at at(60); packaged food lasts much longer.
    const vendor = await createVendor(app, 'formal', 'Approved', { opensAt: '09:00', closesAt: '13:00' });

    const response = await listings(
      vendor.token,
      await listingBody(app, vendor.token, at, { foodCategory: 'packaged_and_dry_food', pickupEnd: at(61) }),
    );

    expect(response.body).toEqual({ error: 'E-LST-03', field: 'pickupEnd', latestPickupEnd: at(60) });
  });

  test.each([
    ['equal to the start', 10],
    ['before the start', 5],
  ])('E-LST-04 D-69 an end time %s is refused', async (_case, minutes) => {
    const response = await listings(
      formal.token,
      await listingBody(app, formal.token, at, { pickupEnd: at(minutes) }),
    );

    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['pickupEnd'] });
  });

  test('E-LST-04 D-69 an end time that is not a time is refused', async () => {
    const response = await listings(
      formal.token,
      await listingBody(app, formal.token, at, { pickupEnd: 'later' }),
    );

    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['pickupEnd'] });
  });

  test('FR-RTE-04 D-69 the collect-by time customers see is the chosen end', async () => {
    const id = await createDraft(app, formal.token, at, { pickupEnd: at(45) });
    await readyToPublish(app, formal.token, id);

    expect((await get(app, `/listings/${id}`, formal.token)).body).toMatchObject({
      urgency: { collectBy: at(45) },
    });
  });
});

describe('D-64 the pick-by time is worked out from the rules and the closing time', () => {
  const pickupEndOf = async (overrides: Record<string, unknown>, token = formal.token) => {
    const response = await listings(token, await listingBody(app, token, at, overrides));
    expect(response.status).toBe(201);
    return (response.body as { pickupEnd: string }).pickupEnd;
  };

  test('FR-RTE-01 pick-by = pickup start + the shelf-life of the category and storage (cooked meals, room: 2 h)', async () => {
    expect(await pickupEndOf({})).toBe(at(10 + 120));
  });

  test('FR-RTE-01 chilled meat: pickup start + 24 h, capped at closing time (21:59 UTC)', async () => {
    expect(await pickupEndOf({ foodCategory: 'meat_poultry_and_fish', storage: 'chilled' })).toBe(at(719));
  });

  test.each<[string, Record<string, unknown>]>([
    ['storage Unknown', { storage: 'unknown' }],
    ['food category Unknown', { foodCategory: 'unknown' }],
  ])('FR-RTE-02 with %s, pick-by = pickup start + 6 h (BR-01)', async (_name, unknown) => {
    expect(await pickupEndOf(unknown)).toBe(at(10 + 360));
  });

  test('D-64 a pick-by later than closing time is set to the closing time', async () => {
    // Open 09:00 to 13:00 Cairo: closes at 11:00 UTC = at(60). Packaged food lasts 720 h.
    const vendor = await createVendor(app, 'formal', 'Approved', { opensAt: '09:00', closesAt: '13:00' });

    expect(await pickupEndOf({ foodCategory: 'packaged_and_dry_food' }, vendor.token)).toBe(at(60));
  });

  test('E-LST-04 a pickup start when the branch is closed is refused with its hours', async () => {
    // Open 12:30 to 22:00 Cairo: opens at 10:30 UTC = at(30).
    const vendor = await createVendor(app, 'formal', 'Approved', { opensAt: '12:30', closesAt: '22:00' });

    const response = await listings(
      vendor.token,
      await listingBody(app, vendor.token, at, { pickupStart: at(10) }),
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'E-LST-04',
      fields: ['pickupStart'],
      opensAt: '12:30',
      closesAt: '22:00',
    });
  });

  test('D-64 D-74 the pick-by preview gives the same time and category as saving, and says when it was capped at closing', async () => {
    // Open 09:00 to 15:00 Cairo: closes at 13:00 UTC = at(180).
    const vendor = await createVendor(app, 'formal', 'Approved', { opensAt: '09:00', closesAt: '15:00' });
    const branchId = await mainBranchId(app, vendor.token);
    const preview = (foodCategory: string) =>
      post(app, '/listings/pick-by', vendor.token, {
        foodCategory,
        storage: 'room_temperature',
        pickupStart: at(10),
        branchId,
      });

    expect((await preview('cooked_meals')).body).toEqual({
      pickupEnd: at(10 + 120),
      closesAt: at(180),
      cappedAtClosing: false,
      category: 'Highly perishable',
    });
    expect((await preview('packaged_and_dry_food')).body).toEqual({
      pickupEnd: at(180),
      closesAt: at(180),
      cappedAtClosing: true,
      category: 'Long-life',
    });
    const saved = await listings(vendor.token, await listingBody(app, vendor.token, at));
    expect((saved.body as { pickupEnd: string }).pickupEnd).toBe(at(10 + 120));
  });

  test('E-LST-04 the pick-by preview marks only its own missing fields', async () => {
    const response = await post(app, '/listings/pick-by', formal.token, { storage: 'chilled' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['foodCategory', 'pickupStart', 'branchId'] });
  });
});

describe("D-64 the listing is picked up at one of the vendor's branches", () => {
  test("FR-LST-01 a listing at a second branch uses that branch's pin and opening hours", async () => {
    const vendor = await createVendor(app, 'formal');
    const branch = await post(app, '/vendors/me/branches', vendor.token, {
      name: 'Maadi branch',
      address: '9 Road 9, Maadi',
      latitude: 29.96,
      longitude: 31.25,
      opensAt: '09:00',
      closesAt: '13:00',
    });
    const branchId = (branch.body as { id: string }).id;

    const created = await listings(
      vendor.token,
      await listingBody(app, vendor.token, at, { branchId, foodCategory: 'packaged_and_dry_food' }),
    );

    expect(created.body).toMatchObject({ branchId, latitude: 29.96, longitude: 31.25, pickupEnd: at(60) });
  });

  test("E-LST-04 another vendor's branch, or an id that is not a branch, is refused", async () => {
    const otherBranch = await mainBranchId(app, informal.token);

    for (const branchId of [otherBranch, '00000000-0000-0000-0000-000000000000']) {
      const response = await listings(formal.token, await listingBody(app, formal.token, at, { branchId }));
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'E-LST-04', fields: ['branchId'] });
    }
  });

  test('FR-LST-01 a branch without opening hours (registered before D-62) cannot be used: 409', async () => {
    const vendor = await createVendor(app, 'formal');
    await clearOpeningHours(vendor.id);

    const response = await listings(vendor.token, await listingBody(app, vendor.token, at));

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'opening_hours_required' });
  });
});

describe('E-LST-04 invalid or missing listing fields', () => {
  const fieldsOf = async (overrides: Record<string, unknown>) => {
    const response = await listings(formal.token, await listingBody(app, formal.token, at, overrides));
    expect(response.status).toBe(400);
    return (response.body as { fields: string[] }).fields;
  };

  test('E-LST-04 an empty listing lists every required field and saves nothing', async () => {
    const before = await countListings();

    const response = await listings(formal.token, {});

    expect(response.body).toEqual({
      error: 'E-LST-04',
      fields: [
        'photoKey',
        'name',
        'description',
        'language',
        'foodCategory',
        'storage',
        'bagsTotal',
        'originalValue',
        'price',
        'pickupStart',
        'branchId',
      ],
    });
    expect(await countListings()).toBe(before);
  });

  test('E-LST-04 bags 0 is rejected and 1 is accepted', async () => {
    expect(await fieldsOf({ bagsTotal: 0 })).toEqual(['bagsTotal']);
    expect(
      (await listings(formal.token, await listingBody(app, formal.token, at, { bagsTotal: 1 }))).status,
    ).toBe(201);
  });

  test.each([2.5, '3', -1])('E-LST-04 bags %j is rejected', async (bagsTotal) => {
    expect(await fieldsOf({ bagsTotal })).toEqual(['bagsTotal']);
  });

  test('E-LST-04 price -0.01 is rejected and 0 is refused for now (open question 24)', async () => {
    expect(await fieldsOf({ price: -0.01 })).toEqual(['price']);
    expect(await fieldsOf({ price: 0 })).toEqual(['price']);
  });

  test('E-LST-04 price equal to the original value is accepted; 0.01 above it is rejected', async () => {
    expect(
      (await listings(formal.token, await listingBody(app, formal.token, at, { price: 100 }))).status,
    ).toBe(201);
    expect(await fieldsOf({ price: 100.01 })).toEqual(['price']);
  });

  test.each<[string, unknown]>([
    ['name', ''],
    ['name', 'x'.repeat(81)],
    ['description', ' '],
    ['description', 'خ'.repeat(301)],
    ['language', 'fr'],
    ['foodCategory', 'sweets'],
    ['storage', 'fridge'],
    ['originalValue', -5],
    ['pickupStart', 'tomorrow'],
    ['branchId', 'main'],
  ])('E-LST-04 %s %j is rejected', async (field, value) => {
    expect(await fieldsOf({ [field]: value })).toEqual([field]);
  });

  test.each(['room_temperature', 'chilled', 'frozen', 'unknown'])(
    'FR-LST-04 storage %s is saved',
    async (storage) => {
      const id = await createDraft(app, formal.token, at, { storage });
      expect((await readListingRow(id))?.storage).toBe(storage);
    },
  );

  test('FR-LST-04 the food category can be Unknown', async () => {
    const id = await createDraft(app, formal.token, at, { foodCategory: 'unknown' });

    expect((await get(app, `/listings/${id}`, formal.token)).body).toMatchObject({ foodCategory: 'unknown' });
  });
});

describe('FR-LST-02 Quick Post for informal vendors', () => {
  test("FR-LST-02 an informal vendor's Quick Post is published at once as Highly perishable at the main branch", async () => {
    const branchId = await mainBranchId(app, informal.token);

    const response = await post(
      app,
      '/listings/quick',
      informal.token,
      await quickPostBody(app, informal.token, at, 90),
    );

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      isQuickPost: true,
      status: 'Active',
      listingType: 'Discounted Surplus Bag',
      perishabilityCategory: 'Highly perishable',
      nameEn: 'Mixed pastries',
      descriptionEn: 'Pastries from this morning',
      sourceLanguage: 'en',
      foodCategory: 'unknown',
      originalValue: null,
      price: 15,
      bagsTotal: 2,
      pickupStart: NOW.toISOString(),
      pickupEnd: at(90),
      branchId,
      latitude: SHOP.latitude,
      longitude: SHOP.longitude,
    });
  });

  test('FR-LST-02 D-66 the Quick Post name and description are stored as written', async () => {
    const response = await post(
      app,
      '/listings/quick',
      informal.token,
      await quickPostBody(app, informal.token, at),
    );

    expect(response.body).toMatchObject({
      nameEn: 'Mixed pastries',
      descriptionEn: 'Pastries from this morning',
      nameAr: null,
      descriptionAr: null,
    });
  });

  test('FR-LST-02 a formal vendor gets 403', async () => {
    const response = await post(
      app,
      '/listings/quick',
      formal.token,
      await quickPostBody(app, formal.token, at),
    );

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'quick_post_informal_only' });
  });

  test('E-LST-04 an empty Quick Post lists its fields', async () => {
    const response = await post(app, '/listings/quick', informal.token, {});

    expect(response.body).toEqual({
      error: 'E-LST-04',
      fields: ['photoKey', 'name', 'description', 'language', 'bagsTotal', 'price', 'pickupEnd'],
    });
  });

  test('E-LST-04 a Quick Post that ends now (the pickup start) is refused', async () => {
    const response = await post(
      app,
      '/listings/quick',
      informal.token,
      await quickPostBody(app, informal.token, at, 0),
    );

    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['pickupEnd'] });
  });

  test('FR-LST-02 D-61 a Quick Post must end within 6 hours of posting', async () => {
    expect(
      (await post(app, '/listings/quick', informal.token, await quickPostBody(app, informal.token, at, 360)))
        .status,
    ).toBe(201);
    const refused = await post(
      app,
      '/listings/quick',
      informal.token,
      await quickPostBody(app, informal.token, at, 361),
    );
    expect(refused.body).toEqual({ error: 'E-LST-03', field: 'pickupEnd', latestPickupEnd: at(360) });
  });

  test('E-LST-04 a Quick Post that ends after closing time is refused with the hours', async () => {
    const vendor = await createVendor(app, 'informal', 'Approved', { opensAt: '09:00', closesAt: '13:00' });

    const response = await post(
      app,
      '/listings/quick',
      vendor.token,
      await quickPostBody(app, vendor.token, at, 61),
    );

    expect(response.body).toEqual({
      error: 'E-LST-04',
      fields: ['pickupEnd'],
      opensAt: '09:00',
      closesAt: '13:00',
    });
  });

  test('E-LST-04 D-75 a Quick Post starting now while the shop is closed is refused on the pickup start', async () => {
    const vendor = await createVendor(app, 'informal', 'Approved', { opensAt: '18:00', closesAt: '23:00' });

    const response = await post(
      app,
      '/listings/quick',
      vendor.token,
      await quickPostBody(app, vendor.token, at, 60),
    );

    expect(response.body).toEqual({
      error: 'E-LST-04',
      fields: ['pickupStart'],
      opensAt: '18:00',
      closesAt: '23:00',
    });
  });

  // D-75: the vendor may choose when the pickup starts, for example tonight while the shop is still closed.
  describe('FR-LST-02 D-75 the Quick Post pickup start', () => {
    // Open 18:00 to 23:00 Cairo = 16:00 to 21:00 UTC = at(360) to at(660).
    const eveningShop = () =>
      createVendor(app, 'informal', 'Approved', { opensAt: '18:00', closesAt: '23:00' });
    const quickAt = async (token: string, start: string, end: string) =>
      post(app, '/listings/quick', token, {
        ...(await quickPostBody(app, token, at)),
        pickupStart: start,
        pickupEnd: end,
      });

    test('FR-LST-02 D-75 a later start within the opening hours is saved with the chosen times', async () => {
      const vendor = await eveningShop();

      const response = await quickAt(vendor.token, at(360), at(540));

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ pickupStart: at(360), pickupEnd: at(540), status: 'Active' });
    });

    test('E-LST-04 D-75 a start while the shop is closed is refused on the pickup start with the hours', async () => {
      const vendor = await eveningShop();

      const response = await quickAt(vendor.token, at(300), at(420));

      expect(response.body).toEqual({
        error: 'E-LST-04',
        fields: ['pickupStart'],
        opensAt: '18:00',
        closesAt: '23:00',
      });
    });

    test('FR-LST-02 D-61 D-75 the end must be within 6 hours of the chosen start', async () => {
      expect((await quickAt(informal.token, at(60), at(420))).status).toBe(201);

      const refused = await quickAt(informal.token, at(60), at(421));

      expect(refused.body).toEqual({ error: 'E-LST-03', field: 'pickupEnd', latestPickupEnd: at(420) });
    });

    test('E-LST-04 D-75 the end must be after the start', async () => {
      const response = await quickAt(informal.token, at(120), at(100));

      expect(response.body).toEqual({ error: 'E-LST-04', fields: ['pickupEnd'] });
    });

    test('E-LST-04 D-75 a start that is not a time is refused', async () => {
      const response = await quickAt(informal.token, 'tonight', at(100));

      expect(response.body).toEqual({ error: 'E-LST-04', fields: ['pickupStart'] });
    });

    test('FR-LST-02 D-75 a start already passed is taken as now (the pickup cannot start before posting)', async () => {
      const response = await quickAt(informal.token, at(-30), at(90));

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({ pickupStart: NOW.toISOString(), pickupEnd: at(90) });
    });
  });
});

describe('E-LST-06 only approved vendors may create or publish listings', () => {
  test.each(['Pending', 'Rejected'])(
    'E-LST-06 a %s vendor gets 403 on every listing route',
    async (status) => {
      const vendor = await createVendor(app, 'formal', 'Approved');
      const body = await listingBody(app, vendor.token, at);
      const quick = await quickPostBody(app, vendor.token, at);
      await setUserStatus(vendor.id, status);

      const responses = [
        await uploadPhoto(vendor.token),
        await listings(vendor.token, body),
        await post(app, '/listings/quick', vendor.token, quick),
        await post(app, '/listings/00000000-0000-0000-0000-000000000000/publish', vendor.token),
      ];

      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: 'E-LST-06' });
      }
    },
  );

  test('E-LST-06 a vendor who becomes Rejected cannot publish a Draft made while Approved', async () => {
    const vendor = await createVendor(app, 'formal', 'Approved');
    const id = await createDraft(app, vendor.token, at);
    await setUserStatus(vendor.id, 'Rejected');

    expect((await post(app, `/listings/${id}/publish`, vendor.token)).body).toEqual({ error: 'E-LST-06' });
  });
});

describe('NFR-08a photo upload (C-26 Storage Adapter)', () => {
  test('NFR-08a the 500 KB limit is the settings row and the shared limit', async () => {
    expect((await getSetting('NFR-08a'))?.value).toEqual({ max_photo_bytes: PHOTO_MAX_BYTES });
    expect(PHOTO_MAX_BYTES).toBe(500 * 1024);
  });

  test('NFR-08a a 600 KB upload is refused', async () => {
    const big = Buffer.alloc(600 * 1024);
    big.set([0xff, 0xd8, 0xff, 0xe0]);

    const response = await uploadPhoto(formal.token, big);

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['photo'] });
  });

  test('NFR-08a a photo of exactly 500 KB is accepted and one byte more is refused', async () => {
    const photo = (size: number) => {
      const bytes = Buffer.alloc(size);
      bytes.set([0xff, 0xd8, 0xff, 0xe0]);
      return bytes;
    };
    expect((await uploadPhoto(formal.token, photo(PHOTO_MAX_BYTES))).status).toBe(201);
    expect((await uploadPhoto(formal.token, photo(PHOTO_MAX_BYTES + 1))).status).toBe(413);
  });

  test.each([
    ['a JPEG content type with bytes that are not a picture', Buffer.from('hello'), 'image/jpeg'],
    ['an empty body', Buffer.alloc(0), 'image/jpeg'],
    ['a type that is not JPEG or PNG', jpeg(), 'application/pdf'],
  ])('E-LST-04 %s is refused', async (_case, body, type) => {
    const response = await uploadPhoto(formal.token, body, type);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['photo'] });
  });

  test('NFR-08a a PNG photo is accepted and its key ends in .png', async () => {
    const png = Buffer.alloc(1024);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const response = await uploadPhoto(formal.token, png, 'image/png');

    expect(response.status).toBe(201);
    expect((response.body as { photoKey: string }).photoKey).toMatch(/^[0-9a-f-]{36}\.png$/);
  });
});

describe('FR-LST-06 the vendor views their active and previous listings (US-15, GET /listings)', () => {
  test('FR-LST-06 the vendor gets every one of their listings, newest first, with its status', async () => {
    const vendor = await createVendor(app, 'formal');
    clock.now = () => new Date(NOW.getTime() - 60_000);
    const older = await createDraft(app, vendor.token, at);
    clock.now = () => NOW;
    const newer = await createDraft(app, vendor.token, at);
    await readyToPublish(app, vendor.token, newer);
    await post(app, `/listings/${newer}/publish`, vendor.token);

    const response = await get(app, '/listings', vendor.token);

    expect(response.status).toBe(200);
    expect((response.body as { id: string; status: string }[]).map((l) => [l.id, l.status])).toEqual([
      [newer, 'Active'],
      [older, 'Draft'],
    ]);
  });

  test("FR-LST-06 another vendor's listings are never included", async () => {
    const vendor = await createVendor(app, 'formal');
    await createDraft(app, formal.token, at);

    expect((await get(app, '/listings', vendor.token)).body).toEqual([]);
  });
});

describe('FR-LST-01 the vendor sees the photo of their listing (GET /listings/:id/photo)', () => {
  test('FR-LST-01 the photo is returned exactly as uploaded, with its type', async () => {
    const bytes = jpeg();
    bytes[100] = 42;
    const key = ((await uploadPhoto(formal.token, bytes)).body as { photoKey: string }).photoKey;
    const id = await createDraft(app, formal.token, at, { photoKey: key });

    const response = await request(app)
      .get(`/listings/${id}/photo`)
      .set('Authorization', `Bearer ${formal.token}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          done(null, Buffer.concat(chunks));
        });
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(response.body as Buffer, bytes)).toBe(0);
  });

  test("FR-LST-01 a vendor cannot see the photo of another vendor's listing", async () => {
    const id = await createDraft(app, formal.token, at);

    expect((await get(app, `/listings/${id}/photo`, informal.token)).status).toBe(404);
  });
});

describe("D-64 the vendor's shop and branches (GET /vendors/me, POST and PATCH /vendors/me/branches)", () => {
  test('FR-LST-01 GET /vendors/me returns the shop and its branches, the shop itself first', async () => {
    const response = await get(app, '/vendors/me', informal.token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      shopName: 'Fatma Bakery',
      vendorType: 'informal',
      opensAt: '00:00',
      closesAt: '23:59',
      branches: [
        {
          name: 'Fatma Bakery',
          address: '12 Tahrir Street, Dokki, Giza',
          latitude: SHOP.latitude,
          longitude: SHOP.longitude,
          opensAt: '00:00',
          closesAt: '23:59',
        },
      ],
    });
  });

  test('FR-ACC-02 a vendor can give extra branches at sign-up; they come after the shop and carry its name (D-69)', async () => {
    const vendor = await createVendor(app, 'formal', 'Pending', {
      branches: [
        {
          name: 'Zamalek branch',
          address: '5 26th of July St',
          latitude: 30.06,
          longitude: 31.22,
          opensAt: '08:00',
          closesAt: '20:00',
        },
      ],
    });

    const branches = ((await get(app, '/vendors/me', vendor.token)).body as { branches: unknown[] }).branches;
    expect(branches).toHaveLength(2);
    expect(branches[1]).toMatchObject({
      name: 'Fatma Bakery',
      address: '5 26th of July St',
      latitude: 30.06,
      opensAt: '08:00',
      closesAt: '20:00',
    });
  });

  test('E-ACC-02 an extra branch at sign-up without hours or a pin marks those fields', async () => {
    const response = await request(app)
      .post('/auth/register')
      .send({
        email: `branches-${Date.now()}@example.com`,
        password: 'Str0ng!pass',
        language: 'en',
        role: 'vendor',
        vendorProfile: {
          shopName: 'Fatma Bakery',
          vendorType: 'formal',
          address: '12 Tahrir Street',
          ...SHOP,
          contact: '01012345678',
          opensAt: '09:00',
          closesAt: '22:00',
          branches: [{ name: 'Second', address: 'Somewhere' }],
        },
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'E-ACC-02',
      fields: ['branches.0.latitude', 'branches.0.longitude', 'branches.0.opensAt', 'branches.0.closesAt'],
    });
  });

  test('FR-ACC-02 D-69 a vendor adds a branch with its own pin and hours; it carries the store name', async () => {
    const vendor = await createVendor(app, 'formal');

    const added = await post(app, '/vendors/me/branches', vendor.token, {
      name: 'Nasr City branch',
      address: '3 Abbas El Akkad',
      latitude: 30.06,
      longitude: 31.34,
      opensAt: '10:00',
      closesAt: '02:00',
    });

    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({ name: 'Fatma Bakery', address: '3 Abbas El Akkad' });
    const branches = (
      (await get(app, '/vendors/me', vendor.token)).body as { branches: { name: string; address: string }[] }
    ).branches;
    expect(branches.map((b) => [b.name, b.address])).toEqual([
      ['Fatma Bakery', '12 Tahrir Street, Dokki, Giza'],
      ['Fatma Bakery', '3 Abbas El Akkad'],
    ]);
  });

  test('E-ACC-02 a branch without an address, a pin or hours is refused with every field (no name: D-69)', async () => {
    const response = await post(app, '/vendors/me/branches', formal.token, {});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'E-ACC-02',
      fields: ['address', 'latitude', 'longitude', 'opensAt', 'closesAt'],
    });
  });

  test("FR-ACC-02 a branch's hours can be changed; another vendor's branch is not found", async () => {
    const branchId = await mainBranchId(app, formal.token);
    const patch = (token: string) =>
      request(app)
        .patch(`/vendors/me/branches/${branchId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ opensAt: '08:00', closesAt: '23:30' });

    expect((await patch(formal.token)).body).toMatchObject({
      id: branchId,
      opensAt: '08:00',
      closesAt: '23:30',
    });
    expect((await patch(informal.token)).status).toBe(404);
    await request(app)
      .patch(`/vendors/me/branches/${branchId}`)
      .set('Authorization', `Bearer ${formal.token}`)
      .send({ opensAt: '00:00', closesAt: '23:59' });
  });
});
