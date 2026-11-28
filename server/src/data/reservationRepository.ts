// C-27 Data Access: reservations, their pickup codes and no-shows (SDD 4.2; US-28, US-30). Reserving runs in one
// transaction that locks the listing row (SELECT ... FOR UPDATE), so the last bag is taken once (FR-RES-07, E-RES-02).
import type { PoolClient } from 'pg';
import { getPool } from './db.js';

export interface ReservationRecord {
  id: string;
  listingId: string;
  consumerId: string;
  method: 'card' | 'no-card';
  status: string;
  holdExpiresAt: Date | null;
  /** D-97: the chosen pickup slot (no-card), null for card reservations. */
  slotStart: Date | null;
  checkedIn: boolean;
  createdAt: Date;
  /** The pickup code while it is Active, otherwise null. */
  pickupCode: string | null;
  listing: {
    nameAr: string | null;
    nameEn: string | null;
    sourceLanguage: 'ar' | 'en' | null;
    price: number;
    pickupStart: Date;
    pickupEnd: Date;
    shopName: string;
    address: string;
  };
}

type Row = Omit<ReservationRecord, 'listing'> & ReservationRecord['listing'];

const COLUMNS = `r.id, r.listing_id AS "listingId", r.consumer_id AS "consumerId", r.method, r.status,
  r.hold_expires_at AS "holdExpiresAt", r.slot_start AS "slotStart", r.checked_in AS "checkedIn", r.created_at AS "createdAt",
  pc.code AS "pickupCode", l.name_ar AS "nameAr", l.name_en AS "nameEn", l.source_language AS "sourceLanguage",
  l.price::float8 AS price, l.pickup_start AS "pickupStart", l.pickup_end AS "pickupEnd",
  v.shop_name AS "shopName", COALESCE(b.address, v.address) AS address`;

const FROM = `FROM reservations r
  JOIN listings l ON l.id = r.listing_id
  JOIN vendor_profiles v ON v.user_id = l.vendor_id
  LEFT JOIN vendor_branches b ON b.id = l.branch_id
  LEFT JOIN pickup_codes pc ON pc.reservation_id = r.id AND pc.status = 'Active'`;

function toRecord(row: Row): ReservationRecord {
  const { nameAr, nameEn, sourceLanguage, price, pickupStart, pickupEnd, shopName, address, ...rest } = row;
  return {
    ...rest,
    listing: { nameAr, nameEn, sourceLanguage, price, pickupStart, pickupEnd, shopName, address },
  };
}

/** A consumer's reservation, or undefined when it is not theirs. */
export async function findReservation(
  id: string,
  consumerId: string,
): Promise<ReservationRecord | undefined> {
  const result = await getPool().query<Row>(
    `SELECT ${COLUMNS} ${FROM} WHERE r.id = $1 AND r.consumer_id = $2`,
    [id, consumerId],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : toRecord(row);
}

/**
 * FR-RES-08 (D-94, D-100): a consumer's active reservations (Held, Confirmed; a card reservation still waiting for
 * the bank is not shown until it is Confirmed), the soonest deadline first,
 * or past ones (Completed, Released, Cancelled, No-show), the newest first.
 */
export async function listReservations(
  consumerId: string,
  scope: 'active' | 'past',
  now: Date,
): Promise<ReservationRecord[]> {
  // D-102: a reservation still Held or Confirmed at the pickup end was not collected: it is past.
  const where =
    scope === 'active'
      ? `r.status IN ('Held', 'Confirmed') AND l.pickup_end > $2
         ORDER BY COALESCE(r.hold_expires_at, l.pickup_end), r.created_at, r.id`
      : `(r.status IN ('Completed', 'Released', 'Cancelled', 'No-show')
          OR (r.status IN ('Held', 'Confirmed') AND l.pickup_end <= $2))
         ORDER BY r.seq DESC`;
  const result = await getPool().query<Row>(
    `SELECT ${COLUMNS} ${FROM} WHERE r.consumer_id = $1 AND ${where}`,
    [consumerId, now],
  );
  return result.rows.map(toRecord);
}

/** NFR-15: the reservation an earlier request with the same idempotency key made. */
export async function findByIdempotencyKey(
  consumerId: string,
  key: string,
): Promise<ReservationRecord | undefined> {
  const result = await getPool().query<Row>(
    `SELECT ${COLUMNS} ${FROM} WHERE r.consumer_id = $1 AND r.idempotency_key = $2`,
    [consumerId, key],
  );
  const row = result.rows[0];
  return row === undefined ? undefined : toRecord(row);
}

export interface LockedOffer {
  id: string;
  bagsAvailable: number;
  pickupStart: Date;
  pickupEnd: Date;
  price: number;
}

/**
 * E-RES-02: locks the listing row and returns it while it can be bought now (Active Discounted Surplus Bag of an
 * Approved vendor whose pickup has not ended), with its bags left (may be 0). Undefined when it is not an offer.
 */
export async function lockOffer(
  client: PoolClient,
  listingId: string,
  now: Date,
): Promise<LockedOffer | undefined> {
  const result = await client.query<LockedOffer>(
    `SELECT l.id, l.bags_available AS "bagsAvailable", l.pickup_start AS "pickupStart", l.pickup_end AS "pickupEnd",
            l.price::float8 AS price
     FROM listings l JOIN users u ON u.id = l.vendor_id
     WHERE l.id = $1 AND l.status IN ('Active', 'Fully reserved') AND l.listing_type = 'Discounted Surplus Bag'
       AND NOT l.unfit_for_people AND l.pickup_end > $2 AND u.status = 'Approved'
     FOR UPDATE OF l`,
    [listingId, now],
  );
  return result.rows[0];
}

/** D-91: whether the consumer already holds a bag of this listing. */
export async function hasHeldReservation(
  client: PoolClient,
  listingId: string,
  consumerId: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM reservations WHERE listing_id = $1 AND consumer_id = $2 AND status = 'Held'`,
    [listingId, consumerId],
  );
  return (result.rowCount ?? 0) > 0;
}

/** FR-RES-07: one bag less; the listing is Fully reserved when none are left. */
export async function takeBag(client: PoolClient, listingId: string): Promise<void> {
  await client.query(
    `UPDATE listings SET bags_available = bags_available - 1,
       status = CASE WHEN bags_available - 1 = 0 THEN 'Fully reserved' ELSE status END
     WHERE id = $1`,
    [listingId],
  );
}

export async function insertHeldReservation(
  client: PoolClient,
  values: {
    listingId: string;
    consumerId: string;
    holdExpiresAt: Date;
    slotStart: Date;
    idempotencyKey: string | null;
    now: Date;
  },
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO reservations (listing_id, consumer_id, method, status, hold_expires_at, slot_start, idempotency_key, created_at)
     VALUES ($1, $2, 'no-card', 'Held', $3, $4, $5, $6) RETURNING id`,
    [
      values.listingId,
      values.consumerId,
      values.holdExpiresAt,
      values.slotStart,
      values.idempotencyKey,
      values.now,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('Reservation was not saved');
  return row.id;
}

/** FR-RES-10: saves the code unless another Active code is the same; returns whether it was saved. */
export async function insertPickupCode(
  client: PoolClient,
  reservationId: string,
  code: string,
): Promise<boolean> {
  const result = await client.query(
    `INSERT INTO pickup_codes (reservation_id, code) VALUES ($1, $2)
     ON CONFLICT (code) WHERE status = 'Active' DO NOTHING`,
    [reservationId, code],
  );
  return (result.rowCount ?? 0) > 0;
}

/** FR-RES-04: the check-in, only if it is still allowed when the row is written (E-RES-05). */
export async function saveCheckIn(id: string, holdExpiresAt: Date, now: Date): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE reservations SET hold_expires_at = $2, checked_in = true
     WHERE id = $1 AND status = 'Held' AND NOT checked_in AND hold_expires_at >= $3`,
    [id, holdExpiresAt, now],
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * FR-RES-05, FR-RES-13 (SDD 3.2.5.5): every Held reservation whose hold ended before `now` becomes No-show; its bag
 * goes back to the listing (no waitlist until US-29), its pickup code is void and one no-show is recorded. A row is
 * changed only while it is still Held, so running this twice (or from the worker and an API read at once) releases
 * each hold once. Returns how many were released.
 */
export async function releaseExpired(now: Date): Promise<string[]> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const expired = await client.query<{ id: string; listingId: string; consumerId: string; method: string }>(
      `UPDATE reservations SET status = 'No-show'
       WHERE id IN (SELECT id FROM reservations WHERE status = 'Held' AND hold_expires_at < $1
                    ORDER BY listing_id FOR UPDATE SKIP LOCKED)
       RETURNING id, listing_id AS "listingId", consumer_id AS "consumerId", method`,
      [now],
    );
    for (const row of expired.rows) {
      await client.query(
        `UPDATE listings SET bags_available = bags_available + 1,
           status = CASE WHEN status = 'Fully reserved' THEN 'Active' ELSE status END
         WHERE id = $1`,
        [row.listingId],
      );
      await client.query(
        `UPDATE pickup_codes SET status = 'Void' WHERE reservation_id = $1 AND status = 'Active'`,
        [row.id],
      );
      await client.query(
        `INSERT INTO no_shows (reservation_id, consumer_id, source, method, created_at)
         VALUES ($1, $2, 'hold expired', $3, $4) ON CONFLICT (reservation_id) DO NOTHING`,
        [row.id, row.consumerId, row.method, now],
      );
    }
    await client.query('COMMIT');
    // US-34 (D-121): the released reservations, so their consumers can be told.
    return expired.rows.map((row) => row.id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** FR-RES-13: the times of a consumer's no-card no-shows (the BR-07 block counts only those). */
export async function noCardNoShowTimes(consumerId: string): Promise<Date[]> {
  const result = await getPool().query<{ createdAt: Date }>(
    `SELECT created_at AS "createdAt" FROM no_shows WHERE consumer_id = $1 AND method = 'no-card'`,
    [consumerId],
  );
  return result.rows.map((row) => row.createdAt);
}

// US-27 card reservations (FR-RES-02, E-RES-01), decision D-99.

/** FR-RES-02: a card reservation waiting for the bank (its bag is already taken). */
export async function insertPendingCardReservation(
  client: PoolClient,
  values: { listingId: string; consumerId: string; price: number; idempotencyKey: string | null; now: Date },
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO reservations (listing_id, consumer_id, method, status, price_paid, idempotency_key, created_at)
     VALUES ($1, $2, 'card', 'Pending payment', $3, $4, $5) RETURNING id`,
    [values.listingId, values.consumerId, values.price, values.idempotencyKey, values.now],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('Reservation was not saved');
  return row.id;
}

/** FR-RES-02: the bank approved: Confirmed for the whole window, with the Approved payment (no card data, NFR-10). */
export async function confirmCardReservation(
  client: PoolClient,
  values: { id: string; reference: string; amount: number; now: Date },
): Promise<void> {
  await client.query(
    `UPDATE reservations SET status = 'Confirmed' WHERE id = $1 AND status = 'Pending payment'`,
    [values.id],
  );
  await client.query(
    `INSERT INTO payments (reservation_id, gateway_reference, amount, status, created_at)
     VALUES ($1, $2, $3, 'Approved', $4)`,
    [values.id, values.reference, values.amount, values.now],
  );
}

/** Gives the bag of a reservation back to its listing (a Fully reserved listing is Active again). */
async function giveBagBack(client: PoolClient, listingId: string): Promise<void> {
  await client.query(
    `UPDATE listings SET bags_available = bags_available + 1,
       status = CASE WHEN status = 'Fully reserved' THEN 'Active' ELSE status END
     WHERE id = $1`,
    [listingId],
  );
}

/** E-RES-01: the payment failed: no reservation is kept and the bag is available again. */
export async function dropPendingReservation(id: string): Promise<void> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const dropped = await client.query<{ listingId: string }>(
      `DELETE FROM reservations WHERE id = $1 AND status = 'Pending payment' RETURNING listing_id AS "listingId"`,
      [id],
    );
    for (const row of dropped.rows) await giveBagBack(client, row.listingId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * E-RES-01: card reservations still waiting for the bank since before `before` (for example after a crash during the
 * charge) are dropped and their bags given back. Run by the worker with the reservation releases (D-99).
 */
export async function dropStalePendingPayments(before: Date): Promise<number> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const dropped = await client.query<{ listingId: string }>(
      `DELETE FROM reservations
       WHERE id IN (SELECT id FROM reservations WHERE status = 'Pending payment' AND created_at < $1
                    FOR UPDATE SKIP LOCKED)
       RETURNING listing_id AS "listingId"`,
      [before],
    );
    for (const row of dropped.rows) await giveBagBack(client, row.listingId);
    await client.query('COMMIT');
    return dropped.rows.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// US-32 vendor reservations and US-33 pickup at the counter (FR-RES-09, FR-RES-10, E-RES-03), decision D-101.

/** A reservation as the vendor sees it: a number per listing, never the customer or the pickup code. */
export interface VendorReservationRecord {
  id: string;
  number: number;
  method: 'card' | 'no-card';
  status: string;
  slotStart: Date | null;
  holdExpiresAt: Date | null;
  checkedIn: boolean;
}

// The reservation number: its place among the listing's reservations in the order they were made (`seq`; a card
// payment still waiting for the bank is not counted, D-100).
const NUMBER = `(SELECT count(*) FROM reservations x
  WHERE x.listing_id = r.listing_id AND x.status <> 'Pending payment'
    AND x.seq <= r.seq)::int`;

/**
 * FR-RES-09: the listing's reservations: first those still to collect (Held, Confirmed) by when they can come (the
 * no-card slot, otherwise the pickup start), then the finished ones, the newest first.
 */
export async function listListingReservations(
  listingId: string,
  now: Date,
): Promise<VendorReservationRecord[]> {
  // D-102: a reservation still Held or Confirmed at the pickup end shows as "Not collected" (status kept until US-35).
  const waiting = `(r.status IN ('Held', 'Confirmed') AND l.pickup_end > $2)`;
  const result = await getPool().query<VendorReservationRecord>(
    `SELECT r.id, ${NUMBER} AS number, r.method,
            CASE WHEN r.status IN ('Held', 'Confirmed') AND l.pickup_end <= $2 THEN 'Not collected' ELSE r.status END
              AS status,
            r.slot_start AS "slotStart", r.hold_expires_at AS "holdExpiresAt", r.checked_in AS "checkedIn"
     FROM reservations r JOIN listings l ON l.id = r.listing_id
     WHERE r.listing_id = $1 AND r.status <> 'Pending payment'
     ORDER BY ${waiting} DESC,
              CASE WHEN ${waiting} THEN COALESCE(r.slot_start, l.pickup_start) END,
              CASE WHEN ${waiting} THEN r.seq END,
              r.seq DESC`,
    [listingId, now],
  );
  return result.rows;
}

export interface BagCounts {
  /** waiting + collected + notCollected: the bags customers took (a released hold gives its bag back). */
  taken: number;
  collected: number;
  /** Held or Confirmed before the pickup end. */
  waiting: number;
  /** Held or Confirmed at the pickup end (D-102). */
  notCollected: number;
}

export const NO_BAGS: BagCounts = { taken: 0, collected: 0, waiting: 0, notCollected: 0 };

/** FR-RES-09, D-102: the bag counts of each listing. */
export async function countListingReservations(
  listingIds: string[],
  now: Date,
): Promise<Map<string, BagCounts>> {
  const result = await getPool().query<{
    listingId: string;
    collected: number;
    waiting: number;
    notCollected: number;
  }>(
    `SELECT r.listing_id AS "listingId",
            count(*) FILTER (WHERE r.status = 'Completed')::int AS collected,
            count(*) FILTER (WHERE r.status IN ('Held', 'Confirmed') AND l.pickup_end > $2)::int AS waiting,
            count(*) FILTER (WHERE r.status IN ('Held', 'Confirmed') AND l.pickup_end <= $2)::int AS "notCollected"
     FROM reservations r JOIN listings l ON l.id = r.listing_id
     WHERE r.listing_id = ANY($1::uuid[]) GROUP BY r.listing_id`,
    [listingIds, now],
  );
  return new Map(
    result.rows.map((row) => [
      row.listingId,
      {
        taken: row.waiting + row.collected + row.notCollected,
        collected: row.collected,
        waiting: row.waiting,
        notCollected: row.notCollected,
      },
    ]),
  );
}

export interface CodeMatch {
  reservationId: string;
  number: number;
  method: 'card' | 'no-card';
  status: string;
  codeStatus: 'Active' | 'Used' | 'Void';
  slotStart: Date | null;
  pickupStart: Date;
  pickupEnd: Date;
}

/** FR-RES-10: the reservation of this listing whose pickup code is `code` (an Active one first), or undefined. */
export async function findCodeOnListing(listingId: string, code: string): Promise<CodeMatch | undefined> {
  const result = await getPool().query<CodeMatch>(
    `SELECT r.id AS "reservationId", ${NUMBER} AS number, r.method, r.status, pc.status AS "codeStatus",
            r.slot_start AS "slotStart", l.pickup_start AS "pickupStart", l.pickup_end AS "pickupEnd"
     FROM pickup_codes pc
     JOIN reservations r ON r.id = pc.reservation_id
     JOIN listings l ON l.id = r.listing_id
     WHERE r.listing_id = $1 AND pc.code = $2
     ORDER BY (pc.status = 'Active') DESC, pc.used_at DESC NULLS LAST
     LIMIT 1`,
    [listingId, code],
  );
  return result.rows[0];
}

/** FR-RES-10: the bag is handed over: the reservation is Completed and its code Used, once. */
export async function completePickup(reservationId: string, now: Date): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const done = await client.query(
      `UPDATE reservations SET status = 'Completed' WHERE id = $1 AND status IN ('Held', 'Confirmed')`,
      [reservationId],
    );
    if ((done.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      `UPDATE pickup_codes SET status = 'Used', used_at = $2 WHERE reservation_id = $1 AND status = 'Active'`,
      [reservationId, now],
    );
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
