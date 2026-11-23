// US-23 Automatic charity offers (FR-RTE-11, BR-10 / TBD-5 = 60 minutes, D-106), decision D-112. A vendor opts in;
// the worker job offers the unreserved bags of their consumer listing as a Donation to eligible charities when the
// BR-10 time before the pickup end comes. Runs against nowaste_test with a fixed clock; the job is called directly.
import { closePool } from '../src/data/db.js';
import { createApp } from '../src/api/app.js';
import { clock } from '../src/domain/clock.js';
import { makeAutomaticCharityOffers } from '../src/services/partner-offer/autoCharityOfferService.js';
import { deleteAllUsers, setBagsAvailable } from './helpers/database.js';
import {
  createDraft,
  createPartnerAccount,
  createVendor,
  get,
  post,
  readyToPublish,
} from './helpers/listings.js';
import request from 'supertest';

const app = createApp();
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const iso = (minutes: number) => at(minutes).toISOString();

// createDraft: pickup from at(10); cooked meals at room temperature end at at(130). BR-10 = 60 min: due at at(70).
let vendor: { id: string; token: string };

const optIn = (token: string, value: unknown) =>
  request(app)
    .patch('/vendors/me/auto-charity')
    .set('Authorization', `Bearer ${token}`)
    .send({ optIn: value });

/** A published consumer listing (3 bags) of `vendor`. */
async function consumerListing(): Promise<string> {
  const id = await createDraft(app, vendor.token, (m: number) => iso(m));
  await readyToPublish(app, vendor.token, id);
  const published = await post(app, `/listings/${id}/publish`, vendor.token);
  if (published.status !== 200) throw new Error(`publish failed: ${JSON.stringify(published.body)}`);
  return id;
}

const charityOffers = async (token: string) =>
  ((await get(app, '/partner/offers', token)).body as { offers: { listingId: string; bags: number }[] })
    .offers;

beforeEach(async () => {
  clock.now = () => NOW;
  await deleteAllUsers();
  vendor = await createVendor(app, 'formal');
});

afterEach(() => {
  clock.now = realNow;
});

afterAll(async () => {
  await deleteAllUsers();
  await closePool();
});

describe('FR-RTE-11 the vendor opts in to automatic charity offers', () => {
  test('FR-RTE-11 the setting is off until the vendor turns it on, and can be turned off again', async () => {
    expect((await get(app, '/vendors/me/auto-charity', vendor.token)).body).toEqual({
      autoCharityOptIn: false,
    });

    const on = await optIn(vendor.token, true);
    expect(on.status).toBe(200);
    expect(on.body).toEqual({ autoCharityOptIn: true });
    expect((await get(app, '/vendors/me/auto-charity', vendor.token)).body).toEqual({
      autoCharityOptIn: true,
    });

    expect((await optIn(vendor.token, false)).body).toEqual({ autoCharityOptIn: false });
  });

  test('FR-RTE-11 a value that is not true or false is refused', async () => {
    const response = await optIn(vendor.token, 'yes');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_input', fields: ['optIn'] });
  });
});

describe('FR-RTE-11 BR-10 the worker offers unreserved bags to charities', () => {
  test('BR-10 before the offer time nothing is offered', async () => {
    const partner = await createPartnerAccount(app, 'charity');
    await optIn(vendor.token, true);
    await consumerListing();

    expect(await makeAutomaticCharityOffers(at(69))).toBe(0);
    expect(await charityOffers(partner.token)).toEqual([]);
  });

  test('FR-RTE-11 at the offer time the unreserved bags become a Donation that eligible charities see', async () => {
    const partner = await createPartnerAccount(app, 'charity');
    await optIn(vendor.token, true);
    const id = await consumerListing();
    await setBagsAvailable(id, 2); // one of three bags was reserved by a consumer
    clock.now = () => at(70);

    expect(await makeAutomaticCharityOffers(at(70))).toBe(1);

    const offers = await charityOffers(partner.token);
    expect(offers).toHaveLength(1);
    expect(offers[0]?.bags).toBe(2);
    const original = (await get(app, `/listings/${id}`, vendor.token)).body as {
      status: string;
      bagsAvailable: number;
    };
    expect(original).toMatchObject({ status: 'Fully reserved', bagsAvailable: 0 });
  });

  test('FR-RTE-11 the vendor sees on the listing that its bags were offered to charities', async () => {
    await createPartnerAccount(app, 'charity');
    await optIn(vendor.token, true);
    const id = await consumerListing();
    await makeAutomaticCharityOffers(at(70));

    const response = await get(app, `/listings/${id}/auto-charity`, vendor.token);

    expect(response.status).toBe(200);
    expect((response.body as { offer: Record<string, unknown> }).offer).toMatchObject({
      offeredAt: iso(70),
      bags: 3,
    });
  });

  test('FR-RTE-11 a charity accepts the automatic Donation like any other', async () => {
    const partner = await createPartnerAccount(app, 'charity');
    await optIn(vendor.token, true);
    await consumerListing();
    await makeAutomaticCharityOffers(at(70));
    clock.now = () => at(70);
    const offer = (await charityOffers(partner.token))[0];

    const accepted = await post(app, `/partner/offers/${offer?.listingId ?? ''}/accept`, partner.token, {
      pickupTime: iso(100),
    });

    expect(accepted.status).toBe(201);
  });

  test('FR-RTE-11 a vendor who did not opt in keeps the bags for consumers', async () => {
    const partner = await createPartnerAccount(app, 'charity');
    await consumerListing();

    expect(await makeAutomaticCharityOffers(at(70))).toBe(0);
    expect(await charityOffers(partner.token)).toEqual([]);
  });

  test('FR-RTE-11 with no unreserved bags nothing is offered', async () => {
    await createPartnerAccount(app, 'charity');
    await optIn(vendor.token, true);
    const id = await consumerListing();
    await setBagsAvailable(id, 0);

    expect(await makeAutomaticCharityOffers(at(70))).toBe(0);
  });

  test('FR-RTE-11 D-112 with no eligible charity the bags stay with consumers', async () => {
    await createPartnerAccount(app, 'charity', { acceptedFoodTypes: ['dairy_and_eggs'] });
    await optIn(vendor.token, true);
    const id = await consumerListing();

    expect(await makeAutomaticCharityOffers(at(70))).toBe(0);
    expect(((await get(app, `/listings/${id}`, vendor.token)).body as { status: string }).status).toBe(
      'Active',
    );
  });

  test('FR-RTE-11 the offer is made once; running the job again changes nothing', async () => {
    const partner = await createPartnerAccount(app, 'charity');
    await optIn(vendor.token, true);
    await consumerListing();
    await makeAutomaticCharityOffers(at(70));

    expect(await makeAutomaticCharityOffers(at(80))).toBe(0);
    clock.now = () => at(80);
    expect(await charityOffers(partner.token)).toHaveLength(1);
  });

  test('FR-RTE-11 after the pickup end nothing is offered', async () => {
    await createPartnerAccount(app, 'charity');
    await optIn(vendor.token, true);
    await consumerListing();

    expect(await makeAutomaticCharityOffers(at(130))).toBe(0);
  });
});
