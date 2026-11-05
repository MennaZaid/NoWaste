// US-19 Recommended destination (SDD C-07 Routing Service). Tests come from FR-RTE-05, FR-RTE-06, FR-RTE-07 and
// E-RTE-02, and the SRS impact table ("consumers at a discount first, then charity, then composting, with landfill
// only as a last resort"). They run against the real nowaste_test database with a fixed clock.
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { clock } from '../src/domain/clock.js';
import { getDestinations } from '../src/services/routing/routingService.js';
import {
  clearListingCategory,
  deleteAllUsers,
  readListingRow,
  readSettingValue,
  setSettingValue,
} from './helpers/database.js';
import {
  createDraft,
  createPartner,
  createVendor,
  get,
  post,
  quickPostBody,
  readyToPublish,
} from './helpers/listings.js';

const app = createApp();
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

type Option = {
  destination: string;
  partners: number | null;
  nearestPartnerMeters: number | null;
  available: boolean;
};
type Destinations = { options: Option[]; recommended: string | null; timeLeftMinutes: number };

let savedRadius: unknown;

beforeAll(async () => {
  savedRadius = await readSettingValue('FR-RTE-05');
});

beforeEach(async () => {
  clock.now = () => NOW;
  await deleteAllUsers();
});

afterEach(async () => {
  clock.now = realNow;
  await setSettingValue('FR-RTE-05', savedRadius);
});

afterAll(async () => {
  await deleteAllUsers();
  await closePool();
});

/** A vendor with a cooked-meals Draft (its category is set on saving, D-70). Returns the vendor token and the id. */
async function confirmedDraft(overrides: Record<string, unknown> = {}) {
  const vendor = await createVendor(app);
  const id = await createDraft(app, vendor.token, at, overrides);
  return { token: vendor.token, id };
}

async function destinationsOf(token: string, id: string): Promise<Destinations> {
  const response = await get(app, `/listings/${id}/destinations`, token);
  expect(response.status).toBe(200);
  return response.body as Destinations;
}

describe('FR-RTE-05 FR-RTE-07 decision table: unfit food x matching charity x matching composting partner', () => {
  test.each<[boolean, boolean, boolean, string[], string]>([
    [false, true, true, ['consumers', 'charity', 'composting', 'landfill'], 'consumers'],
    [false, true, false, ['consumers', 'charity', 'landfill'], 'consumers'],
    [false, false, true, ['consumers', 'composting', 'landfill'], 'consumers'],
    [false, false, false, ['consumers', 'landfill'], 'consumers'],
    [true, true, true, ['composting', 'landfill'], 'composting'],
    [true, true, false, ['landfill'], 'landfill'],
    [true, false, true, ['composting', 'landfill'], 'composting'],
    [true, false, false, ['landfill'], 'landfill'],
  ])(
    'FR-RTE-05 unfit %s, charity %s, composting %s: eligible %j, top %s',
    async (unfit, charity, composting, eligible, top) => {
      if (charity) await createPartner(app, 'charity');
      if (composting) await createPartner(app, 'composting');
      const { token, id } = await confirmedDraft();
      if (unfit) await post(app, `/listings/${id}/unfit`, token, { unfitForPeople: true });

      const result = await destinationsOf(token, id);

      expect(result.options.map((o) => o.destination)).toEqual(eligible);
      expect(result.recommended).toBe(top);
    },
  );
});

describe('FR-RTE-05 which partners count', () => {
  test('FR-RTE-05 a charity that does not accept the food category does not count', async () => {
    await createPartner(app, 'charity', { acceptedFoodTypes: ['dairy_and_eggs'] });
    const { token, id } = await confirmedDraft();

    expect((await destinationsOf(token, id)).options.map((o) => o.destination)).not.toContain('charity');
  });

  test.each(['Pending', 'Rejected', 'Suspended'])('FR-RTE-05 a %s charity does not count', async (status) => {
    await createPartner(app, 'charity', { status });
    const { token, id } = await confirmedDraft();

    expect((await destinationsOf(token, id)).options.map((o) => o.destination)).not.toContain('charity');
  });

  test('FR-RTE-05 with the food category Unknown, no partner can be matched', async () => {
    await createPartner(app, 'charity');
    await createPartner(app, 'composting');
    const { token, id } = await confirmedDraft({ foodCategory: 'unknown' });

    expect((await destinationsOf(token, id)).options.map((o) => o.destination)).toEqual([
      'consumers',
      'landfill',
    ]);
  });

  test('FR-RTE-05 the number of matching partners and the distance to the nearest are shown (ST_Distance)', async () => {
    await createPartner(app, 'charity', { latitude: 30.0131, longitude: 31.2089 }); // about 2.8 km from the shop
    await createPartner(app, 'charity', { latitude: 30.1, longitude: 31.3 }); // about 11 km
    const { token, id } = await confirmedDraft();

    const charity = (await destinationsOf(token, id)).options.find((o) => o.destination === 'charity');

    expect(charity?.partners).toBe(2);
    expect(charity?.nearestPartnerMeters).toBeGreaterThan(2500);
    expect(charity?.nearestPartnerMeters).toBeLessThan(3100);
  });

  test('FR-RTE-05 with no radius set (NULL) a far partner still counts', async () => {
    await createPartner(app, 'charity', { latitude: 31.2, longitude: 29.9 }); // Alexandria, about 180 km
    const { token, id } = await confirmedDraft();

    expect((await destinationsOf(token, id)).options.map((o) => o.destination)).toContain('charity');
  });

  test('FR-RTE-05 a radius in the settings table leaves out partners farther away', async () => {
    await createPartner(app, 'charity', { latitude: 31.2, longitude: 29.9 });
    await setSettingValue('FR-RTE-05', { partner_radius_km: 50 });
    const { token, id } = await confirmedDraft();

    expect((await destinationsOf(token, id)).options.map((o) => o.destination)).not.toContain('charity');
  });

  test('FR-RTE-05 the time left in the pickup window is returned with the options', async () => {
    // D-64: cooked meals at room temperature from now + 10 min: picked up by now + 130 min.
    const { token, id } = await confirmedDraft();

    expect((await destinationsOf(token, id)).timeLeftMinutes).toBe(130);
  });

  test('FR-RTE-05 landfill is shown last and marked as not available yet (US-25)', async () => {
    const { token, id } = await confirmedDraft();

    const options = (await destinationsOf(token, id)).options;

    expect(options.at(-1)).toMatchObject({ destination: 'landfill', available: false });
    expect(options.slice(0, -1).every((o) => o.available)).toBe(true);
  });
});

describe('FR-RTE-06 the chosen destination sets the listing type', () => {
  test.each<[string, string]>([
    ['consumers', 'Discounted Surplus Bag'],
    ['charity', 'Donation'],
    ['composting', 'Compost offer'],
  ])('FR-RTE-06 choosing %s makes the listing a %s', async (destination, listingType) => {
    await createPartner(app, 'charity');
    await createPartner(app, 'composting');
    const { token, id } = await confirmedDraft();

    const response = await post(app, `/listings/${id}/destination`, token, { destination });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ listingType });
    expect((await readListingRow(id))?.listing_type).toBe(listingType);
  });

  test('FR-RTE-13 choosing landfill says it is not available yet and changes nothing', async () => {
    const { token, id } = await confirmedDraft();

    const response = await post(app, `/listings/${id}/destination`, token, { destination: 'landfill' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'landfill_not_available' });
    expect((await readListingRow(id))?.listing_type).toBeNull();
  });

  test('FR-RTE-06 a destination that is not eligible is refused', async () => {
    const { token, id } = await confirmedDraft(); // no charity partner at all

    const response = await post(app, `/listings/${id}/destination`, token, { destination: 'charity' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'destination_not_eligible' });
  });

  test('E-LST-04 an unknown destination is refused', async () => {
    const { token, id } = await confirmedDraft();

    const response = await post(app, `/listings/${id}/destination`, token, { destination: 'market' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['destination'] });
  });

  test('FR-RTE-06 D-72 a Draft without a category (saved before D-70) gets its estimate when it chooses a destination', async () => {
    const vendor = await createVendor(app);
    const id = await createDraft(app, vendor.token, at);
    await clearListingCategory(id);

    const response = await post(app, `/listings/${id}/destination`, vendor.token, {
      destination: 'consumers',
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ perishabilityCategory: 'Highly perishable' });
    expect((await readListingRow(id))?.perishability_category).toBe('Highly perishable');
  });

  test('FR-RTE-05 D-72 a Draft without a category (saved before D-70) can see its destinations', async () => {
    const vendor = await createVendor(app);
    const id = await createDraft(app, vendor.token, at);
    await clearListingCategory(id);

    expect((await get(app, `/listings/${id}/destinations`, vendor.token)).status).toBe(200);
  });
});

describe('FR-RTE-07 food unfit for people goes only to composting', () => {
  test('FR-RTE-07 the vendor marks the food unfit; consumers and charity are then refused', async () => {
    await createPartner(app, 'charity');
    await createPartner(app, 'composting');
    const { token, id } = await confirmedDraft();

    const marked = await post(app, `/listings/${id}/unfit`, token, { unfitForPeople: true });

    expect(marked.status).toBe(200);
    expect(marked.body).toMatchObject({ unfitForPeople: true });
    expect((await post(app, `/listings/${id}/destination`, token, { destination: 'consumers' })).status).toBe(
      409,
    );
    expect((await post(app, `/listings/${id}/destination`, token, { destination: 'charity' })).status).toBe(
      409,
    );
    expect(
      (await post(app, `/listings/${id}/destination`, token, { destination: 'composting' })).status,
    ).toBe(200);
  });

  test('FR-RTE-07 marking the food unfit clears a destination chosen before, so it must be chosen again', async () => {
    await createPartner(app, 'composting');
    const { token, id } = await confirmedDraft();
    await post(app, `/listings/${id}/destination`, token, { destination: 'consumers' });

    await post(app, `/listings/${id}/unfit`, token, { unfitForPeople: true });

    expect((await readListingRow(id))?.listing_type).toBeNull();
  });

  test('E-LST-04 the unfit mark must be true or false', async () => {
    const { token, id } = await confirmedDraft();

    const response = await post(app, `/listings/${id}/unfit`, token, { unfitForPeople: 'yes' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['unfitForPeople'] });
  });
});

describe('E-RTE-02 when the recommendation fails, the vendor still chooses', () => {
  test('E-RTE-02 with ranking forced to fail, the eligible options come back with no recommendation', async () => {
    await createPartner(app, 'composting');
    const vendor = await createVendor(app);
    const id = await createDraft(app, vendor.token, at);

    const result = await getDestinations(vendor.id, id, () => {
      throw new Error('ranking failed');
    });

    expect(result.recommended).toBeNull();
    expect(result.options.map((o) => o.destination)).toEqual(['consumers', 'composting', 'landfill']);
    expect(
      (await post(app, `/listings/${id}/destination`, vendor.token, { destination: 'composting' })).status,
    ).toBe(200);
  });
});

describe('FR-RTE-03 FR-RTE-06 publishing needs a confirmed category and a chosen destination', () => {
  test('FR-RTE-03 a Draft without a category (saved before D-70) or destination cannot be published', async () => {
    const vendor = await createVendor(app);
    const id = await createDraft(app, vendor.token, at);
    await clearListingCategory(id);

    const response = await post(app, `/listings/${id}/publish`, vendor.token);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: 'not_ready_to_publish',
      missing: ['perishabilityCategory', 'destination'],
    });
  });

  test('FR-RTE-06 a Draft with a confirmed category but no destination cannot be published', async () => {
    const { token, id } = await confirmedDraft();

    const response = await post(app, `/listings/${id}/publish`, token);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'not_ready_to_publish', missing: ['destination'] });
  });

  test('FR-RTE-06 with both, the Draft is published as Active with its category and listing type', async () => {
    const vendor = await createVendor(app);
    const id = await createDraft(app, vendor.token, at);
    await readyToPublish(app, vendor.token, id);

    const response = await post(app, `/listings/${id}/publish`, vendor.token);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'Active',
      perishabilityCategory: 'Highly perishable',
      listingType: 'Discounted Surplus Bag',
    });
  });
});

// D-68 (2026-11-04, asked for by Maryam): a Quick Post is still published at once for consumers (D-43), and right after
// posting the informal vendor may send it to a charity or composting partner instead. A Quick Post may say its food
// category (optional, Unknown by default) so that partners who accept that food can be matched.
describe('D-68 an informal vendor may change the destination of a Quick Post after posting', () => {
  async function quickPost(foodCategory?: string) {
    const vendor = await createVendor(app, 'informal');
    const body = await quickPostBody(app, vendor.token, at);
    const posted = await post(
      app,
      '/listings/quick',
      vendor.token,
      foodCategory === undefined ? body : { ...body, foodCategory },
    );
    if (posted.status !== 201) throw new Error(`quick post failed: ${JSON.stringify(posted.body)}`);
    return { token: vendor.token, id: (posted.body as { id: string }).id };
  }

  test('FR-LST-02 D-68 a Quick Post with a food category stores it; without one it is Unknown', async () => {
    const withCategory = await quickPost('cooked_meals');
    const without = await quickPost();

    expect((await get(app, `/listings/${withCategory.id}`, withCategory.token)).body).toMatchObject({
      foodCategory: 'cooked_meals',
      listingType: 'Discounted Surplus Bag',
      status: 'Active',
    });
    expect((await get(app, `/listings/${without.id}`, without.token)).body).toMatchObject({
      foodCategory: 'unknown',
    });
  });

  test('E-LST-04 D-68 a Quick Post with a food category that does not exist is refused', async () => {
    const vendor = await createVendor(app, 'informal');
    const body = await quickPostBody(app, vendor.token, at);

    const response = await post(app, '/listings/quick', vendor.token, { ...body, foodCategory: 'sweets' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-LST-04', fields: ['foodCategory'] });
  });

  test('FR-RTE-05 D-68 the destinations of a Quick Post list the matching partners, consumers recommended', async () => {
    await createPartner(app, 'charity');
    const { token, id } = await quickPost('cooked_meals');

    const destinations = (await get(app, `/listings/${id}/destinations`, token)).body as Destinations;

    expect(destinations.recommended).toBe('consumers');
    expect(destinations.options.find((o) => o.destination === 'charity')).toMatchObject({ partners: 1 });
  });

  test('FR-RTE-06 D-68 an Active Quick Post can be sent to a charity, and then it is a Donation', async () => {
    await createPartner(app, 'charity');
    const { token, id } = await quickPost('cooked_meals');

    const response = await post(app, `/listings/${id}/destination`, token, { destination: 'charity' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ listingType: 'Donation', status: 'Active' });
    expect((await readListingRow(id))?.listing_type).toBe('Donation');
  });

  test('FR-RTE-06 D-68 it can be sent back to consumers', async () => {
    await createPartner(app, 'charity');
    const { token, id } = await quickPost('cooked_meals');
    await post(app, `/listings/${id}/destination`, token, { destination: 'charity' });

    const response = await post(app, `/listings/${id}/destination`, token, { destination: 'consumers' });

    expect(response.body).toMatchObject({ listingType: 'Discounted Surplus Bag' });
  });

  test('FR-RTE-05 D-68 a Quick Post with food category Unknown matches no partner, so charity cannot be chosen', async () => {
    await createPartner(app, 'charity');
    const { token, id } = await quickPost();

    const response = await post(app, `/listings/${id}/destination`, token, { destination: 'charity' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'destination_not_eligible' });
  });

  test('FR-RTE-06 D-68 once the pickup has ended the destination cannot be changed', async () => {
    await createPartner(app, 'charity');
    const { token, id } = await quickPost('cooked_meals');
    clock.now = () => new Date(NOW.getTime() + 121 * 60_000);

    const response = await post(app, `/listings/${id}/destination`, token, { destination: 'charity' });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'pickup_ended' });
  });

  test('FR-RTE-06 an Active full listing still cannot change its destination (only a Draft can)', async () => {
    const vendor = await createVendor(app);
    const id = await createDraft(app, vendor.token, at);
    await readyToPublish(app, vendor.token, id);
    await post(app, `/listings/${id}/publish`, vendor.token);

    const response = await post(app, `/listings/${id}/destination`, vendor.token, {
      destination: 'consumers',
    });

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'listing_not_draft', status: 'Active' });
  });
});
