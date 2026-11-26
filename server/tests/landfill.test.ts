// US-25 Landfill record (FR-RTE-13, SDD 4.2 LandfillRecord, decision D-117). When the pickup window has ended and no
// consumer, charity or composting partner took the food, the vendor records a landfill disposal of the bags left; it
// is counted in the impact numbers (US-44). Runs against nowaste_test with a fixed clock.
import { closePool } from '../src/data/db.js';
import { createApp } from '../src/api/app.js';
import { clock } from '../src/domain/clock.js';
import { createAccount } from './helpers/accounts.js';
import {
  deleteAllUsers,
  insertCompletedReservation,
  insertPartnerPickup,
  readLandfillRecords,
  setBagsAvailable,
} from './helpers/database.js';
import { createDraft, createPartner, createVendor, get, post, readyToPublish } from './helpers/listings.js';

const app = createApp();
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const iso = (minutes: number) => at(minutes).toISOString();

// createDraft: 3 bags, pickup from at(10); cooked meals at room temperature end at at(130).
const AFTER_END = 200;

let vendor: { id: string; token: string };

async function published(): Promise<string> {
  const id = await createDraft(app, vendor.token, iso);
  await readyToPublish(app, vendor.token, id);
  const response = await post(app, `/listings/${id}/publish`, vendor.token);
  if (response.status !== 200) throw new Error(`publish failed: ${JSON.stringify(response.body)}`);
  return id;
}

const record = (id: string, token = vendor.token) => post(app, `/listings/${id}/landfill`, token);

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

describe('FR-RTE-13 the vendor records a landfill disposal', () => {
  test('FR-RTE-13 after the pickup window ends, the bags nobody took are recorded once', async () => {
    const id = await published();
    clock.now = () => at(AFTER_END);

    const response = await record(id);

    expect(response.status).toBe(201);
    expect(response.body).toEqual({ bags: 3, recordedAt: at(AFTER_END).toISOString() });
    expect(await readLandfillRecords(id)).toEqual([{ bags: 3 }]);
  });

  test('FR-RTE-13 bags that consumers collected are not recorded, only the ones left', async () => {
    const id = await published();
    const consumer = await createAccount(app, 'consumer');
    await insertCompletedReservation(id, consumer.id, 40);
    clock.now = () => at(AFTER_END);

    expect((await record(id)).body).toMatchObject({ bags: 2 });
  });

  test('FR-RTE-13 the listing page shows the landfill record', async () => {
    const id = await published();
    clock.now = () => at(AFTER_END);
    expect((await get(app, `/listings/${id}`, vendor.token)).body).toMatchObject({ landfill: null });

    await record(id);

    expect((await get(app, `/listings/${id}`, vendor.token)).body).toMatchObject({
      landfill: { bags: 3, recordedAt: at(AFTER_END).toISOString() },
    });
  });

  test('FR-RTE-13 before the pickup window ends nothing is recorded', async () => {
    const id = await published();
    clock.now = () => at(60);

    const response = await record(id);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'pickup_not_ended' });
    expect(await readLandfillRecords(id)).toEqual([]);
  });

  test('FR-RTE-13 a second record for the same listing is refused', async () => {
    const id = await published();
    clock.now = () => at(AFTER_END);
    await record(id);

    const again = await record(id);

    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: 'landfill_already_recorded' });
    expect(await readLandfillRecords(id)).toEqual([{ bags: 3 }]);
  });

  test('FR-RTE-13 when every bag was taken there is nothing to record', async () => {
    const id = await published();
    await setBagsAvailable(id, 0);
    clock.now = () => at(AFTER_END);

    const response = await record(id);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'nothing_left' });
  });

  test('FR-RTE-13 food a charity or composting partner took is not landfill', async () => {
    const id = await published();
    const charity = await createPartner(app, 'charity');
    await insertPartnerPickup(id, charity, 'Donation', 'Accepted');
    clock.now = () => at(AFTER_END);

    const response = await record(id);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'taken_by_partner' });
  });

  test('FR-RTE-13 a Draft that was never published is not recorded', async () => {
    const id = await createDraft(app, vendor.token, iso);
    clock.now = () => at(AFTER_END);

    const response = await record(id);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'listing_not_published', status: 'Draft' });
  });

  test("FR-RTE-13 another vendor's listing is not found", async () => {
    const id = await published();
    const other = await createVendor(app, 'formal');
    clock.now = () => at(AFTER_END);

    const response = await record(id, other.token);

    expect(response.status).toBe(404);
    expect(await readLandfillRecords(id)).toEqual([]);
  });

  test('E-LST-06 a vendor who is not Approved cannot record a landfill disposal', async () => {
    const id = await published();
    const pending = await createVendor(app, 'formal', 'Pending');
    clock.now = () => at(AFTER_END);

    const response = await record(id, pending.token);

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'E-LST-06' });
  });
});
