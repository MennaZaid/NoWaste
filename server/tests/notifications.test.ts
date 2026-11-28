// US-34 notifications shown in the app (FR-RES-11, IF-SW-06; decision D-121, option A of 2026-11-28): the consumer is
// told when a reservation is confirmed, when it is released, when a waitlisted bag is offered and when the pickup
// window opens. Each notification is saved (the app lists them) and handed to the Push Adapter (off until a
// development build exists, D-118). Runs against nowaste_test with a fixed clock.
import { createApp } from '../src/api/app.js';
import { closePool } from '../src/data/db.js';
import { clock } from '../src/domain/clock.js';
import { releaseExpiredHolds } from '../src/services/reservation/reservationService.js';
import { makeWindowOpenNotifications } from '../src/services/notification/notificationService.js';
import { createAccount, tokenFor } from './helpers/accounts.js';
import { deleteAllUsers, resetMockBank, setBagsAvailable } from './helpers/database.js';
import { createDraft, createVendor, get, post, readyToPublish } from './helpers/listings.js';

const app = createApp();
const NOW = new Date('2026-11-01T10:00:00.000Z');
const realNow = clock.now;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();
const setTime = (minutes: number) => {
  clock.now = () => new Date(NOW.getTime() + minutes * 60_000);
};

type Account = { id: string; token: string };
let listingId: string;

interface Note {
  id: string;
  kind: string;
  data: Record<string, string>;
  createdAt: string;
  read: boolean;
}

async function consumer(): Promise<Account> {
  const account = await createAccount(app, 'consumer');
  return { id: account.id, token: await tokenFor(app, account.email) };
}

const holdBag = (who: Account, extra: Record<string, unknown> = {}) =>
  post(app, '/reservations', who.token, { listingId, method: 'no-card', slotStart: at(10), ...extra });

async function notesOf(who: Account): Promise<{ notifications: Note[]; unreadCount: number }> {
  return (await get(app, '/notifications', who.token)).body as { notifications: Note[]; unreadCount: number };
}

beforeEach(async () => {
  clock.now = () => NOW;
  await deleteAllUsers();
  await resetMockBank();
  const vendor = await createVendor(app);
  listingId = await createDraft(app, vendor.token, at, { bagsTotal: 3 });
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

describe('FR-RES-11 the consumer is notified in the app', () => {
  test('FR-RES-11 a reservation without a card is confirmed: one unread notification with its details', async () => {
    const who = await consumer();
    const held = (await holdBag(who)).body as { id: string };

    const notes = await notesOf(who);

    expect(notes.unreadCount).toBe(1);
    expect(notes.notifications).toHaveLength(1);
    expect(notes.notifications[0]).toMatchObject({
      kind: 'reservation_confirmed',
      read: false,
      createdAt: NOW.toISOString(),
      data: { reservationId: held.id, listingId, shopName: 'Fatma Bakery', nameEn: 'Koshari' },
    });
  });

  test('FR-RES-11 a card reservation is confirmed once the bank approves', async () => {
    const who = await consumer();
    const token = (
      await post(app, '/mock-bank/tokens', who.token, { number: '40000000', expiry: '12/30', cvv: '123' })
    ).body as { token: string };
    await post(app, '/reservations', who.token, { listingId, method: 'card', paymentToken: token.token });

    expect((await notesOf(who)).notifications.map((n) => n.kind)).toEqual(['reservation_confirmed']);
  });

  test('FR-RES-11 a declined card gives no confirmation', async () => {
    const who = await consumer();
    const token = (
      await post(app, '/mock-bank/tokens', who.token, { number: '40000002', expiry: '12/30', cvv: '123' })
    ).body as { token: string };
    await post(app, '/reservations', who.token, { listingId, method: 'card', paymentToken: token.token });

    expect((await notesOf(who)).notifications).toEqual([]);
  });

  test('FR-RES-11 the consumer is told when the hold ran out and the reservation was released', async () => {
    const who = await consumer();
    await holdBag(who); // hold ends at(25)
    setTime(26);

    await releaseExpiredHolds();

    const kinds = (await notesOf(who)).notifications.map((n) => n.kind);
    expect(kinds).toEqual(['reservation_released', 'reservation_confirmed']);
  });

  test('FR-RES-11 the person a waitlisted bag is offered to is told, with the time to accept', async () => {
    await setBagsAvailable(listingId, 1);
    await holdBag(await consumer());
    const waiting = await consumer();
    const entry = (await post(app, `/listings/nearby/${listingId}/waitlist`, waiting.token)).body as {
      id: string;
    };
    setTime(26);

    await releaseExpiredHolds();

    expect((await notesOf(waiting)).notifications[0]).toMatchObject({
      kind: 'waitlist_offer',
      data: { entryId: entry.id, listingId, offerExpiresAt: at(36), shopName: 'Fatma Bakery' },
    });
  });

  test('FR-RES-11 when the pickup window opens the consumer is told the bag is ready, once', async () => {
    const who = await consumer();
    await holdBag(who); // slot and pickup start at(10)

    expect(await makeWindowOpenNotifications(new Date(at(9)))).toBe(0);
    expect(await makeWindowOpenNotifications(new Date(at(10)))).toBe(1);
    expect(await makeWindowOpenNotifications(new Date(at(11)))).toBe(0);

    expect((await notesOf(who)).notifications.map((n) => n.kind)).toEqual([
      'window_open',
      'reservation_confirmed',
    ]);
  });

  test('FR-RES-11 a cancelled reservation gets no "bag ready" notification', async () => {
    const who = await consumer();
    const held = (await holdBag(who)).body as { id: string };
    await post(app, `/reservations/${held.id}/cancel`, who.token);

    expect(await makeWindowOpenNotifications(new Date(at(10)))).toBe(0);
  });
});

describe('IF-SW-06 reading the notifications', () => {
  test('IF-SW-06 marking them read clears the unread count; they stay in the list', async () => {
    const who = await consumer();
    await holdBag(who);

    const read = await post(app, '/notifications/read', who.token);

    expect(read.status).toBe(200);
    const notes = await notesOf(who);
    expect(notes.unreadCount).toBe(0);
    expect(notes.notifications[0]?.read).toBe(true);
  });

  test('IF-SW-06 a consumer sees only their own notifications', async () => {
    await holdBag(await consumer());

    expect((await notesOf(await consumer())).notifications).toEqual([]);
  });
});
