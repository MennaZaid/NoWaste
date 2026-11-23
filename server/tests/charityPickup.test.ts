// US-22 Charity pickup (SRS 4.3 "Donation and compost pickups", SDD C-10 Partner Offer Service, IPartnerOffer).
// Tests come from FR-RTE-10, E-RTE-03, E-RTE-04, the "Partner cancels" alternative flow and FR-RES-10 (the vendor
// enters the charity's pickup code). Decisions D-108 to D-110. Runs against nowaste_test with a fixed clock.
import { closePool } from '../src/data/db.js';
import { createApp } from '../src/api/app.js';
import { clock } from '../src/domain/clock.js';
import { tokenFor } from './helpers/accounts.js';
import { deleteAllUsers, readSettingValue, setSettingValue, setUserStatus } from './helpers/database.js';
import { createDraft, createPartnerAccount, createVendor, get, post } from './helpers/listings.js';

const app = createApp();
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

// createDraft: cooked meals at room temperature, pickup from at(10); the worked-out end is at(130) (2 h shelf-life).
const START = at(10);
const END = at(130);

let vendor: { id: string; token: string };
let savedRadius: unknown;

/** A published Donation listing (destination charity) of `vendor`. */
async function donation(): Promise<string> {
  const id = await createDraft(app, vendor.token, at);
  const chosen = await post(app, `/listings/${id}/destination`, vendor.token, { destination: 'charity' });
  if (chosen.status !== 200) throw new Error(`destination failed: ${JSON.stringify(chosen.body)}`);
  const published = await post(app, `/listings/${id}/publish`, vendor.token);
  if (published.status !== 200) throw new Error(`publish failed: ${JSON.stringify(published.body)}`);
  return id;
}

async function charity(options: Parameters<typeof createPartnerAccount>[2] = {}) {
  return createPartnerAccount(app, 'charity', options);
}

const offersOf = async (token: string) =>
  ((await get(app, '/partner/offers', token)).body as { offers: { listingId: string }[] }).offers;

const accept = (token: string, listingId: string, pickupTime: unknown = at(30)) =>
  post(app, `/partner/offers/${listingId}/accept`, token, { pickupTime });

beforeAll(async () => {
  savedRadius = await readSettingValue('FR-RTE-05');
});

beforeEach(async () => {
  clock.now = () => NOW;
  await deleteAllUsers();
  await setSettingValue('FR-RTE-05', savedRadius);
  vendor = await createVendor(app, 'formal');
});

afterEach(() => {
  clock.now = realNow;
});

afterAll(async () => {
  await setSettingValue('FR-RTE-05', savedRadius);
  await deleteAllUsers();
  await closePool();
});

describe('FR-RTE-10 charity partners see the Donation listings they can take', () => {
  test('FR-RTE-10 an approved charity that accepts the food type sees the Donation with its details', async () => {
    const partner = await charity();
    const id = await donation();

    const response = await get(app, '/partner/offers', partner.token);

    expect(response.status).toBe(200);
    const offers = (response.body as { offers: Record<string, unknown>[] }).offers;
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({
      listingId: id,
      shopName: 'Fatma Bakery',
      address: '12 Tahrir Street, Dokki, Giza',
      nameEn: 'Koshari',
      foodCategory: 'cooked_meals',
      bags: 3,
      pickupStart: START,
      pickupEnd: END,
    });
    expect(typeof offers[0]?.distanceMeters).toBe('number');
  });

  test('FR-RTE-10 a charity that does not accept the food type does not see it', async () => {
    const partner = await charity({ acceptedFoodTypes: ['dairy_and_eggs'] });
    await charity();
    await donation();

    expect(await offersOf(partner.token)).toEqual([]);
  });

  test('FR-RTE-10 FR-RTE-05 a charity farther than the partner distance setting does not see it', async () => {
    await setSettingValue('FR-RTE-05', { partner_radius_km: 1 });
    const near = await charity({ latitude: 30.039, longitude: 31.213 });
    const far = await charity({ latitude: 30.2, longitude: 31.5 });
    await donation();

    expect(await offersOf(near.token)).toHaveLength(1);
    expect(await offersOf(far.token)).toEqual([]);
  });

  test('FR-RTE-10 a Discounted Surplus Bag is not offered to charities', async () => {
    const partner = await charity();
    const id = await createDraft(app, vendor.token, at);
    await post(app, `/listings/${id}/destination`, vendor.token, { destination: 'consumers' });
    await post(app, `/listings/${id}/publish`, vendor.token);

    expect(await offersOf(partner.token)).toEqual([]);
  });

  test('FR-RTE-10 D-111 an "other" partner gets no food offers', async () => {
    const other = await createPartnerAccount(app, 'other');

    const response = await get(app, '/partner/offers', other.token);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'not_food_partner' });
  });

  test('E-ACC-05 a charity that is not approved cannot see offers', async () => {
    const partner = await charity();
    await setUserStatus(partner.id, 'Pending');

    const response = await get(app, '/partner/offers', await tokenFor(app, partner.email));

    expect(response.status).toBe(403);
    expect((response.body as { error: string }).error).toBe('E-ACC-05');
  });

  test('FR-RTE-10 a Donation whose pickup window has ended is no longer offered', async () => {
    const partner = await charity();
    await donation();
    clock.now = () => new Date(END);

    expect(await offersOf(partner.token)).toEqual([]);
  });
});

describe('FR-RTE-10 a charity accepts a Donation and schedules the pickup', () => {
  test('FR-RTE-10 accepting with a time in the window schedules the pickup and issues a pickup code', async () => {
    const partner = await charity();
    const id = await donation();

    const response = await accept(partner.token, id, at(30));

    expect(response.status).toBe(201);
    const body = response.body as Record<string, unknown>;
    expect(body).toMatchObject({ listingId: id, status: 'Accepted', pickupTime: at(30) });
    expect(typeof body.id).toBe('string');
    expect(String(body.pickupCode)).toMatch(/^\d{6}$/);
    const vendorView = (await get(app, `/listings/${id}`, vendor.token)).body as { status: string };
    expect(vendorView.status).toBe('Fully reserved');
  });

  test('FR-RTE-10 the accepted pickup is listed under the charity pickups with its code', async () => {
    const partner = await charity();
    const id = await donation();
    const accepted = (await accept(partner.token, id)).body as { pickupCode: string };

    const response = await get(app, '/partner/pickups', partner.token);

    expect(response.status).toBe(200);
    const pickups = (response.body as { pickups: Record<string, unknown>[] }).pickups;
    expect(pickups).toHaveLength(1);
    expect(pickups[0]).toMatchObject({ listingId: id, status: 'Accepted', pickupCode: accepted.pickupCode });
  });

  test.each([
    ['one minute before the window starts', at(9)],
    ['one minute after the window ends', at(131)],
    ['already passed', at(-5)],
  ])('E-RTE-03 a pickup time %s is refused with the window', async (_label, time) => {
    const partner = await charity();
    const id = await donation();

    const response = await accept(partner.token, id, time);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'E-RTE-03', earliest: START, latest: END });
  });

  test.each([
    ['at the window start', START],
    ['at the window end', END],
  ])('E-RTE-03 a pickup time %s is accepted', async (_label, time) => {
    const partner = await charity();
    const id = await donation();

    expect((await accept(partner.token, id, time)).status).toBe(201);
  });

  test('E-RTE-03 a pickup time that is not a time is refused', async () => {
    const partner = await charity();
    const id = await donation();

    const response = await accept(partner.token, id, 'tomorrow');

    expect(response.status).toBe(400);
    expect((response.body as { error: string }).error).toBe('E-RTE-03');
  });

  test('E-RTE-04 a second charity cannot accept a Donation another charity has accepted', async () => {
    const first = await charity();
    const second = await charity();
    const id = await donation();
    await accept(first.token, id);

    const response = await accept(second.token, id);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'E-RTE-04' });
    expect(await offersOf(second.token)).toEqual([]);
  });

  test('E-RTE-04 two charities accepting at the same moment: only one wins', async () => {
    const first = await charity();
    const second = await charity();
    const id = await donation();

    const answers = await Promise.all([accept(first.token, id), accept(second.token, id)]);

    expect(answers.map((a) => a.status).sort()).toEqual([201, 409]);
  });

  test('FR-RTE-10 a charity that cannot see the offer cannot accept it', async () => {
    const partner = await charity({ acceptedFoodTypes: ['dairy_and_eggs'] });
    await charity();
    const id = await donation();

    const response = await accept(partner.token, id);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'not_found' });
  });
});

describe('FR-RTE-10 the charity cancels an accepted pickup ("Partner cancels")', () => {
  test('FR-RTE-10 after a cancel the Donation is offered again and the old code no longer works', async () => {
    const first = await charity();
    const second = await charity();
    const id = await donation();
    const accepted = (await accept(first.token, id)).body as { id: string; pickupCode: string };

    const cancelled = await post(app, `/partner/pickups/${accepted.id}/cancel`, first.token);

    expect(cancelled.status).toBe(200);
    expect((cancelled.body as { status: string }).status).toBe('Cancelled');
    expect(await offersOf(second.token)).toHaveLength(1);
    expect(((await get(app, `/listings/${id}`, vendor.token)).body as { status: string }).status).toBe(
      'Active',
    );
    clock.now = () => new Date(at(30));
    const code = await post(app, `/listings/${id}/pickups/verify`, vendor.token, {
      code: accepted.pickupCode,
    });
    expect(code.status).toBe(409);
  });

  test('FR-RTE-10 a charity cannot cancel another charity pickup', async () => {
    const first = await charity();
    const second = await charity();
    const id = await donation();
    const accepted = (await accept(first.token, id)).body as { id: string };

    const response = await post(app, `/partner/pickups/${accepted.id}/cancel`, second.token);

    expect(response.status).toBe(404);
  });
});

describe('FR-RES-10 the vendor enters the charity pickup code at handover', () => {
  test('FR-RES-10 the vendor sees the scheduled donation pickup on the listing', async () => {
    const partner = await charity();
    const id = await donation();
    await accept(partner.token, id, at(30));

    const response = await get(app, `/listings/${id}/partner-pickup`, vendor.token);

    expect(response.status).toBe(200);
    expect((response.body as { pickup: Record<string, unknown> }).pickup).toMatchObject({
      organisationName: 'Giza Food Bank',
      pickupTime: at(30),
      status: 'Accepted',
      // The vendor types the charity's code; it is never shown to them.
      pickupCode: null,
    });
  });

  test('FR-RES-10 without an accepted pickup the vendor sees none', async () => {
    await charity();
    const id = await donation();

    expect((await get(app, `/listings/${id}/partner-pickup`, vendor.token)).body).toEqual({ pickup: null });
  });

  test('FR-RES-10 the charity code is verified and completed: the pickup is Completed and the listing Closed', async () => {
    const partner = await charity();
    const id = await donation();
    const accepted = (await accept(partner.token, id, at(30))).body as { pickupCode: string };
    clock.now = () => new Date(at(30));

    const verified = await post(app, `/listings/${id}/pickups/verify`, vendor.token, {
      code: accepted.pickupCode,
    });
    expect(verified.status).toBe(200);
    expect((verified.body as { partnerPickup: Record<string, unknown> }).partnerPickup).toMatchObject({
      organisationName: 'Giza Food Bank',
      status: 'Accepted',
    });

    const completed = await post(app, `/listings/${id}/pickups/complete`, vendor.token, {
      code: accepted.pickupCode,
    });
    expect(completed.status).toBe(200);
    expect((completed.body as { partnerPickup: Record<string, unknown> }).partnerPickup).toMatchObject({
      status: 'Completed',
    });
    expect(((await get(app, `/listings/${id}`, vendor.token)).body as { status: string }).status).toBe(
      'Closed',
    );
    const pickups = (await get(app, '/partner/pickups', partner.token)).body as {
      pickups: { status: string }[];
    };
    expect(pickups.pickups[0]?.status).toBe('Completed');
  });

  test('E-RES-03 the charity code used a second time is refused', async () => {
    const partner = await charity();
    const id = await donation();
    const accepted = (await accept(partner.token, id, at(30))).body as { pickupCode: string };
    clock.now = () => new Date(at(30));
    await post(app, `/listings/${id}/pickups/complete`, vendor.token, { code: accepted.pickupCode });

    const again = await post(app, `/listings/${id}/pickups/complete`, vendor.token, {
      code: accepted.pickupCode,
    });

    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: 'E-RES-03', reason: 'already_used' });
  });

  test('FR-RTE-10 a completed pickup can no longer be cancelled', async () => {
    const partner = await charity();
    const id = await donation();
    const accepted = (await accept(partner.token, id, at(30))).body as { id: string; pickupCode: string };
    clock.now = () => new Date(at(30));
    await post(app, `/listings/${id}/pickups/complete`, vendor.token, { code: accepted.pickupCode });

    const response = await post(app, `/partner/pickups/${accepted.id}/cancel`, partner.token);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'pickup_not_cancellable', status: 'Completed' });
  });
});

describe('FR-RTE-12 Compost offers for composting partners (US-24, D-111)', () => {
  /** A published Compost offer (destination composting) of `vendor`. */
  async function compostOffer(): Promise<string> {
    const id = await createDraft(app, vendor.token, at);
    const chosen = await post(app, `/listings/${id}/destination`, vendor.token, {
      destination: 'composting',
    });
    if (chosen.status !== 200) throw new Error(`destination failed: ${JSON.stringify(chosen.body)}`);
    const published = await post(app, `/listings/${id}/publish`, vendor.token);
    if (published.status !== 200) throw new Error(`publish failed: ${JSON.stringify(published.body)}`);
    return id;
  }

  test('FR-RTE-12 a composting partner that accepts the food type sees the Compost offer, marked as one', async () => {
    const compost = await createPartnerAccount(app, 'composting');
    const id = await compostOffer();

    const offers = (await get(app, '/partner/offers', compost.token)).body as {
      offers: { listingId: string; listingType: string }[];
    };

    expect(offers.offers).toHaveLength(1);
    expect(offers.offers[0]).toMatchObject({ listingId: id, listingType: 'Compost offer' });
  });

  test('FR-RTE-12 a composting partner does not see Donations, and a charity does not see Compost offers', async () => {
    const compost = await createPartnerAccount(app, 'composting');
    const partner = await charity();
    await donation();
    await compostOffer();

    const compostOffers = await offersOf(compost.token);
    const charityOffers = (await get(app, '/partner/offers', partner.token)).body as {
      offers: { listingType: string }[];
    };

    expect(compostOffers).toHaveLength(1);
    expect(charityOffers.offers.map((o) => o.listingType)).toEqual(['Donation']);
  });

  test('FR-RTE-12 E-RTE-03 a composting partner accepts inside the window; outside it is refused', async () => {
    const compost = await createPartnerAccount(app, 'composting');
    const id = await compostOffer();

    expect((await accept(compost.token, id, at(131))).status).toBe(400);
    const accepted = await accept(compost.token, id, at(30));
    expect(accepted.status).toBe(201);
    expect((accepted.body as { status: string }).status).toBe('Accepted');
  });

  test('FR-RTE-12 E-RTE-04 a second composting partner cannot take an accepted Compost offer', async () => {
    const first = await createPartnerAccount(app, 'composting');
    const second = await createPartnerAccount(app, 'composting');
    const id = await compostOffer();
    await accept(first.token, id);

    expect((await accept(second.token, id)).body).toEqual({ error: 'E-RTE-04' });
  });

  test('FR-RES-10 the vendor completes the compost pickup with the partner code', async () => {
    const compost = await createPartnerAccount(app, 'composting');
    const id = await compostOffer();
    const accepted = (await accept(compost.token, id, at(30))).body as { pickupCode: string };
    clock.now = () => new Date(at(30));

    const done = await post(app, `/listings/${id}/pickups/complete`, vendor.token, {
      code: accepted.pickupCode,
    });

    expect(done.status).toBe(200);
    expect((done.body as { partnerPickup: Record<string, unknown> }).partnerPickup).toMatchObject({
      organisationName: 'Green Compost',
      status: 'Completed',
    });
  });
});
