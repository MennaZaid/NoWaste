// US-02 Vendor application and US-03 Partner application: POST /auth/register with role vendor, charity or
// composting (SDD IApi, C-03 Account Service). Tests come from FR-ACC-02, FR-ACC-03, E-ACC-01, E-ACC-02 and SRS 2.7.
// They run against the real nowaste_test database.
import request from 'supertest';
import { FOOD_CATEGORIES } from '@nowaste/shared';
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { findUserByEmail } from '../src/data/userRepository.js';
import {
  countUsers,
  deleteAllUsers,
  listFoodCategoryEnum,
  readPartnerProfile,
  readVendorProfile,
} from './helpers/database.js';

const app = createApp();

function register(body: Record<string, unknown>) {
  return request(app).post('/auth/register').send(body);
}

const account = { password: 'abcd1234', language: 'en' };

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
  acceptedFoodTypes: ['bread_and_baked_goods', 'cooked_meals'],
};

function vendor(overrides: Record<string, unknown> = {}, email = 'shop@example.com') {
  return register({ ...account, email, role: 'vendor', vendorProfile: { ...vendorProfile, ...overrides } });
}

function partner(overrides: Record<string, unknown> = {}, role = 'charity', email = 'org@example.com') {
  return register({ ...account, email, role, partnerProfile: { ...partnerProfile, ...overrides } });
}

beforeEach(async () => {
  await deleteAllUsers();
});

afterAll(async () => {
  await deleteAllUsers();
  await closePool();
});

describe('FR-ACC-02 vendor application', () => {
  test.each(['formal', 'informal'])(
    'FR-ACC-02 a %s vendor application is saved as Pending with the pin stored as GEOGRAPHY',
    async (vendorType) => {
      const response = await vendor({ vendorType });

      expect(response.status).toBe(201);
      const body = response.body as Record<string, unknown>;
      expect(body).toEqual({ id: body.id, role: 'vendor', status: 'Pending' });

      const user = await findUserByEmail('shop@example.com');
      expect(user?.role).toBe('vendor');
      expect(user?.status).toBe('Pending');

      const profile = await readVendorProfile(String(body.id));
      expect(profile).toEqual({
        shopName: 'Fatma Bakery',
        vendorType,
        address: '12 Tahrir Street, Dokki, Giza',
        // D-26: stored in +20 form, like the account phone.
        contact: '+201012345678',
        description: null,
        autoCharityOptIn: false,
        averageRating: null,
        locationType: 'geography',
        latitude: 30.0381,
        longitude: 31.2122,
      });
    },
  );

  test('FR-ACC-02 the shop name, address, contact and description are stored trimmed', async () => {
    const response = await vendor({
      shopName: '  Fatma Bakery ',
      address: ' Dokki ',
      contact: ' 01012345678 ',
      description: '  Fresh bread baked daily ',
    });

    const profile = await readVendorProfile((response.body as { id: string }).id);
    expect(profile?.shopName).toBe('Fatma Bakery');
    expect(profile?.address).toBe('Dokki');
    expect(profile?.contact).toBe('+201012345678');
    expect(profile?.description).toBe('Fresh bread baked daily');
  });
});

describe('D-26 vendor information format: contact phone, description, rating, lengths', () => {
  async function storedContact(contact: string) {
    const response = await vendor({ contact });
    expect(response.status).toBe(201);
    return (await readVendorProfile((response.body as { id: string }).id))?.contact;
  }

  test.each([
    ['a mobile number', '01212345678', '+201212345678'],
    ['a Cairo landline (02 + 8 digits)', '0223456789', '+20223456789'],
    ['an Alexandria landline (03 + 7 digits)', '031234567', '+2031234567'],
    ['a landline with a 3-digit area code (040 + 7 digits)', '0401234567', '+20401234567'],
    ['a number typed with Arabic-Indic digits', '٠٢٢٣٤٥٦٧٨٩', '+20223456789'],
  ])('E-ACC-02 contact: %s is accepted and stored in +20 form', async (_case, contact, stored) => {
    expect(await storedContact(contact)).toBe(stored);
  });

  test.each([
    ['too short for a landline (8 digits)', '02234567'],
    ['too long for a landline (11 digits)', '02234567890'],
    ['a mobile number with 10 digits', '0101234567'],
    ['a mobile number with a wrong prefix', '01312345678'],
    ['no leading 0', '223456789'],
    ['letters', 'call the shop'],
    ['a short hotline', '19999'],
  ])('E-ACC-02 contact: %s is rejected', async (_case, contact) => {
    const response = await vendor({ contact });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['contact'] });
  });

  test.each([
    ['missing', undefined],
    ['empty', ''],
    ['only spaces', '   '],
  ])('FR-ACC-02 description %s is optional and stored as empty (null)', async (_case, description) => {
    const response = await vendor({ description });

    expect(response.status).toBe(201);
    expect((await readVendorProfile((response.body as { id: string }).id))?.description).toBeNull();
  });

  test.each([
    [299, 201],
    [300, 201],
    [301, 400],
  ])('E-ACC-02 description of %d characters returns %d', async (length, status) => {
    const response = await vendor({ description: 'خ'.repeat(length) });

    expect(response.status).toBe(status);
    if (status === 400) expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['description'] });
  });

  test('E-ACC-02 a description that is not text is rejected', async () => {
    const response = await vendor({ description: 42 });

    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['description'] });
  });

  test.each([
    [79, 201],
    [80, 201],
    [81, 400],
  ])('E-ACC-02 shop name of %d characters returns %d', async (length, status) => {
    const response = await vendor({ shopName: 'م'.repeat(length) });

    expect(response.status).toBe(status);
    if (status === 400) expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['shopName'] });
  });

  test.each([
    [79, 201],
    [80, 201],
    [81, 400],
  ])('E-ACC-02 organisation name of %d characters returns %d', async (length, status) => {
    const response = await partner({ organisationName: 'b'.repeat(length) });

    expect(response.status).toBe(status);
    if (status === 400) expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['organisationName'] });
  });

  test.each([
    [199, 201],
    [200, 201],
    [201, 400],
  ])('E-ACC-02 address of %d characters returns %d', async (length, status) => {
    const vendorResponse = await vendor({ address: 'a'.repeat(length) }, 'v@example.com');
    const partnerResponse = await partner({ address: 'a'.repeat(length) }, 'charity', 'p@example.com');

    expect(vendorResponse.status).toBe(status);
    expect(partnerResponse.status).toBe(status);
    if (status === 400) expect(vendorResponse.body).toEqual({ error: 'E-ACC-02', fields: ['address'] });
  });

  test('FR-ACC-02 a rating sent with the application is ignored; the rating stays empty until US-40', async () => {
    const response = await vendor({ averageRating: 5, rating: 5 });

    expect(response.status).toBe(201);
    expect((await readVendorProfile((response.body as { id: string }).id))?.averageRating).toBeNull();
  });
});

describe('FR-ACC-03 partner application', () => {
  test.each(['charity', 'composting'])(
    'FR-ACC-03 a %s partner application is saved as Pending with its accepted food types',
    async (role) => {
      const response = await partner({}, role);

      expect(response.status).toBe(201);
      const body = response.body as Record<string, unknown>;
      expect(body).toEqual({ id: body.id, role, status: 'Pending' });

      const user = await findUserByEmail('org@example.com');
      expect(user?.role).toBe(role);
      expect(user?.status).toBe('Pending');

      const profile = await readPartnerProfile(String(body.id));
      expect(profile).toEqual({
        organisationName: 'Giza Food Bank',
        partnerType: role,
        address: '5 Nile Corniche, Giza',
        acceptedFoodTypes: ['bread_and_baked_goods', 'cooked_meals'],
        otherPartnerType: null,
        otherFoodType: null,
        locationType: 'geography',
        latitude: 30.0131,
        longitude: 31.2089,
      });
    },
  );

  test('FR-ACC-03 the six food categories in the database match the shared list (SRS Appendix A)', async () => {
    expect(FOOD_CATEGORIES).toHaveLength(6);
    expect(await listFoodCategoryEnum()).toEqual([...FOOD_CATEGORIES]);
  });

  test('FR-ACC-03 a food type sent twice is stored once', async () => {
    const response = await partner({ acceptedFoodTypes: ['cooked_meals', 'cooked_meals'] });

    const profile = await readPartnerProfile((response.body as { id: string }).id);
    expect(profile?.acceptedFoodTypes).toEqual(['cooked_meals']);
  });
});

describe('FR-ACC-03 D-31 Other partner type and Other food type', () => {
  test('FR-ACC-03 an Other partner is saved as Pending with role other and the written type', async () => {
    const response = await partner({ otherPartnerType: '  Mosque food committee ' }, 'other');

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ role: 'other', status: 'Pending' });
    const user = await findUserByEmail('org@example.com');
    expect(user?.role).toBe('other');
    const profile = await readPartnerProfile((response.body as { id: string }).id);
    expect(profile).toMatchObject({ partnerType: 'other', otherPartnerType: 'Mosque food committee' });
  });

  test('FR-ACC-03 Other food type is stored as written text beside the chosen categories', async () => {
    const response = await partner({
      acceptedFoodTypes: ['cooked_meals', 'other'],
      otherFoodType: ' Animal feed ',
    });

    expect(response.status).toBe(201);
    const profile = await readPartnerProfile((response.body as { id: string }).id);
    expect(profile).toMatchObject({ acceptedFoodTypes: ['cooked_meals'], otherFoodType: 'Animal feed' });
  });

  test('FR-ACC-03 Other alone is enough as the accepted food type', async () => {
    const response = await partner({ acceptedFoodTypes: ['other'], otherFoodType: 'Spices' });

    expect(response.status).toBe(201);
    const profile = await readPartnerProfile((response.body as { id: string }).id);
    expect(profile).toMatchObject({ acceptedFoodTypes: [], otherFoodType: 'Spices' });
  });

  test('FR-ACC-03 the Other texts are ignored when Other is not chosen', async () => {
    const response = await partner({ otherPartnerType: 'x', otherFoodType: 'y' }, 'charity');

    const profile = await readPartnerProfile((response.body as { id: string }).id);
    expect(profile).toMatchObject({ otherPartnerType: null, otherFoodType: null });
  });

  test.each([undefined, '', '   ', 'a'.repeat(81), 5])(
    'E-ACC-02 an Other partner type of %p is rejected',
    async (otherPartnerType) => {
      const response = await partner({ otherPartnerType }, 'other');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['otherPartnerType'] });
      expect(await countUsers()).toBe(0);
    },
  );

  test.each([undefined, '', 'a'.repeat(81)])(
    'E-ACC-02 an Other food type of %p is rejected',
    async (otherFoodType) => {
      const response = await partner({ acceptedFoodTypes: ['other'], otherFoodType });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['otherFoodType'] });
    },
  );

  test('E-ACC-02 Other texts of 80 characters are accepted', async () => {
    const response = await partner(
      { otherPartnerType: 'a'.repeat(80), acceptedFoodTypes: ['other'], otherFoodType: 'b'.repeat(80) },
      'other',
    );

    expect(response.status).toBe(201);
  });
});

describe('E-ACC-02 invalid application fields', () => {
  test.each([-90, 90])('E-ACC-02 latitude %d is accepted', async (latitude) => {
    expect((await vendor({ latitude })).status).toBe(201);
  });

  test.each([-90.0001, 90.0001])('E-ACC-02 latitude %d is rejected', async (latitude) => {
    const response = await vendor({ latitude });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['latitude'] });
    expect(await countUsers()).toBe(0);
  });

  test.each([-180, 180])('E-ACC-02 longitude %d is accepted', async (longitude) => {
    expect((await vendor({ longitude })).status).toBe(201);
  });

  test.each([-180.0001, 180.0001])('E-ACC-02 longitude %d is rejected', async (longitude) => {
    const response = await vendor({ longitude });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['longitude'] });
    expect(await countUsers()).toBe(0);
  });

  test.each([
    ['a string', '30.0'],
    ['missing', undefined],
  ])('E-ACC-02 latitude and longitude that are %s are rejected', async (_case, value) => {
    const response = await partner({ latitude: value, longitude: value });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['latitude', 'longitude'] });
  });

  test('E-ACC-02 zero accepted food types is rejected', async () => {
    const response = await partner({ acceptedFoodTypes: [] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['acceptedFoodTypes'] });
    expect(await countUsers()).toBe(0);
  });

  test('E-ACC-02 one accepted food type is accepted', async () => {
    expect((await partner({ acceptedFoodTypes: ['dairy_and_eggs'] })).status).toBe(201);
  });

  test('E-ACC-02 all six accepted food types are accepted', async () => {
    const response = await partner({ acceptedFoodTypes: [...FOOD_CATEGORIES] }, 'composting');

    expect(response.status).toBe(201);
    const profile = await readPartnerProfile((response.body as { id: string }).id);
    expect(profile?.acceptedFoodTypes).toEqual([...FOOD_CATEGORIES]);
  });

  test('E-ACC-02 an unknown food type is rejected', async () => {
    const response = await partner({ acceptedFoodTypes: ['cooked_meals', 'sweets'] });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['acceptedFoodTypes'] });
  });

  test('E-ACC-02 accepted food types that are not a list are rejected', async () => {
    const response = await partner({ acceptedFoodTypes: 'cooked_meals' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['acceptedFoodTypes'] });
  });

  test.each(['', '   '])('E-ACC-02 an empty shop name (%j) is rejected', async (shopName) => {
    const response = await vendor({ shopName });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['shopName'] });
  });

  test('E-ACC-02 an empty organisation name is rejected', async () => {
    const response = await partner({ organisationName: ' ' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['organisationName'] });
  });

  test.each(['Formal', 'restaurant', ''])('E-ACC-02 vendor type %j is rejected', async (vendorType) => {
    const response = await vendor({ vendorType });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['vendorType'] });
  });

  test('E-ACC-02 an empty address is rejected for vendors and partners', async () => {
    const vendorResponse = await vendor({ address: '' });
    const partnerResponse = await partner({ address: '  ' });

    expect(vendorResponse.body).toEqual({ error: 'E-ACC-02', fields: ['address'] });
    expect(partnerResponse.body).toEqual({ error: 'E-ACC-02', fields: ['address'] });
  });

  test('E-ACC-02 an empty vendor contact is rejected', async () => {
    const response = await vendor({ contact: '' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['contact'] });
  });

  test('E-ACC-02 a missing vendor profile lists every vendor field', async () => {
    const response = await register({ ...account, email: 'shop@example.com', role: 'vendor' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'E-ACC-02',
      fields: ['shopName', 'vendorType', 'address', 'latitude', 'longitude', 'contact'],
    });
  });

  test('E-ACC-02 a missing partner profile lists every partner field', async () => {
    const response = await register({ ...account, email: 'org@example.com', role: 'composting' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'E-ACC-02',
      fields: ['organisationName', 'address', 'latitude', 'longitude', 'acceptedFoodTypes'],
    });
  });

  test('E-ACC-02 account and profile errors are listed together, account fields first', async () => {
    const response = await register({
      email: 'not-an-email',
      password: 'short',
      language: 'en',
      role: 'vendor',
      vendorProfile: { ...vendorProfile, shopName: '', latitude: 91 },
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'E-ACC-02',
      fields: ['email', 'password', 'shopName', 'latitude'],
    });
  });

  test('E-ACC-02 a vendor application uses the US-01 password rules', async () => {
    const response = await register({
      ...account,
      password: 'abcdefgh',
      email: 'shop@example.com',
      role: 'vendor',
      vendorProfile,
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['password'] });
  });

  test('E-ACC-02 a partner application uses the US-01 phone rules and stores +20', async () => {
    const response = await register({ ...account, phone: '01112345678', role: 'charity', partnerProfile });

    expect(response.status).toBe(201);
    const badPhone = await register({ ...account, phone: '0131234567', role: 'charity', partnerProfile });
    expect(badPhone.body).toEqual({ error: 'E-ACC-02', fields: ['phone'] });
  });
});

describe('E-ACC-01 email or phone already registered', () => {
  test('E-ACC-01 a vendor using an email a consumer already has is refused', async () => {
    await register({ ...account, email: 'mona@example.com' });
    const response = await vendor({}, 'MONA@example.com');

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'E-ACC-01', field: 'email' });
    expect(await countUsers()).toBe(1);
  });

  test('E-ACC-01 a partner using a phone a vendor already has is refused and no profile is left behind', async () => {
    await register({ ...account, phone: '01012345678', role: 'vendor', vendorProfile });
    const response = await register({ ...account, phone: '01012345678', role: 'charity', partnerProfile });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'E-ACC-01', field: 'phone' });
    expect(await countUsers()).toBe(1);
  });
});

describe('SRS 2.7 administrator accounts are created by the team', () => {
  test('E-ACC-02 registration with role admin is refused with 400 and nothing is created', async () => {
    const response = await register({ ...account, email: 'boss@example.com', role: 'admin' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['role'] });
    expect(await countUsers()).toBe(0);
  });

  test.each(['customer', 5, ''])('E-ACC-02 an unknown role %j is refused', async (role) => {
    const response = await register({ ...account, email: 'x@example.com', role });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-ACC-02', fields: ['role'] });
  });

  test('FR-ACC-01 role consumer, or no role, still creates an Active consumer and ignores any profile', async () => {
    const withRole = await register({ ...account, email: 'a@example.com', role: 'consumer', vendorProfile });
    const withoutRole = await register({ ...account, email: 'b@example.com' });

    expect((withRole.body as { status: string }).status).toBe('Active');
    expect((withoutRole.body as { role: string }).role).toBe('consumer');
    expect(await readVendorProfile((withRole.body as { id: string }).id)).toBeUndefined();
  });
});
