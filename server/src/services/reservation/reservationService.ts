// C-09 Reservation Service, IReservation (SDD 3.2.1, 5.2): no-card reservation and its hold (FR-RES-03), "I'm on my
// way" (FR-RES-04, E-RES-05), release when the hold expires (FR-RES-05), never more reservations than bags
// (FR-RES-07, E-RES-02). Decisions D-89 to D-93. The minutes come from the settings rows BR-02, BR-03 and BR-09,
// never from constants in code. US-29 (D-117): a freed bag is offered to the waitlist (waitlistService.runWaitlist);
// a waitlist offer is accepted with POST /reservations and waitlistEntryId. US-35 (D-120): cancel, with the BR-06
// refund and the FR-RES-13 no-show. Push notifications (US-34) come later.
import { randomInt } from 'node:crypto';
import { DatabaseError } from 'pg';
import { clock } from '../../domain/clock.js';
import { SrsError } from '../../domain/errors.js';
import { noShowStanding, type NoShowRule, type NoShowStanding } from '../../domain/noShow.js';
import {
  canCheckIn,
  checkedInHoldEnd,
  holdEnd,
  pickupSlots,
  slotStarted,
  type CheckInRule,
  type HoldRule,
  type SlotRule,
} from '../../domain/reservation.js';
import { withTransaction } from '../../data/db.js';
import { chargeCard, paymentTimeoutMs, refundCard } from '../payment/paymentService.js';
import { runWaitlist } from '../waitlist/waitlistService.js';
import {
  notifyReservationConfirmed,
  notifyReservationsReleased,
} from '../notification/notificationService.js';
import { cancelReservation, claimOffer, findCancelFacts } from '../../data/waitlistRepository.js';
import {
  confirmCardReservation,
  dropPendingReservation,
  dropStalePendingPayments,
  findByIdempotencyKey,
  findReservation,
  hasHeldReservation,
  insertHeldReservation,
  insertPendingCardReservation,
  insertPickupCode,
  listReservations,
  lockOffer,
  noCardNoShowTimes,
  releaseExpired,
  saveCheckIn,
  takeBag,
  type ReservationRecord,
} from '../../data/reservationRepository.js';
import { getSetting } from '../../data/settingsRepository.js';
import { closeEndedListings } from '../../data/listingRepository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY_MAX = 100;
// Tries before giving up on a pickup code that is not already Active (10^6 codes, so a clash is rare).
const CODE_TRIES = 20;

async function numbers<T>(key: string, fields: (keyof T)[]): Promise<T> {
  const value = (await getSetting(key))?.value as Record<string, unknown> | null | undefined;
  for (const field of fields) {
    if (typeof value?.[field as string] !== 'number')
      throw new Error(`Settings row ${key} is missing or invalid`);
  }
  return value as T;
}

const holdRule = () => numbers<HoldRule>('BR-02', ['hold_minutes']);
const checkInRule = () => numbers<CheckInRule>('BR-03', ['check_ins_allowed', 'extension_minutes']);
/** D-97: the pickup slot length. */
export const slotRule = () => numbers<SlotRule>('PICKUP-SLOTS', ['slot_minutes']);
const codeRule = () => numbers<{ digits: number }>('BR-09', ['digits']);
const noShowRule = () => numbers<NoShowRule>('BR-07', ['no_shows', 'within_days', 'block_days']);

export interface ReservationView {
  id: string;
  method: 'card' | 'no-card';
  status: string;
  holdExpiresAt: string | null;
  /** D-97: the chosen pickup slot. */
  slotStart: string | null;
  checkedIn: boolean;
  /** FR-RES-10; D-97: only from the slot start. */
  pickupCode: string | null;
  createdAt: string;
  listing: {
    id: string;
    nameAr: string | null;
    nameEn: string | null;
    sourceLanguage: 'ar' | 'en' | null;
    price: number;
    pickupStart: string;
    pickupEnd: string;
    shopName: string;
    address: string;
  };
}

function toView(r: ReservationRecord): ReservationView {
  const now = clock.now();
  // D-102: a reservation still Held or Confirmed at the pickup end was not collected (its status stays until US-35).
  const notCollected =
    (r.status === 'Held' || r.status === 'Confirmed') && r.listing.pickupEnd.getTime() <= now.getTime();
  return {
    id: r.id,
    method: r.method,
    status: notCollected ? 'Not collected' : r.status,
    holdExpiresAt: r.holdExpiresAt?.toISOString() ?? null,
    slotStart: r.slotStart?.toISOString() ?? null,
    checkedIn: r.checkedIn,
    // D-97: the code is given from the slot start.
    pickupCode: !notCollected && slotStarted(r.slotStart, now) ? r.pickupCode : null,
    createdAt: r.createdAt.toISOString(),
    listing: {
      id: r.listingId,
      ...r.listing,
      pickupStart: r.listing.pickupStart.toISOString(),
      pickupEnd: r.listing.pickupEnd.toISOString(),
    },
  };
}

/** FR-RES-05 (SDD 3.2.5.5): releases every expired hold. Run by the worker every minute and before each read (D-93). */
export async function releaseExpiredHolds(): Promise<number> {
  const now = clock.now();
  // D-99: a card payment the bank never answered (twice PAYMENT-TIMEOUT, e.g. after a crash) gives its bag back.
  // D-102: listings whose pickup has ended are Closed (the worker runs this every minute).
  await closeEndedListings(now);
  await dropStalePendingPayments(new Date(now.getTime() - 2 * (await paymentTimeoutMs())));
  const released = await releaseExpired(now);
  // US-34 (FR-RES-11, D-121): each consumer is told their reservation was released.
  await notifyReservationsReleased(released);
  // US-29 (FR-RES-05, FR-RES-06): freed bags go to the people waiting; offers not accepted in time pass on.
  await runWaitlist(now);
  return released.length;
}

/** US-29: claims the waitlist offer inside the reservation transaction, or refuses (409 offer_expired, 404). */
async function claimWaitlistBag(
  client: Parameters<typeof claimOffer>[0],
  entryId: string | null,
  consumerId: string,
  listingId: string,
  now: Date,
): Promise<void> {
  if (entryId === null) return;
  const outcome = await claimOffer(client, entryId, consumerId, listingId, now);
  if (outcome === 'notFound') throw new SrsError(404, { error: 'not_found' });
  if (outcome === 'expired') throw new SrsError(409, { error: 'offer_expired' });
}

async function viewOf(id: string, consumerId: string): Promise<ReservationView> {
  const found = await findReservation(id, consumerId);
  if (found === undefined) throw new SrsError(404, { error: 'not_found' });
  return toView(found);
}

function newCode(digits: number): string {
  return String(randomInt(0, 10 ** digits)).padStart(digits, '0');
}

const isUniqueViolation = (error: unknown, constraint: string) =>
  error instanceof DatabaseError && error.code === '23505' && error.constraint === constraint;

/**
 * POST /reservations {listingId, method, slotStart | paymentToken, idempotencyKey?} (FR-RES-02, FR-RES-03). D-97: slotStart is one of the offer's
 * pickup slots (400 invalid_reservation fields ["slotStart"] otherwise); the hold starts when the slot starts.
 * 201 the new reservation; 200 the earlier one for a repeated idempotency key (NFR-15); 400 invalid_reservation;
 * 404 not_found when the listing is not on offer; 409 E-RES-02 when no bag is left; 409 already_reserved (D-91).
 */
export async function reserve(
  consumerId: string,
  input: Record<string, unknown>,
): Promise<{ created: boolean; reservation: ReservationView }> {
  const { listingId, method, slotStart, paymentToken, idempotencyKey, waitlistEntryId } = input;
  const fields: string[] = [];
  // US-29: accepting a waitlist offer sends its entry id.
  if (waitlistEntryId !== undefined && (typeof waitlistEntryId !== 'string' || !UUID.test(waitlistEntryId))) {
    fields.push('waitlistEntryId');
  }
  const entryId = typeof waitlistEntryId === 'string' ? waitlistEntryId : null;
  if (typeof listingId !== 'string' || !UUID.test(listingId)) fields.push('listingId');
  if (method !== 'no-card' && method !== 'card') fields.push('method');
  const slot = typeof slotStart === 'string' ? new Date(slotStart) : null;
  // D-97: a no-card customer chooses a slot; D-99: a card customer sends the bank's one-time token instead.
  if (method !== 'card' && (slot === null || Number.isNaN(slot.getTime()))) fields.push('slotStart');
  if (method === 'card' && (typeof paymentToken !== 'string' || !UUID.test(paymentToken))) {
    fields.push('paymentToken');
  }
  const keyOk =
    idempotencyKey === undefined ||
    (typeof idempotencyKey === 'string' &&
      idempotencyKey.length > 0 &&
      idempotencyKey.length <= IDEMPOTENCY_KEY_MAX);
  if (!keyOk) fields.push('idempotencyKey');
  if (fields.length > 0) throw new SrsError(400, { error: 'invalid_reservation', fields });
  const key = typeof idempotencyKey === 'string' ? idempotencyKey : null;

  if (key !== null) {
    const earlier = await findByIdempotencyKey(consumerId, key);
    if (earlier !== undefined) return { created: false, reservation: toView(earlier) };
  }
  // D-93: a hold that has ended gives its bag back before anyone reserves.
  await releaseExpiredHolds();
  if (method === 'card') {
    return reserveByCard(consumerId, listingId as string, paymentToken as string, key, entryId);
  }
  const now = clock.now();
  const [hold, codes, slots] = [await holdRule(), await codeRule(), await slotRule()];

  let id: string;
  try {
    id = await withTransaction(async (client) => {
      const offer = await lockOffer(client, listingId as string, now);
      if (offer === undefined) throw new SrsError(404, { error: 'not_found' });
      const chosen = slot as Date;
      const offered = pickupSlots(offer.pickupStart, offer.pickupEnd, now, slots);
      if (!offered.some((start) => start.getTime() === chosen.getTime())) {
        throw new SrsError(400, { error: 'invalid_reservation', fields: ['slotStart'] });
      }
      if (await hasHeldReservation(client, offer.id, consumerId)) {
        throw new SrsError(409, { error: 'already_reserved' });
      }
      await claimWaitlistBag(client, entryId, consumerId, offer.id, now);
      const bagsAvailable = offer.bagsAvailable + (entryId === null ? 0 : 1);
      if (bagsAvailable <= 0) throw new SrsError(409, { error: 'E-RES-02' });
      await takeBag(client, offer.id);
      const reservationId = await insertHeldReservation(client, {
        listingId: offer.id,
        consumerId,
        holdExpiresAt: holdEnd(now, chosen, offer.pickupEnd, hold),
        slotStart: chosen,
        idempotencyKey: key,
        now,
      });
      for (let i = 0; i < CODE_TRIES; i += 1) {
        if (await insertPickupCode(client, reservationId, newCode(codes.digits))) return reservationId;
      }
      throw new Error('Could not make a free pickup code');
    });
  } catch (error) {
    // The same key sent twice at the same moment: the second insert loses; return the first reservation.
    if (key !== null && isUniqueViolation(error, 'reservations_idempotency')) {
      const earlier = await findByIdempotencyKey(consumerId, key);
      if (earlier !== undefined) return { created: false, reservation: toView(earlier) };
    }
    if (isUniqueViolation(error, 'reservations_one_hold_per_listing')) {
      throw new SrsError(409, { error: 'already_reserved' });
    }
    throw error;
  }
  // US-34 (FR-RES-11, D-121): the no-card hold is confirmed.
  await notifyReservationConfirmed(id);
  return { created: true, reservation: await viewOf(id, consumerId) };
}

async function insertCode(
  client: Parameters<typeof insertPickupCode>[0],
  reservationId: string,
): Promise<void> {
  const codes = await codeRule();
  for (let i = 0; i < CODE_TRIES; i += 1) {
    if (await insertPickupCode(client, reservationId, newCode(codes.digits))) return;
  }
  throw new Error('Could not make a free pickup code');
}

/**
 * FR-RES-02, E-RES-01 (D-99, SDD 5.2 reserve with method CARD): the bag is taken under the listing row lock (E-RES-02)
 * and the reservation saved as Pending payment; then the full price is charged to the token. Approved: Confirmed for
 * the whole window, with the pickup code at once (no hold, no slot). Declined or no answer within PAYMENT-TIMEOUT:
 * no reservation is kept, the bag is available again, and 402 E-RES-01 says why.
 */
async function reserveByCard(
  consumerId: string,
  listingId: string,
  paymentToken: string,
  key: string | null,
  entryId: string | null = null,
): Promise<{ created: boolean; reservation: ReservationView }> {
  const now = clock.now();
  let pending: { id: string; price: number };
  try {
    pending = await withTransaction(async (client) => {
      const offer = await lockOffer(client, listingId, now);
      if (offer === undefined) throw new SrsError(404, { error: 'not_found' });
      await claimWaitlistBag(client, entryId, consumerId, offer.id, now);
      if (offer.bagsAvailable + (entryId === null ? 0 : 1) <= 0)
        throw new SrsError(409, { error: 'E-RES-02' });
      await takeBag(client, offer.id);
      const id = await insertPendingCardReservation(client, {
        listingId: offer.id,
        consumerId,
        price: offer.price,
        idempotencyKey: key,
        now,
      });
      return { id, price: offer.price };
    });
  } catch (error) {
    if (key !== null && isUniqueViolation(error, 'reservations_idempotency')) {
      const earlier = await findByIdempotencyKey(consumerId, key);
      if (earlier !== undefined) return { created: false, reservation: toView(earlier) };
    }
    throw error;
  }

  const payment = await chargeCard(pending.price, paymentToken);
  if (!payment.approved) {
    await dropPendingReservation(pending.id);
    throw new SrsError(402, { error: 'E-RES-01', reason: payment.reason });
  }
  await withTransaction(async (client) => {
    await confirmCardReservation(client, {
      id: pending.id,
      reference: payment.reference,
      amount: pending.price,
      now: clock.now(),
    });
    await insertCode(client, pending.id);
  });
  // US-34 (FR-RES-11, D-121): confirmed once the bank approved.
  await notifyReservationConfirmed(pending.id);
  return { created: true, reservation: await viewOf(pending.id, consumerId) };
}

/**
 * GET /reservations/:id: the consumer's own reservation (404 for anyone else's). D-100: a card reservation still
 * waiting for the bank is not shown (404) until it is Confirmed; if the payment fails it is removed (E-RES-01).
 */
export async function getReservation(consumerId: string, id: string): Promise<ReservationView> {
  if (!UUID.test(id)) throw new SrsError(404, { error: 'not_found' });
  await releaseExpiredHolds();
  const reservation = await viewOf(id, consumerId);
  if (reservation.status === 'Pending payment') throw new SrsError(404, { error: 'not_found' });
  return reservation;
}

/**
 * POST /reservations/:id/checkin: "I'm on my way" (FR-RES-04); 409 E-RES-05 a second time or after the hold;
 * 409 slot_not_started before the chosen slot (D-97).
 */
export async function checkIn(consumerId: string, id: string): Promise<ReservationView> {
  const reservation = await getReservation(consumerId, id);
  const rule = await checkInRule();
  const now = clock.now();
  const holdExpiresAt = reservation.holdExpiresAt === null ? null : new Date(reservation.holdExpiresAt);
  // D-97: "I'm on my way" is given from the slot start.
  const slotStart = reservation.slotStart === null ? null : new Date(reservation.slotStart);
  if (reservation.status === 'Held' && !slotStarted(slotStart, now)) {
    throw new SrsError(409, { error: 'slot_not_started' });
  }
  if (
    holdExpiresAt === null ||
    !canCheckIn({ status: reservation.status, checkedIn: reservation.checkedIn, holdExpiresAt }, now, rule)
  ) {
    throw new SrsError(409, { error: 'E-RES-05' });
  }
  const extended = checkedInHoldEnd(holdExpiresAt, new Date(reservation.listing.pickupEnd), rule);
  if (!(await saveCheckIn(id, extended, now))) throw new SrsError(409, { error: 'E-RES-05' });
  return viewOf(id, consumerId);
}

/** GET /reservations/no-show-standing: the notice or warning before the BR-07 block, with the BR-07 numbers. */
export async function getNoShowStanding(
  consumerId: string,
): Promise<NoShowStanding & { limit: number; withinDays: number; blockDays: number }> {
  await releaseExpiredHolds();
  const rule = await noShowRule();
  const standing = noShowStanding(await noCardNoShowTimes(consumerId), clock.now(), rule);
  return { ...standing, limit: rule.no_shows, withinDays: rule.within_days, blockDays: rule.block_days };
}

/** GET /reservations?scope=active|past: the consumer's reservations (FR-RES-08, D-94). */
export async function myReservations(
  consumerId: string,
  scope: unknown,
): Promise<{ reservations: ReservationView[] }> {
  if (scope !== 'active' && scope !== 'past') {
    throw new SrsError(400, { error: 'invalid_input', fields: ['scope'] });
  }
  await releaseExpiredHolds();
  return { reservations: (await listReservations(consumerId, scope, clock.now())).map(toView) };
}

const refundRule = () =>
  numbers<{ full_refund_within_minutes: number }>('BR-06', ['full_refund_within_minutes']);

/**
 * POST /reservations/:id/cancel (FR-RES-12, FR-RES-13, US-35, D-120): before the pickup ends, a Held or Confirmed
 * reservation is Cancelled, its code made void and its bag freed for the waitlist. A card payment is refunded in full
 * only within BR-06 minutes of reserving; a no-card reservation cancelled after its hold started (its slot start)
 * counts as a no-show. 409 not_cancellable otherwise; 502 refund_failed when the bank did not refund (nothing changes).
 */
export async function cancel(
  consumerId: string,
  id: string,
): Promise<{ reservation: ReservationView; refund: { refunded: boolean; amount: number }; noShow: boolean }> {
  if (!UUID.test(id)) throw new SrsError(404, { error: 'not_found' });
  await releaseExpiredHolds();
  const facts = await findCancelFacts(id, consumerId);
  if (facts === undefined) throw new SrsError(404, { error: 'not_found' });
  const now = clock.now();
  if (
    (facts.status !== 'Held' && facts.status !== 'Confirmed') ||
    facts.pickupEnd.getTime() <= now.getTime()
  ) {
    throw new SrsError(409, { error: 'not_cancellable', status: facts.status });
  }
  const windowMs = (await refundRule()).full_refund_within_minutes * 60_000;
  const refundable =
    facts.method === 'card' &&
    facts.paymentReference !== null &&
    now.getTime() - facts.createdAt.getTime() <= windowMs;
  const amount = refundable ? (facts.paymentAmount ?? 0) : 0;
  if (refundable && !(await refundCard(facts.paymentReference as string, amount))) {
    throw new SrsError(502, { error: 'refund_failed' });
  }
  const noShow = facts.method === 'no-card' && slotStarted(facts.slotStart, now);
  const done = await cancelReservation({
    id,
    listingId: facts.listingId,
    consumerId,
    method: facts.method,
    refunded: refundable,
    noShow,
    now,
  });
  if (!done) throw new SrsError(409, { error: 'not_cancellable', status: facts.status });
  await runWaitlist(now);
  return { reservation: await viewOf(id, consumerId), refund: { refunded: refundable, amount }, noShow };
}
