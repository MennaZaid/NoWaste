// US-44 Impact numbers (FR-TGI-07, SDD C-16 Impact Service, decision D-118). Every user sees meals rescued, money
// saved, estimated CO2 avoided and the bags composted and sent to landfill, platform-wide and for their own account.
// D-118: one collected bag is one meal (consumer pickups, charity pickups and delivered Zakat bags); money saved is
// the original value minus the price paid (SRS glossary); CO2 avoided is meals × the kg per bag in the settings row
// FR-TGI-07 (2.5 kg); compost and landfill bags are counted apart, never as meals. Runs against nowaste_test.
import request from 'supertest';
import { closePool } from '../src/data/db.js';
import { createApp } from '../src/api/app.js';
import { clock } from '../src/domain/clock.js';
import { createAccount, tokenFor } from './helpers/accounts.js';
import {
  deleteAllUsers,
  insertCompletedReservation,
  insertPartnerPickup,
  insertZakat,
  readSettingValue,
  setSettingValue,
} from './helpers/database.js';
import {
  createDraft,
  createPartnerAccount,
  createVendor,
  get,
  post,
  quickPostBody,
  readyToPublish,
} from './helpers/listings.js';

const app = createApp();
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const iso = (minutes: number) => at(minutes).toISOString();

interface Impact {
  mealsRescued: number;
  moneySaved: number;
  co2AvoidedKg: number;
  bagsComposted: number;
  bagsLandfill: number;
}

const ZERO: Impact = { mealsRescued: 0, moneySaved: 0, co2AvoidedKg: 0, bagsComposted: 0, bagsLandfill: 0 };

/** A published consumer listing: 3 bags, original value 100, price 40 (createDraft). */
async function published(token: string): Promise<string> {
  const id = await createDraft(app, token, iso);
  await readyToPublish(app, token, id);
  const response = await post(app, `/listings/${id}/publish`, token);
  if (response.status !== 200) throw new Error(`publish failed: ${JSON.stringify(response.body)}`);
  return id;
}

const impactOf = async (token: string) => {
  const response = await get(app, '/impact', token);
  expect(response.status).toBe(200);
  return response.body as { platform: Impact; mine: Impact; co2KgPerBag: number };
};

let savedFactor: unknown;

beforeAll(async () => {
  savedFactor = await readSettingValue('FR-TGI-07');
  if (savedFactor == null) throw new Error('Settings row FR-TGI-07 is missing');
});

beforeEach(async () => {
  clock.now = () => NOW;
  await deleteAllUsers();
});

afterEach(async () => {
  clock.now = realNow;
  await setSettingValue('FR-TGI-07', savedFactor);
});

afterAll(async () => {
  await deleteAllUsers();
  await closePool();
});

describe('FR-TGI-07 impact numbers', () => {
  test('FR-TGI-07 D-118 the CO2 factor is the settings row FR-TGI-07: 2.5 kg per rescued bag', () => {
    expect(savedFactor).toEqual({ co2_kg_per_bag: 2.5 });
  });

  test('FR-TGI-07 with nothing rescued yet every number is zero', async () => {
    const consumer = await createAccount(app, 'consumer');

    const body = await impactOf(await tokenFor(app, consumer.email));

    expect(body).toEqual({ platform: ZERO, mine: ZERO, co2KgPerBag: 2.5 });
  });

  describe('FR-TGI-07 platform-wide and per user', () => {
    let consumer: { id: string; token: string };
    let vendorA: { id: string; token: string };
    let vendorB: { id: string; token: string };
    let charity: { id: string; token: string };
    let composter: { id: string; token: string };
    let admin: string;

    beforeEach(async () => {
      const c = await createAccount(app, 'consumer');
      consumer = { id: c.id, token: await tokenFor(app, c.email) };
      const a = await createAccount(app, 'admin');
      admin = await tokenFor(app, a.email);
      vendorA = await createVendor(app, 'formal');
      vendorB = await createVendor(app, 'formal');
      charity = await createPartnerAccount(app, 'charity');
      composter = await createPartnerAccount(app, 'composting');

      // Vendor A: 2 bags collected by the consumer at 40 (money 2 × 60), one more still Confirmed (not counted).
      const l1 = await published(vendorA.token);
      await insertCompletedReservation(l1, consumer.id, 40);
      await insertCompletedReservation(l1, consumer.id, 40);
      await insertCompletedReservation(l1, consumer.id, 40, 'Confirmed');
      // Vendor A: a Donation of 3 bags the charity collected.
      const l2 = await published(vendorA.token);
      await insertPartnerPickup(l2, charity.id, 'Donation');
      // Vendor A: a Donation a charity accepted but has not collected yet (not counted).
      const l2b = await published(vendorA.token);
      await insertPartnerPickup(l2b, charity.id, 'Donation', 'Accepted');
      // Vendor B: a Compost offer of 3 bags the composting partner collected.
      const l3 = await published(vendorB.token);
      await insertPartnerPickup(l3, composter.id, 'Compost offer');
      // Vendor B: the consumer gave 1 bag as Zakat for 40 and the charity collected it (money 100 − 40); a Paid
      // and a Refunded donation are not counted.
      const l4 = await published(vendorB.token);
      await insertZakat(l4, consumer.id, charity.id, 1, 40, 'Delivered');
      await insertZakat(l4, consumer.id, charity.id, 1, 40, 'Paid');
      await insertZakat(l4, consumer.id, charity.id, 1, 40, 'Refunded');
      // Vendor B: nobody took a listing of 3 bags; the vendor records it as landfill after the window (US-25).
      const l5 = await published(vendorB.token);
      clock.now = () => at(200);
      const landfill = await post(app, `/listings/${l5}/landfill`, vendorB.token);
      expect(landfill.status).toBe(201);
    });

    const PLATFORM: Impact = {
      mealsRescued: 6,
      moneySaved: 180,
      co2AvoidedKg: 15,
      bagsComposted: 3,
      bagsLandfill: 3,
    };

    test('FR-TGI-07 the platform-wide numbers are the same for every user', async () => {
      for (const token of [consumer.token, vendorA.token, charity.token, composter.token, admin]) {
        expect((await impactOf(token)).platform).toEqual(PLATFORM);
      }
    });

    test("FR-TGI-07 a consumer's own numbers: the bags they collected and their delivered Zakat", async () => {
      expect((await impactOf(consumer.token)).mine).toEqual({
        mealsRescued: 3,
        moneySaved: 180,
        co2AvoidedKg: 7.5,
        bagsComposted: 0,
        bagsLandfill: 0,
      });
    });

    test("FR-TGI-07 a vendor's own numbers: what happened to their listings", async () => {
      expect((await impactOf(vendorA.token)).mine).toEqual({
        mealsRescued: 5,
        moneySaved: 120,
        co2AvoidedKg: 12.5,
        bagsComposted: 0,
        bagsLandfill: 0,
      });
      expect((await impactOf(vendorB.token)).mine).toEqual({
        mealsRescued: 1,
        moneySaved: 60,
        co2AvoidedKg: 2.5,
        bagsComposted: 3,
        bagsLandfill: 3,
      });
    });

    test("FR-TGI-07 a partner's own numbers: the bags they collected", async () => {
      expect((await impactOf(charity.token)).mine).toEqual({ ...ZERO, mealsRescued: 4, co2AvoidedKg: 10 });
      expect((await impactOf(composter.token)).mine).toEqual({ ...ZERO, bagsComposted: 3 });
    });

    test('FR-TGI-07 the administrator has no own numbers, only the platform-wide ones', async () => {
      expect((await impactOf(admin)).mine).toEqual(ZERO);
    });

    test('FR-TGI-07 D-118 the CO2 factor comes from settings: changing it changes the estimate', async () => {
      await setSettingValue('FR-TGI-07', { co2_kg_per_bag: 1 });

      const body = await impactOf(consumer.token);

      expect(body.co2KgPerBag).toBe(1);
      expect(body.platform.co2AvoidedKg).toBe(6);
      expect(body.mine.co2AvoidedKg).toBe(3);
    });
  });

  test('FR-TGI-07 money saved counts only listings with an original value (Quick Posts have none)', async () => {
    const vendor = await createVendor(app, 'informal');
    const c = await createAccount(app, 'consumer');
    const response = await post(
      app,
      '/listings/quick',
      vendor.token,
      await quickPostBody(app, vendor.token, iso),
    );
    expect(response.status).toBe(201);
    await insertCompletedReservation((response.body as { id: string }).id, c.id, 15);

    const body = await impactOf(await tokenFor(app, c.email));

    expect(body.mine).toEqual({ ...ZERO, mealsRescued: 1, co2AvoidedKg: 2.5 });
  });

  test('NFR-09c the impact numbers need a logged-in user', async () => {
    expect((await request(app).get('/impact')).status).toBe(401);
  });
});
