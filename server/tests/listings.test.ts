// US-10 Create listing, US-11 Quick Post and US-13 Preparation/storage/expiry (SDD C-05 Listing Service, C-26 Storage
// Adapter). Sprint 1 has no AI: the vendor types food type, category and descriptions (E-LST-01 manual path, NFR-03).
// Tests come from FR-LST-01, FR-LST-02, FR-LST-04, E-LST-02, E-LST-03, E-LST-04, E-LST-06, NFR-05c and NFR-08a.
// They run against the real nowaste_test database; photos go to a temporary folder (C-26 local storage).
import request from 'supertest';
import { PHOTO_MAX_BYTES } from '@nowaste/shared';
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { getSetting } from '../src/data/settingsRepository.js';
import { clock } from '../src/domain/clock.js';
import { PASSWORD, tokenFor } from './helpers/accounts.js';
import { countListings, deleteAllUsers, readListingRow, setUserStatus } from './helpers/database.js';

const app = createApp();
const SHOP = { latitude: 30.0381, longitude: 31.2122 };

// A fixed "now" so pickup windows and Quick Post start times can be checked exactly.
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

/** The smallest JPEG header, padded to `size` bytes. */
function jpeg(size = 2048): Buffer {
  const bytes = Buffer.alloc(size);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}

async function createVendor(vendorType: 'formal' | 'informal', status = 'Approved') {
  const email = `${vendorType}-${Math.random().toString(36).slice(2, 10)}@example.com`;
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
      },
    });
  const id = (response.body as { id: string }).id;
  await setUserStatus(id, status);
  return { id, token: await tokenFor(app, email) };
}

async function uploadPhoto(token: string, body: Buffer = jpeg(), type = 'image/jpeg') {
  return request(app)
    .post('/listings/photo')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', type)
    .send(body);
}

async function photoKeyFor(token: string): Promise<string> {
  const response = await uploadPhoto(token);
  expect(response.status).toBe(201);
  return (response.body as { photoKey: string }).photoKey;
}

function fullListing(photoKey: string, overrides: Record<string, unknown> = {}) {
  return {
    photoKey,
    foodType: 'Baladi bread',
    foodCategory: 'bread_and_baked_goods',
    descriptionAr: 'خبز بلدي طازج',
    descriptionEn: 'Fresh baladi bread',
    bagsTotal: 3,
    originalValue: 100,
    price: 40,
    pickupStart: at(60),
    pickupEnd: at(180),
    prepTime: at(-120),
    storage: 'room_temperature',
    expiryAt: at(24 * 60),
    ...overrides,
  };
}

function post(path: string, token: string, body: unknown) {
  return request(app)
    .post(path)
    .set('Authorization', `Bearer ${token}`)
    .send(body as object);
}

let formal: { id: string; token: string };
let informal: { id: string; token: string };
let photoKey: string;

beforeAll(async () => {
  await deleteAllUsers();
  formal = await createVendor('formal');
  informal = await createVendor('informal');
  photoKey = await photoKeyFor(formal.token);
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
  test('FR-LST-01 an approved formal vendor creates a Draft and publishes it as Active', async () => {
    const created = await post('/listings', formal.token, fullListing(photoKey));

    expect(created.status).toBe(201);
    const listing = created.body as Record<string, unknown>;
    expect(listing).toMatchObject({
      status: 'Draft',
      isQuickPost: false,
      listingType: null,
      perishabilityCategory: null,
      foodType: 'Baladi bread',
      foodCategory: 'bread_and_baked_goods',
      descriptionAr: 'خبز بلدي طازج',
      descriptionEn: 'Fresh baladi bread',
      bagsTotal: 3,
      bagsAvailable: 3,
      originalValue: 100,
      price: 40,
      pickupStart: at(60),
      pickupEnd: at(180),
      prepTime: at(-120),
      storage: 'room_temperature',
      expiryAt: at(24 * 60),
      unfitForPeople: false,
      calorieMin: null,
      calorieMax: null,
      photoKey,
    });

    const published = await post(`/listings/${String(listing.id)}/publish`, formal.token, {});
    expect(published.status).toBe(200);
    expect((published.body as { status: string }).status).toBe('Active');

    const fetched = await request(app)
      .get(`/listings/${String(listing.id)}`)
      .set('Authorization', `Bearer ${formal.token}`);
    expect((fetched.body as { status: string }).status).toBe('Active');
  });

  test('FR-LST-01 a listing that is not a Draft cannot be published again', async () => {
    const created = await post('/listings', formal.token, fullListing(photoKey));
    const id = (created.body as { id: string }).id;
    await post(`/listings/${id}/publish`, formal.token, {});

    const again = await post(`/listings/${id}/publish`, formal.token, {});

    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: 'listing_not_draft', status: 'Active' });
  });

  test("FR-LST-01 a vendor cannot see or publish another vendor's listing", async () => {
    const created = await post('/listings', formal.token, fullListing(photoKey));
    const id = (created.body as { id: string }).id;

    const seen = await request(app).get(`/listings/${id}`).set('Authorization', `Bearer ${informal.token}`);
    const published = await post(`/listings/${id}/publish`, informal.token, {});

    expect(seen.status).toBe(404);
    expect(published.status).toBe(404);
  });

  test('FR-LST-01 an id that is not a UUID is not found', async () => {
    const response = await request(app)
      .get('/listings/not-a-uuid')
      .set('Authorization', `Bearer ${formal.token}`);

    expect(response.status).toBe(404);
  });

  test('FR-LST-01 a photo key that was never uploaded is refused', async () => {
    const response = await post('/listings', formal.token, fullListing('missing.jpg'));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['photoKey'] });
  });
});

describe('Pickup location (feedback change): starts at the shop pin, the vendor can move it', () => {
  test('FR-LST-01 with no location sent, the listing location equals the shop pin', async () => {
    const response = await post('/listings', formal.token, fullListing(photoKey));
    const row = await readListingRow((response.body as { id: string }).id);

    expect(row?.latitude).toBeCloseTo(SHOP.latitude, 6);
    expect(row?.longitude).toBeCloseTo(SHOP.longitude, 6);
    expect(row?.locationType).toBe('geography');
  });

  test('FR-LST-01 a location sent with the listing is stored instead of the shop pin', async () => {
    const response = await post(
      '/listings',
      formal.token,
      fullListing(photoKey, { location: { latitude: 30.05, longitude: 31.25 } }),
    );

    expect(response.body).toMatchObject({ latitude: 30.05, longitude: 31.25 });
  });

  test('E-LST-04 a location outside the map is refused', async () => {
    const response = await post(
      '/listings',
      formal.token,
      fullListing(photoKey, { location: { latitude: 91, longitude: 31 } }),
    );

    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['location'] });
  });
});

describe('E-LST-04 invalid or missing listing fields', () => {
  async function expectFields(overrides: Record<string, unknown>, fields: string[]) {
    const before = await countListings();
    const response = await post('/listings', formal.token, fullListing(photoKey, overrides));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-LST-04', fields });
    expect(await countListings()).toBe(before);
  }

  test('E-LST-04 bags 0 is rejected', async () => {
    await expectFields({ bagsTotal: 0 }, ['bagsTotal']);
  });

  test('E-LST-04 bags 1 is accepted', async () => {
    expect((await post('/listings', formal.token, fullListing(photoKey, { bagsTotal: 1 }))).status).toBe(201);
  });

  test.each([2.5, '3', -1])('E-LST-04 bags %j is rejected', async (bagsTotal) => {
    await expectFields({ bagsTotal }, ['bagsTotal']);
  });

  test('E-LST-04 price -0.01 is rejected', async () => {
    await expectFields({ price: -0.01 }, ['price']);
  });

  test('E-LST-04 price 0 is refused for now (open question 24)', async () => {
    await expectFields({ price: 0 }, ['price']);
  });

  test('E-LST-04 price equal to the original value is accepted', async () => {
    expect((await post('/listings', formal.token, fullListing(photoKey, { price: 100 }))).status).toBe(201);
  });

  test('E-LST-04 price 0.01 above the original value is rejected', async () => {
    await expectFields({ price: 100.01 }, ['price']);
  });

  test('E-LST-04 pickup end equal to pickup start is rejected', async () => {
    await expectFields({ pickupStart: at(60), pickupEnd: at(60) }, ['pickupEnd']);
  });

  test('E-LST-04 pickup end one minute after pickup start is accepted', async () => {
    const response = await post('/listings', formal.token, fullListing(photoKey, { pickupEnd: at(61) }));

    expect(response.status).toBe(201);
  });

  test('E-LST-04 an empty listing lists every required field', async () => {
    await expectFields(
      {
        photoKey: undefined,
        foodType: undefined,
        foodCategory: undefined,
        descriptionAr: undefined,
        descriptionEn: undefined,
        bagsTotal: undefined,
        originalValue: undefined,
        price: undefined,
        pickupStart: undefined,
        pickupEnd: undefined,
        prepTime: undefined,
        storage: undefined,
        expiryAt: undefined,
      },
      [
        'photoKey',
        'foodType',
        'foodCategory',
        'descriptionAr',
        'descriptionEn',
        'bagsTotal',
        'originalValue',
        'price',
        'pickupStart',
        'pickupEnd',
        'prepTime',
        'storage',
        'expiryAt',
      ],
    );
  });

  test.each([
    ['foodCategory', 'sweets'],
    ['foodCategory', 'other'],
    ['storage', 'fridge'],
    ['pickupStart', 'tomorrow'],
    ['prepTime', 'yesterday'],
    ['expiryAt', 'soon'],
    ['originalValue', -5],
    ['descriptionEn', ' '],
    ['foodType', 'x'.repeat(81)],
    ['descriptionAr', 'خ'.repeat(301)],
  ])('E-LST-04 %s %j is rejected', async (field, value) => {
    await expectFields({ [field]: value }, [field]);
  });

  test('E-LST-04 several invalid fields are listed together', async () => {
    await expectFields({ bagsTotal: 0, price: -1, storage: '' }, ['bagsTotal', 'price', 'storage']);
  });
});

describe('E-LST-03 NFR-05c the pickup window ends no later than the expiry', () => {
  const expiry = at(300);

  test('E-LST-03 pickup end one minute before the expiry is accepted', async () => {
    const response = await post(
      '/listings',
      formal.token,
      fullListing(photoKey, { expiryAt: expiry, pickupEnd: at(299) }),
    );

    expect(response.status).toBe(201);
  });

  test('NFR-05c pickup end equal to the expiry is accepted', async () => {
    const response = await post(
      '/listings',
      formal.token,
      fullListing(photoKey, { expiryAt: expiry, pickupEnd: expiry }),
    );

    expect(response.status).toBe(201);
  });

  test('E-LST-03 pickup end one minute after the expiry is refused and asks for a new end time', async () => {
    const before = await countListings();
    const response = await post(
      '/listings',
      formal.token,
      fullListing(photoKey, { expiryAt: expiry, pickupEnd: at(301) }),
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-LST-03', field: 'pickupEnd' });
    expect(await countListings()).toBe(before);
  });

  test('NFR-05c with no expiry (Unknown) any pickup end after the start is accepted', async () => {
    const response = await post(
      '/listings',
      formal.token,
      fullListing(photoKey, { expiryAt: 'unknown', pickupEnd: at(10 * 24 * 60) }),
    );

    expect(response.status).toBe(201);
  });
});

describe('FR-LST-04 preparation time, storage and expiry, each can be Unknown', () => {
  test.each([
    ['prepTime', 'unknown', 'prepTime'],
    ['storage', 'unknown', 'storage'],
    ['expiryAt', 'unknown', 'expiryAt'],
  ])('FR-LST-04 %s set to Unknown is saved as Unknown', async (field, value) => {
    const response = await post('/listings', formal.token, fullListing(photoKey, { [field]: value }));
    const id = (response.body as { id: string }).id;

    expect(response.status).toBe(201);
    expect((response.body as Record<string, unknown>)[field]).toBe('unknown');
    const row = await readListingRow(id);
    // Unknown times are stored as NULL; an Unknown storage condition is stored as the word "unknown" (D-44).
    if (field === 'storage') expect(row?.storage).toBe('unknown');
    else expect(row?.[field === 'prepTime' ? 'prep_time' : 'expiry_at']).toBeNull();
  });

  test.each(['room_temperature', 'chilled', 'frozen'])('FR-LST-04 storage %s is saved', async (storage) => {
    const response = await post('/listings', formal.token, fullListing(photoKey, { storage }));

    expect((response.body as { storage: string }).storage).toBe(storage);
  });

  test('FR-LST-04 the food category can be Unknown', async () => {
    const response = await post(
      '/listings',
      formal.token,
      fullListing(photoKey, { foodCategory: 'unknown' }),
    );

    expect((response.body as { foodCategory: string }).foodCategory).toBe('unknown');
  });
});

describe('FR-LST-02 Quick Post for informal vendors', () => {
  test("FR-LST-02 an informal vendor's Quick Post is saved as a Highly perishable Quick Post at the shop pin", async () => {
    const key = await photoKeyFor(informal.token);
    const response = await post('/listings/quick', informal.token, {
      photoKey: key,
      bagsTotal: 2,
      price: 25,
      pickupEnd: at(90),
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      isQuickPost: true,
      status: 'Active',
      listingType: 'Discounted Surplus Bag',
      perishabilityCategory: 'Highly perishable',
      foodCategory: 'unknown',
      originalValue: null,
      price: 25,
      bagsTotal: 2,
      bagsAvailable: 2,
      pickupStart: NOW.toISOString(),
      pickupEnd: at(90),
      prepTime: null,
      storage: null,
      expiryAt: null,
      latitude: SHOP.latitude,
      longitude: SHOP.longitude,
    });
    const row = await readListingRow((response.body as { id: string }).id);
    expect(row?.is_quick_post).toBe(true);
    expect(row?.original_value).toBeNull();
  });

  test('FR-LST-02 only photo, bags, price and pickup end time are read; other fields are ignored', async () => {
    const key = await photoKeyFor(informal.token);
    const response = await post('/listings/quick', informal.token, {
      photoKey: key,
      bagsTotal: 1,
      price: 10,
      pickupEnd: at(30),
      originalValue: 999,
      foodCategory: 'cooked_meals',
      location: { latitude: 1, longitude: 1 },
    });

    expect(response.body).toMatchObject({
      originalValue: null,
      foodCategory: 'unknown',
      latitude: SHOP.latitude,
    });
  });

  test('FR-LST-02 a formal vendor gets 403', async () => {
    const response = await post('/listings/quick', formal.token, {
      photoKey,
      bagsTotal: 1,
      price: 10,
      pickupEnd: at(30),
    });

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'quick_post_informal_only' });
  });

  test('E-LST-04 a Quick Post without a pickup end time is refused', async () => {
    const key = await photoKeyFor(informal.token);
    const response = await post('/listings/quick', informal.token, {
      photoKey: key,
      bagsTotal: 1,
      price: 10,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['pickupEnd'] });
  });

  test('E-LST-04 a Quick Post that ends now (the pickup start) is refused', async () => {
    const key = await photoKeyFor(informal.token);
    const response = await post('/listings/quick', informal.token, {
      photoKey: key,
      bagsTotal: 1,
      price: 10,
      pickupEnd: NOW.toISOString(),
    });

    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['pickupEnd'] });
  });

  test('E-LST-04 an empty Quick Post lists its four fields', async () => {
    const response = await post('/listings/quick', informal.token, {});

    expect(response.body).toEqual({
      error: 'E-LST-04',
      fields: ['photoKey', 'bagsTotal', 'price', 'pickupEnd'],
    });
  });
});

describe('E-LST-06 only approved vendors may create or publish listings', () => {
  test.each(['Pending', 'Rejected'])(
    'E-LST-06 a %s vendor gets 403 on every listing route',
    async (status) => {
      const vendor = await createVendor('informal', 'Approved');
      const key = await photoKeyFor(vendor.token);
      await setUserStatus(vendor.id, status);

      const responses = [
        await uploadPhoto(vendor.token),
        await post('/listings', vendor.token, fullListing(key)),
        await post('/listings/quick', vendor.token, {
          photoKey: key,
          bagsTotal: 1,
          price: 5,
          pickupEnd: at(30),
        }),
        await post('/listings/00000000-0000-0000-0000-000000000000/publish', vendor.token, {}),
      ];

      for (const response of responses) {
        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: 'E-LST-06' });
      }
    },
  );

  test('E-LST-06 a vendor who becomes Rejected cannot publish a Draft made while Approved', async () => {
    const vendor = await createVendor('formal', 'Approved');
    const key = await photoKeyFor(vendor.token);
    const created = await post('/listings', vendor.token, fullListing(key));
    await setUserStatus(vendor.id, 'Rejected');

    const response = await post(`/listings/${(created.body as { id: string }).id}/publish`, vendor.token, {});

    expect(response.body).toEqual({ error: 'E-LST-06' });
  });
});

describe('NFR-08a photo upload (C-26 Storage Adapter)', () => {
  test('NFR-08a the 500 KB limit is the settings row and the shared limit', async () => {
    const row = await getSetting('NFR-08a');

    expect(row?.value).toEqual({ max_photo_bytes: PHOTO_MAX_BYTES });
    expect(PHOTO_MAX_BYTES).toBe(500 * 1024);
  });

  test('NFR-08a a 600 KB upload is refused', async () => {
    const response = await uploadPhoto(formal.token, jpeg(600 * 1024));

    expect(response.status).toBe(413);
    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['photo'] });
  });

  test('NFR-08a a photo of exactly 500 KB is accepted and one byte more is refused', async () => {
    expect((await uploadPhoto(formal.token, jpeg(PHOTO_MAX_BYTES))).status).toBe(201);
    expect((await uploadPhoto(formal.token, jpeg(PHOTO_MAX_BYTES + 1))).status).toBe(413);
  });

  test('NFR-08a a photo of several megabytes is refused, not a server error', async () => {
    const response = await uploadPhoto(formal.token, jpeg(5 * 1024 * 1024));

    expect(response.status).toBe(413);
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
  function myListings(token: string) {
    return request(app).get('/listings').set('Authorization', `Bearer ${token}`);
  }

  test('FR-LST-06 the vendor gets every one of their listings, newest first, with its status', async () => {
    const vendor = await createVendor('informal');
    const key = await photoKeyFor(vendor.token);
    clock.now = () => new Date(NOW.getTime() - 60_000);
    const draft = await post('/listings', vendor.token, fullListing(key));
    clock.now = () => NOW;
    const quick = await post('/listings/quick', vendor.token, {
      photoKey: key,
      bagsTotal: 2,
      price: 15,
      pickupEnd: at(120),
    });

    const response = await myListings(vendor.token);

    expect(response.status).toBe(200);
    const listings = response.body as { id: string; status: string; isQuickPost: boolean }[];
    expect(listings.map((l) => l.id)).toEqual([
      (quick.body as { id: string }).id,
      (draft.body as { id: string }).id,
    ]);
    expect(listings.map((l) => [l.status, l.isQuickPost])).toEqual([
      ['Active', true],
      ['Draft', false],
    ]);
  });

  test("FR-LST-06 another vendor's listings are never included", async () => {
    const vendor = await createVendor('formal');
    await post('/listings', formal.token, fullListing(photoKey));

    const response = await myListings(vendor.token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  test('FR-LST-06 a listing keeps showing after it is published (Draft, then Active)', async () => {
    const vendor = await createVendor('formal');
    const key = await photoKeyFor(vendor.token);
    const created = await post('/listings', vendor.token, fullListing(key));
    const id = (created.body as { id: string }).id;
    await post(`/listings/${id}/publish`, vendor.token, {});

    const response = await myListings(vendor.token);

    expect(response.body).toMatchObject([{ id, status: 'Active', photoKey: key }]);
  });
});

describe('FR-LST-01 the vendor sees the photo of their listing (GET /listings/:id/photo)', () => {
  test('FR-LST-01 the photo is returned exactly as uploaded, with its type', async () => {
    const vendor = await createVendor('formal');
    const bytes = jpeg(3000);
    bytes[100] = 42;
    const key = ((await uploadPhoto(vendor.token, bytes)).body as { photoKey: string }).photoKey;
    const created = await post('/listings', vendor.token, fullListing(key));
    const id = (created.body as { id: string }).id;

    const response = await request(app)
      .get(`/listings/${id}/photo`)
      .set('Authorization', `Bearer ${vendor.token}`)
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
    const created = await post('/listings', formal.token, fullListing(photoKey));
    const id = (created.body as { id: string }).id;

    const response = await request(app)
      .get(`/listings/${id}/photo`)
      .set('Authorization', `Bearer ${informal.token}`);

    expect(response.status).toBe(404);
  });

  test('FR-LST-01 the photo of an id that is not a UUID is not found', async () => {
    const response = await request(app)
      .get('/listings/not-a-uuid/photo')
      .set('Authorization', `Bearer ${formal.token}`);

    expect(response.status).toBe(404);
  });
});

describe("GET /vendors/me: the vendor's shop details for the listing form", () => {
  test('FR-LST-02 the vendor gets the shop pin and the vendor type', async () => {
    const response = await request(app).get('/vendors/me').set('Authorization', `Bearer ${informal.token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      shopName: 'Fatma Bakery',
      vendorType: 'informal',
      address: '12 Tahrir Street, Dokki, Giza',
      latitude: SHOP.latitude,
      longitude: SHOP.longitude,
    });
  });
});
