// US-43 Zakat donation and receipt (SRS 4.6 "Zakat donation", SDD C-14 Zakat & Receipt Service, IZakat). Tests come
// from FR-TGI-05, FR-TGI-06, E-TGI-02, E-TGI-03 and BR-11. Decisions D-113 to D-116. The consumer pays for 1 to N bags
// with the pretend bank (D-99); the bags become a Donation for the chosen charity, who collects them through the US-22
// flow; the receipt shows Paid, Delivered or Refunded. Runs against nowaste_test with a fixed clock.
import { closePool } from '../src/data/db.js';
import { createApp } from '../src/api/app.js';
import { clock } from '../src/domain/clock.js';
import { refundUncollectedZakat } from '../src/services/zakat-receipt/zakatService.js';
import { createAccount, tokenFor } from './helpers/accounts.js';
import { deleteAllUsers, readMockBankBalance, resetMockBank } from './helpers/database.js';
import {
  createDraft,
  createPartnerAccount,
  createVendor,
  get,
  post,
  readyToPublish,
} from './helpers/listings.js';

const app = createApp();
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

// createDraft: price 40 EGP; cooked meals at room temperature, pickup from at(10) to at(130).
const PRICE = 40;
const GOOD = { number: '40000000', expiry: '12/30', cvv: '123' };
const BLOCKED = { number: '40000002', expiry: '12/30', cvv: '123' };
const BALANCE = 10000;

let consumer: { id: string; token: string };
let vendor: { id: string; token: string };
let charity: { id: string; email: string; token: string };
let listingId: string;

async function cardToken(card: Record<string, unknown> = GOOD): Promise<string> {
  const response = await post(app, '/mock-bank/tokens', consumer.token, card);
  if (response.status !== 201) throw new Error(`token failed: ${JSON.stringify(response.body)}`);
  return (response.body as { token: string }).token;
}

const donate = (body: Record<string, unknown>) =>
  post(app, `/listings/nearby/${listingId}/zakat`, consumer.token, body);

async function donateOk(bags = 1): Promise<Receipt> {
  const response = await donate({ charityId: charity.id, bags, paymentToken: await cardToken() });
  if (response.status !== 201) throw new Error(`zakat failed: ${JSON.stringify(response.body)}`);
  return response.body as Receipt;
}

interface Receipt {
  id: string;
  receiptNumber: string;
  status: string;
  shopName: string;
  foodName: string;
  bags: number;
  amount: number;
  charityName: string;
  createdAt: string;
  deliveredAt: string | null;
  refundedAt: string | null;
}

const bagsLeft = async () =>
  ((await get(app, `/listings/${listingId}`, vendor.token)).body as { bagsAvailable: number }).bagsAvailable;

beforeEach(async () => {
  clock.now = () => NOW;
  await deleteAllUsers();
  await resetMockBank();
  const account = await createAccount(app, 'consumer');
  consumer = { id: account.id, token: await tokenFor(app, account.email) };
  vendor = await createVendor(app, 'formal');
  charity = await createPartnerAccount(app, 'charity');
  listingId = await createDraft(app, vendor.token, at);
  await readyToPublish(app, vendor.token, listingId);
  await post(app, `/listings/${listingId}/publish`, vendor.token);
});

afterEach(() => {
  clock.now = realNow;
});

afterAll(async () => {
  await deleteAllUsers();
  await resetMockBank();
  await closePool();
});

describe('FR-TGI-05 the consumer chooses a charity that accepts the food type', () => {
  test('FR-TGI-05 the charities that accept the food type are listed for the offer', async () => {
    await createPartnerAccount(app, 'charity', { acceptedFoodTypes: ['dairy_and_eggs'] });

    const response = await get(app, `/listings/nearby/${listingId}/charities`, consumer.token);

    expect(response.status).toBe(200);
    const charities = (response.body as { charities: { id: string; name: string }[] }).charities;
    expect(charities).toHaveLength(1);
    expect(charities[0]).toMatchObject({ id: charity.id, name: 'Giza Food Bank' });
  });
});

describe('FR-TGI-05 FR-TGI-06 paying for bags and donating them as Zakat', () => {
  test('FR-TGI-05 FR-TGI-06 the consumer pays for 2 bags; a Paid receipt shows vendor, food, amount, charity and date', async () => {
    const receipt = await donateOk(2);

    expect(receipt).toMatchObject({
      status: 'Paid',
      shopName: 'Fatma Bakery',
      foodName: 'Koshari',
      bags: 2,
      amount: 2 * PRICE,
      charityName: 'Giza Food Bank',
      createdAt: NOW.toISOString(),
      deliveredAt: null,
      refundedAt: null,
    });
    expect(receipt.receiptNumber).toMatch(/^ZK-2026-\d{6}$/);
    expect(await readMockBankBalance(GOOD.number)).toBe(BALANCE - 2 * PRICE);
    expect(await bagsLeft()).toBe(1);
  });

  test('FR-TGI-05 the bags become a Donation offered only to the chosen charity', async () => {
    const other = await createPartnerAccount(app, 'charity');
    await donateOk(2);

    const mine = (await get(app, '/partner/offers', charity.token)).body as { offers: { bags: number }[] };
    const theirs = (await get(app, '/partner/offers', other.token)).body as { offers: unknown[] };

    expect(mine.offers).toHaveLength(1);
    expect(mine.offers[0]?.bags).toBe(2);
    expect(theirs.offers).toEqual([]);
  });

  test('FR-TGI-06 each receipt number is different', async () => {
    const first = await donateOk(1);
    const second = await donateOk(1);

    expect(first.receiptNumber).not.toBe(second.receiptNumber);
  });

  test('FR-TGI-06 the consumer lists their Zakat receipts and opens one', async () => {
    const receipt = await donateOk(1);

    const list = await get(app, '/zakat', consumer.token);
    const one = await get(app, `/zakat/${receipt.id}`, consumer.token);

    expect((list.body as { receipts: Receipt[] }).receipts.map((r) => r.id)).toEqual([receipt.id]);
    expect((one.body as Receipt).receiptNumber).toBe(receipt.receiptNumber);
  });

  test('FR-TGI-06 the chosen charity can open the receipt; another consumer cannot', async () => {
    const receipt = await donateOk(1);
    const stranger = await createAccount(app, 'consumer');

    expect((await get(app, `/zakat/${receipt.id}`, charity.token)).status).toBe(200);
    expect((await get(app, `/zakat/${receipt.id}`, await tokenFor(app, stranger.email))).status).toBe(404);
  });

  test.each([
    ['zero bags', 0],
    ['more bags than are left', 4],
    ['not a whole number', 1.5],
  ])('FR-TGI-05 %s is refused and nothing is charged', async (_label, bags) => {
    const response = await donate({ charityId: charity.id, bags, paymentToken: await cardToken() });

    expect(response.status).toBe(bags === 4 ? 409 : 400);
    expect(await readMockBankBalance(GOOD.number)).toBe(BALANCE);
    expect(await bagsLeft()).toBe(3);
  });

  test('FR-TGI-05 a charity that does not accept the food type cannot be chosen', async () => {
    const dairy = await createPartnerAccount(app, 'charity', { acceptedFoodTypes: ['dairy_and_eggs'] });

    const response = await donate({ charityId: dairy.id, bags: 1, paymentToken: await cardToken() });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'invalid_input', fields: ['charityId'] });
  });
});

describe('E-TGI-02 when the Zakat payment fails nothing is reserved or donated', () => {
  test('E-TGI-02 a declined card: 402 with the reason, the bags stay, no receipt', async () => {
    const response = await donate({ charityId: charity.id, bags: 2, paymentToken: await cardToken(BLOCKED) });

    expect(response.status).toBe(402);
    expect(response.body).toEqual({ error: 'E-TGI-02', reason: 'declined' });
    expect(await bagsLeft()).toBe(3);
    expect(((await get(app, '/zakat', consumer.token)).body as { receipts: unknown[] }).receipts).toEqual([]);
    expect(((await get(app, '/partner/offers', charity.token)).body as { offers: unknown[] }).offers).toEqual(
      [],
    );
  });
});

describe('FR-TGI-06 the receipt is updated when the charity collects the bags', () => {
  test('FR-TGI-06 after the vendor enters the charity code the receipt is Delivered', async () => {
    const receipt = await donateOk(2);
    const offer = (
      (await get(app, '/partner/offers', charity.token)).body as { offers: { listingId: string }[] }
    ).offers[0];
    const accepted = await post(app, `/partner/offers/${offer?.listingId ?? ''}/accept`, charity.token, {
      pickupTime: at(30),
    });
    const code = (accepted.body as { pickupCode: string }).pickupCode;
    clock.now = () => new Date(at(30));

    await post(app, `/listings/${offer?.listingId ?? ''}/pickups/complete`, vendor.token, { code });

    const after = (await get(app, `/zakat/${receipt.id}`, consumer.token)).body as Receipt;
    expect(after).toMatchObject({ status: 'Delivered', deliveredAt: at(30), refundedAt: null });
  });
});

describe('E-TGI-03 BR-11 an uncollected Zakat donation is refunded in full', () => {
  test('E-TGI-03 BR-11 when the window ends without collection the consumer gets the full amount back', async () => {
    const receipt = await donateOk(2);

    const refunded = await refundUncollectedZakat(new Date(at(131)));

    expect(refunded).toBe(1);
    expect(await readMockBankBalance(GOOD.number)).toBe(BALANCE);
    const after = (await get(app, `/zakat/${receipt.id}`, consumer.token)).body as Receipt;
    expect(after).toMatchObject({ status: 'Refunded', refundedAt: at(131), deliveredAt: null });
  });

  test('E-TGI-03 before the window ends nothing is refunded', async () => {
    await donateOk(1);

    expect(await refundUncollectedZakat(new Date(at(129)))).toBe(0);
    expect(await readMockBankBalance(GOOD.number)).toBe(BALANCE - PRICE);
  });

  test('E-TGI-03 a delivered donation is not refunded, and a refund happens once', async () => {
    const delivered = await donateOk(1);
    const offer = (
      (await get(app, '/partner/offers', charity.token)).body as { offers: { listingId: string }[] }
    ).offers[0];
    const accepted = await post(app, `/partner/offers/${offer?.listingId ?? ''}/accept`, charity.token, {
      pickupTime: at(30),
    });
    clock.now = () => new Date(at(30));
    await post(app, `/listings/${offer?.listingId ?? ''}/pickups/complete`, vendor.token, {
      code: (accepted.body as { pickupCode: string }).pickupCode,
    });
    await donateOk(1);

    expect(await refundUncollectedZakat(new Date(at(131)))).toBe(1);
    expect(await refundUncollectedZakat(new Date(at(140)))).toBe(0);
    expect(((await get(app, `/zakat/${delivered.id}`, consumer.token)).body as Receipt).status).toBe(
      'Delivered',
    );
  });
});
