// SCRUM-81 NFR verification pass (2026-11-21). The SRS 5.1 and 5.3 checks that can run automatically and had no test:
// NFR-01 (search speed on 500 listings) and NFR-11a (the consumer's location is not stored or logged). The other NFRs
// and their evidence are listed in docs/nfr-verification.md. Runs against nowaste_test.
import request from 'supertest';
import { createApp } from '../src/api/app.js';
import { closePool, getPool } from '../src/data/db.js';
import { clock } from '../src/domain/clock.js';
import { setPaymentGateway } from '../src/adapters/payment-gateway/paymentGateway.js';
import { createAccount, tokenFor } from './helpers/accounts.js';
import { deleteAllUsers } from './helpers/database.js';
import { SHOP, createDraft, createVendor, post, readyToPublish } from './helpers/listings.js';

const app = createApp();
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

let consumer: string;
let listingId: string;

beforeAll(async () => {
  clock.now = () => NOW;
  await deleteAllUsers();
  const account = await createAccount(app, 'consumer');
  consumer = await tokenFor(app, account.email);
  const vendor = await createVendor(app, 'formal', 'Approved', { shopName: 'NFR Bakery', ...SHOP });
  listingId = await createDraft(app, vendor.token, at, {});
  await readyToPublish(app, vendor.token, listingId);
  const published = await post(app, `/listings/${listingId}/publish`, vendor.token);
  if (published.status !== 200) throw new Error(`publish failed: ${JSON.stringify(published.body)}`);
});

afterAll(async () => {
  clock.now = realNow;
  await deleteAllUsers();
  await closePool();
});

const search = (latitude: number, longitude: number) =>
  request(app)
    .get(`/listings/nearby?latitude=${String(latitude)}&longitude=${String(longitude)}&radiusKm=10`)
    .set('Authorization', `Bearer ${consumer}`);

describe('NFR-01 search speed', () => {
  test('NFR-01 with 500 listings, at least 19 of 20 searches within 10 km return in under 2 seconds', async () => {
    // 499 copies of the published listing, spread about 15 km around the shop (some in range, some not).
    await getPool().query(
      `CREATE TEMP TABLE nfr01_copies AS
         SELECT l.* FROM listings l CROSS JOIN generate_series(1, 499) WHERE l.id = $1;
       UPDATE nfr01_copies
          SET id = gen_random_uuid(),
              location = ST_SetSRID(ST_MakePoint(31.2122 + (random() - 0.5) * 0.3,
                                                 30.0381 + (random() - 0.5) * 0.3), 4326)::geography;
       INSERT INTO listings SELECT * FROM nfr01_copies;
       DROP TABLE nfr01_copies;`.replace('$1', `'${listingId}'`),
    );
    const total = await getPool().query<{ n: string }>('SELECT count(*) AS n FROM listings');
    expect(Number(total.rows[0]?.n)).toBeGreaterThanOrEqual(500);

    const times: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const started = performance.now();
      const res = await search(SHOP.latitude, SHOP.longitude);
      times.push(performance.now() - started);
      expect(res.status).toBe(200);
      expect((res.body as { offers: unknown[] }).offers.length).toBeGreaterThan(0);
    }
    const fast = times.filter((ms) => ms < 2000).length;
    // Printed so the timings can be copied into docs/nfr-verification.md.
    console.log(
      `NFR-01: ${String(fast)}/20 under 2 s; slowest ${String(Math.round(Math.max(...times)))} ms; ` +
        `median ${String(Math.round([...times].sort((a, b) => a - b)[10] ?? 0))} ms`,
    );
    expect(fast).toBeGreaterThanOrEqual(19);
    // The random copies are only for this timing. Removing them keeps NFR-11a reliable: a random copy could otherwise
    // land on a coordinate that starts with the digits NFR-11a searches for (seen in CI on PR #13).
    await getPool().query('DELETE FROM listings WHERE id <> $1', [listingId]);
  }, 60_000);
});

describe('NFR-11a the consumer location is used only for the search', () => {
  test('NFR-11a after a search the consumer location is in no table and in no log line', async () => {
    // A distinctive position near the shop, so it can be searched for afterwards.
    const latitude = 30.041357;
    const longitude = 31.213579;
    const logged: string[] = [];
    const spies = (['log', 'info', 'warn', 'error'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      }),
    );
    try {
      const res = await search(latitude, longitude);
      expect(res.status).toBe(200);
    } finally {
      for (const spy of spies) spy.mockRestore();
    }

    expect(logged.join('\n')).not.toMatch(/30\.0413|31\.2135/);
    // Every text, number and location column of every table in the public schema.
    const columns = await getPool().query<{ table_name: string; column_name: string; udt_name: string }>(
      `SELECT table_name, column_name, udt_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name <> 'spatial_ref_sys'
          AND udt_name IN ('text', 'varchar', 'citext', 'numeric', 'float8', 'jsonb', 'geography')`,
    );
    const found: string[] = [];
    for (const { table_name: table, column_name: column, udt_name: type } of columns.rows) {
      const value = type === 'geography' ? `ST_AsText("${column}"::geometry)` : `"${column}"::text`;
      const hit = await getPool().query(
        `SELECT 1 FROM "${table}" WHERE ${value} LIKE '%30.0413%' OR ${value} LIKE '%31.2135%' LIMIT 1`,
      );
      if ((hit.rowCount ?? 0) > 0) found.push(`${table}.${column}`);
    }
    expect(found).toEqual([]);
  });
});

describe('NFR-12 the payment gateway is down', () => {
  beforeEach(() => {
    setPaymentGateway({
      charge: () => Promise.reject(new Error('gateway unreachable')),
    });
  });

  afterEach(() => {
    setPaymentGateway(undefined);
  });

  test('NFR-12 search and a no-card reservation still work while the payment gateway is down', async () => {
    const found = await search(SHOP.latitude, SHOP.longitude);
    expect(found.status).toBe(200);

    const reserved = await post(app, '/reservations', consumer, {
      listingId,
      method: 'no-card',
      slotStart: at(10),
    });
    expect(reserved.status).toBe(201);
    expect((reserved.body as { id?: unknown }).id).toEqual(expect.any(String));
  });

  test('NFR-12 E-RES-01 a card reservation while the gateway is down is refused with E-RES-01 and the bag is free again', async () => {
    const bags = async () =>
      Number(
        (
          await getPool().query<{ n: number }>('SELECT bags_available AS n FROM listings WHERE id = $1', [
            listingId,
          ])
        ).rows[0]?.n,
      );
    const bagsBefore = await bags();
    const before = await getPool().query<{ n: string }>(
      "SELECT count(*) AS n FROM reservations WHERE method = 'card'",
    );
    // A real one-time token from the pretend bank's card page (docs/test-cards.md); only the charge fails.
    const tokenRes = await post(app, '/mock-bank/tokens', consumer, {
      number: '40000000',
      expiry: '12/30',
      cvv: '123',
    });
    const paymentToken = (tokenRes.body as { token: string }).token;
    const res = await post(app, '/reservations', consumer, { listingId, method: 'card', paymentToken });
    expect(res.status).toBe(402);
    expect(res.body).toEqual({ error: 'E-RES-01', reason: 'timeout' });
    expect(await bags()).toBe(bagsBefore);
    const after = await getPool().query<{ n: string }>(
      "SELECT count(*) AS n FROM reservations WHERE method = 'card'",
    );
    expect(Number(after.rows[0]?.n)).toBe(Number(before.rows[0]?.n));
  });
});
