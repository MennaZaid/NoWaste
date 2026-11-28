// US-29 Waitlist (FR-RES-05, FR-RES-06, E-RES-02, BR-04, BR-05) and US-35 Cancellation and refund (FR-RES-12,
// FR-RES-13, BR-06), SDD 5.2 and 5.3 (IWaitlist: join, offerNext, accept, expireOffer). Decisions D-117 to D-120.
// A freed bag (expired hold, cancellation, expired or declined offer) is set aside for the first person waiting when at
// least BR-04 minutes remain; they have BR-05 minutes to accept with the normal card or no-card flow. The offer shows
// in the app (push waits for a development build, D-118). Runs against nowaste_test with a fixed clock.
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { clock } from '../src/domain/clock.js';
import { releaseExpiredHolds } from '../src/services/reservation/reservationService.js';
import { createMockPush, setPush } from '../src/adapters/push/push.js';
import { createAccount, tokenFor } from './helpers/accounts.js';
import {
  deleteAllUsers,
  readListingRow,
  readMockBankBalance,
  readNoShows,
  readPickupCode,
  readSettingValue,
  resetMockBank,
  setBagsAvailable,
  setSettingValue,
} from './helpers/database.js';
import { createDraft, createVendor, get, post, readyToPublish } from './helpers/listings.js';

const app = createApp();
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();
const setTime = (minutes: number) => {
  clock.now = () => new Date(NOW.getTime() + minutes * 60_000);
};

// The listing helper: 3 bags at 40 EGP; pickup from at(10) to at(130). BR-02 hold 15 min; slots of 30 min (D-97).
const PRICE = 40;
const GOOD = { number: '40000000', expiry: '12/30', cvv: '123' };
const BALANCE = 10000;

type Account = { id: string; token: string };
let listingId: string;
let vendor: Account;
const saved: Record<string, unknown> = {};

async function consumer(): Promise<Account> {
  const account = await createAccount(app, 'consumer');
  return { id: account.id, token: await tokenFor(app, account.email) };
}

/** The first pickup slot not yet ended at the current clock (slots start at at(10), every 30 minutes). */
function currentSlot(): string {
  const now = clock.now().getTime();
  for (let start = 10; start < 130; start += 30) {
    if (NOW.getTime() + Math.min(start + 30, 130) * 60_000 > now) return at(start);
  }
  return at(100);
}

const holdBag = (who: Account, extra: Record<string, unknown> = {}) =>
  post(app, '/reservations', who.token, { listingId, method: 'no-card', slotStart: currentSlot(), ...extra });

async function cardToken(who: Account): Promise<string> {
  const response = await post(app, '/mock-bank/tokens', who.token, GOOD);
  return (response.body as { token: string }).token;
}

const payBag = async (who: Account, extra: Record<string, unknown> = {}) =>
  post(app, '/reservations', who.token, {
    listingId,
    method: 'card',
    paymentToken: await cardToken(who),
    ...extra,
  });

const join = (who: Account) => post(app, `/listings/nearby/${listingId}/waitlist`, who.token);

interface Entry {
  id: string;
  listingId: string;
  status: string;
  position: number | null;
  offerExpiresAt: string | null;
}

async function entryOf(who: Account): Promise<Entry | undefined> {
  const response = await get(app, '/waitlist', who.token);
  return (response.body as { entries: Entry[] }).entries.find((e) => e.listingId === listingId);
}

const bagsLeft = async () => Number((await readListingRow(listingId))?.bags_available);
const cancel = (who: Account, id: string) => post(app, `/reservations/${id}/cancel`, who.token);

beforeAll(async () => {
  for (const key of ['BR-04', 'BR-05', 'BR-06']) saved[key] = await readSettingValue(key);
});

beforeEach(async () => {
  clock.now = () => NOW;
  await deleteAllUsers();
  await resetMockBank();
  vendor = await createVendor(app);
  listingId = await createDraft(app, vendor.token, at, { bagsTotal: 3 });
  await readyToPublish(app, vendor.token, listingId);
  await post(app, `/listings/${listingId}/publish`, vendor.token);
});

afterEach(async () => {
  clock.now = realNow;
  for (const key of Object.keys(saved)) await setSettingValue(key, saved[key]);
});

afterAll(async () => {
  await deleteAllUsers();
  await resetMockBank();
  await closePool();
});

describe('FR-RES-06 joining and leaving the waitlist', () => {
  test('FR-RES-06 when every bag is reserved the consumer joins the waitlist; the next one is second', async () => {
    await setBagsAvailable(listingId, 0);
    const first = await consumer();
    const second = await consumer();

    const joined = await join(first);
    await join(second);

    expect(joined.status).toBe(201);
    expect(joined.body).toMatchObject({ listingId, status: 'Waiting', position: 1, offerExpiresAt: null });
    expect(await entryOf(second)).toMatchObject({ status: 'Waiting', position: 2 });
  });

  test('FR-RES-06 while bags are left the consumer reserves instead of joining', async () => {
    const response = await join(await consumer());

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'bags_available' });
  });

  test('FR-RES-06 a consumer cannot join the same waitlist twice', async () => {
    await setBagsAvailable(listingId, 0);
    const who = await consumer();
    await join(who);

    const again = await join(who);

    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: 'already_waiting' });
  });

  test('FR-RES-06 D-119 leaving the waitlist moves the others up', async () => {
    await setBagsAvailable(listingId, 0);
    const first = await consumer();
    const second = await consumer();
    const mine = (await join(first)).body as Entry;
    await join(second);

    const left = await post(app, `/waitlist/${mine.id}/leave`, first.token);

    expect(left.status).toBe(200);
    expect((left.body as Entry).status).toBe('Left');
    expect(await entryOf(second)).toMatchObject({ status: 'Waiting', position: 1 });
  });
});

describe('FR-RES-05 FR-RES-06 BR-04 BR-05 a freed bag is offered to the next person', () => {
  test('FR-RES-05 BR-04 an expired hold with 30 minutes or more left is offered to the first person waiting', async () => {
    const holder = await consumer();
    await setBagsAvailable(listingId, 1);
    await holdBag(holder); // slot at(10), hold ends at(25)
    const waiting = await consumer();
    await join(waiting);
    setTime(26);

    await releaseExpiredHolds();

    expect(await entryOf(waiting)).toMatchObject({ status: 'Offered', offerExpiresAt: at(36) });
    // The bag is set aside for the offer: nobody else can take it.
    expect(await bagsLeft()).toBe(0);
    expect((await holdBag(await consumer())).body).toEqual({ error: 'E-RES-02' });
  });

  test('BR-04 with less than 30 minutes left the freed bag goes back to the listing', async () => {
    await setBagsAvailable(listingId, 1);
    setTime(100);
    const holder = await consumer();
    await holdBag(holder); // slot at(100), hold ends at(115)
    const waiting = await consumer();
    await join(waiting);
    setTime(116); // 14 minutes left

    await releaseExpiredHolds();

    expect(await bagsLeft()).toBe(1);
    expect(await entryOf(waiting)).toMatchObject({ status: 'Waiting' });
  });

  test('FR-RES-06 the offered consumer accepts without a card and gets the hold', async () => {
    await setBagsAvailable(listingId, 1);
    await holdBag(await consumer());
    const waiting = await consumer();
    const entry = (await join(waiting)).body as Entry;
    setTime(26);
    await releaseExpiredHolds();

    const accepted = await holdBag(waiting, { waitlistEntryId: entry.id });

    expect(accepted.status).toBe(201);
    expect((accepted.body as { status: string }).status).toBe('Held');
    expect(await entryOf(waiting)).toBeUndefined(); // Accepted entries are no longer listed
    expect(await bagsLeft()).toBe(0);
  });

  test('FR-RES-06 the offered consumer accepts by card', async () => {
    await setBagsAvailable(listingId, 1);
    await holdBag(await consumer());
    const waiting = await consumer();
    const entry = (await join(waiting)).body as Entry;
    setTime(26);
    await releaseExpiredHolds();

    const paid = await payBag(waiting, { waitlistEntryId: entry.id });

    expect(paid.status).toBe(201);
    expect((paid.body as { status: string }).status).toBe('Confirmed');
  });

  test('BR-05 an offer not accepted in 10 minutes passes to the next person', async () => {
    await setBagsAvailable(listingId, 1);
    await holdBag(await consumer());
    const first = await consumer();
    const second = await consumer();
    await join(first);
    await join(second);
    setTime(26);
    await releaseExpiredHolds();
    setTime(37);

    await releaseExpiredHolds();

    expect(await entryOf(first)).toMatchObject({ status: 'Expired' });
    expect(await entryOf(second)).toMatchObject({ status: 'Offered', offerExpiresAt: at(47) });
  });

  test('BR-05 accepting after the 10 minutes is refused', async () => {
    await setBagsAvailable(listingId, 1);
    await holdBag(await consumer());
    const waiting = await consumer();
    const entry = (await join(waiting)).body as Entry;
    setTime(26);
    await releaseExpiredHolds();
    setTime(37);

    const late = await holdBag(waiting, { waitlistEntryId: entry.id });

    expect(late.status).toBe(409);
    expect(late.body).toEqual({ error: 'offer_expired' });
  });

  test('FR-RES-06 D-119 declining passes the bag to the next person at once; with nobody left it goes back', async () => {
    await setBagsAvailable(listingId, 1);
    await holdBag(await consumer());
    const first = await consumer();
    const second = await consumer();
    const entry = (await join(first)).body as Entry;
    await join(second);
    setTime(26);
    await releaseExpiredHolds();

    await post(app, `/waitlist/${entry.id}/decline`, first.token);

    expect(await entryOf(second)).toMatchObject({ status: 'Offered' });
    const offered = (await entryOf(second)) as Entry;
    await post(app, `/waitlist/${offered.id}/decline`, second.token);
    expect(await bagsLeft()).toBe(1);
  });

  test('FR-RES-06 D-118 the person offered the bag is notified through the push adapter', async () => {
    const push = createMockPush();
    setPush(push);
    try {
      await setBagsAvailable(listingId, 1);
      await holdBag(await consumer());
      const waiting = await consumer();
      const entry = (await join(waiting)).body as Entry;
      setTime(26);

      await releaseExpiredHolds();

      // D-121: the holder also gets confirmed and released notifications; this test is about the offer.
      expect(push.sent.filter((p) => p.message.kind === 'waitlist_offer')).toEqual([
        {
          userId: waiting.id,
          message: {
            kind: 'waitlist_offer',
            data: {
              entryId: entry.id,
              listingId,
              offerExpiresAt: at(36),
              shopName: 'Fatma Bakery',
              nameEn: 'Koshari',
            },
          },
        },
      ]);
    } finally {
      setPush(undefined);
    }
  });

  test('BR-05 the minutes come from settings', async () => {
    await setSettingValue('BR-05', { accept_minutes: 3 });
    await setBagsAvailable(listingId, 1);
    await holdBag(await consumer());
    const waiting = await consumer();
    await join(waiting);
    setTime(26);

    await releaseExpiredHolds();

    expect(await entryOf(waiting)).toMatchObject({ offerExpiresAt: at(29) });
  });
});

describe('FR-RES-12 FR-RES-13 BR-06 cancelling a reservation', () => {
  test('FR-RES-12 BR-06 a card reservation cancelled within 10 minutes is refunded in full', async () => {
    const who = await consumer();
    const paid = (await payBag(who)).body as { id: string };
    setTime(10);

    const response = await cancel(who, paid.id);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      reservation: { status: 'Cancelled' },
      refund: { refunded: true, amount: PRICE },
      noShow: false,
    });
    expect(await readMockBankBalance(GOOD.number)).toBe(BALANCE);
    expect(await bagsLeft()).toBe(3);
  });

  test('FR-RES-12 BR-06 a card reservation cancelled after 10 minutes is cancelled without a refund', async () => {
    const who = await consumer();
    const paid = (await payBag(who)).body as { id: string };
    setTime(11);

    const response = await cancel(who, paid.id);

    expect(response.body).toMatchObject({
      reservation: { status: 'Cancelled' },
      refund: { refunded: false },
    });
    expect(await readMockBankBalance(GOOD.number)).toBe(BALANCE - PRICE);
  });

  test('BR-06 the refund window comes from settings', async () => {
    await setSettingValue('BR-06', { full_refund_within_minutes: 20 });
    const who = await consumer();
    const paid = (await payBag(who)).body as { id: string };
    setTime(15);

    expect((await cancel(who, paid.id)).body).toMatchObject({ refund: { refunded: true } });
  });

  test('FR-RES-13 a no-card reservation cancelled before its slot starts is not a no-show', async () => {
    const who = await consumer();
    const held = (await holdBag(who)).body as { id: string }; // slot at(10)

    const response = await cancel(who, held.id);

    expect(response.body).toMatchObject({ reservation: { status: 'Cancelled' }, noShow: false });
    expect(await readNoShows(who.id)).toEqual([]);
  });

  test('FR-RES-13 a no-card reservation cancelled after its hold started counts as a no-show', async () => {
    const who = await consumer();
    const held = (await holdBag(who)).body as { id: string };
    setTime(12);

    const response = await cancel(who, held.id);

    expect(response.body).toMatchObject({ noShow: true });
    expect((await readNoShows(who.id)).map((n) => n.source)).toEqual(['cancelled after start']);
  });

  test('FR-RES-12 the pickup code of a cancelled reservation no longer works', async () => {
    const who = await consumer();
    const held = (await holdBag(who)).body as { id: string };
    await cancel(who, held.id);

    expect((await readPickupCode(held.id))?.status).toBe('Void');
  });

  test('FR-RES-06 a cancelled bag is offered to the waitlist', async () => {
    await setBagsAvailable(listingId, 1);
    const who = await consumer();
    const held = (await holdBag(who)).body as { id: string };
    const waiting = await consumer();
    await join(waiting);

    await cancel(who, held.id);

    expect(await entryOf(waiting)).toMatchObject({ status: 'Offered' });
  });

  test('FR-RES-12 another consumer cannot cancel it, and it cannot be cancelled twice', async () => {
    const who = await consumer();
    const held = (await holdBag(who)).body as { id: string };

    expect((await cancel(await consumer(), held.id)).status).toBe(404);
    await cancel(who, held.id);
    const again = await cancel(who, held.id);
    expect(again.status).toBe(409);
    expect(again.body).toEqual({ error: 'not_cancellable', status: 'Cancelled' });
  });
});
