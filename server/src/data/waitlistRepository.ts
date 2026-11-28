// C-27 Data Access: the waitlist (US-29, SDD 4.2 WaitlistEntry, 5.3) and cancelling a reservation (US-35, FR-RES-12).
// Every change to a listing's bags locks the listing row (SELECT ... FOR UPDATE), like reserving (FR-RES-07).
import type { PoolClient } from 'pg';
import { getPool, withTransaction } from './db.js';

export type WaitlistStatus = 'Waiting' | 'Offered' | 'Accepted' | 'Expired' | 'Declined' | 'Left';

export interface WaitlistEntryRecord {
  id: string;
  listingId: string;
  status: WaitlistStatus;
  /** 1 for the first person still waiting; null when not Waiting. */
  position: number | null;
  offerExpiresAt: Date | null;
  createdAt: Date;
  listing: {
    nameAr: string | null;
    nameEn: string | null;
    sourceLanguage: 'ar' | 'en' | null;
    price: number;
    pickupStart: Date;
    pickupEnd: Date;
    shopName: string;
  };
}

type Row = Omit<WaitlistEntryRecord, 'listing'> & WaitlistEntryRecord['listing'];

const ENTRY = `w.id, w.listing_id AS "listingId", w.status, w.offer_expires_at AS "offerExpiresAt",
  w.created_at AS "createdAt",
  CASE WHEN w.status = 'Waiting' THEN
    (SELECT count(*)::int FROM waitlist_entries o
     WHERE o.listing_id = w.listing_id AND o.status = 'Waiting' AND o.seq <= w.seq)
  END AS position,
  l.name_ar AS "nameAr", l.name_en AS "nameEn", l.source_language AS "sourceLanguage", l.price::float8 AS price,
  l.pickup_start AS "pickupStart", l.pickup_end AS "pickupEnd", v.shop_name AS "shopName"
  FROM waitlist_entries w
  JOIN listings l ON l.id = w.listing_id
  JOIN vendor_profiles v ON v.user_id = l.vendor_id`;

function toRecord(row: Row): WaitlistEntryRecord {
  const { nameAr, nameEn, sourceLanguage, price, pickupStart, pickupEnd, shopName, ...rest } = row;
  return { ...rest, listing: { nameAr, nameEn, sourceLanguage, price, pickupStart, pickupEnd, shopName } };
}

export async function findEntry(id: string, consumerId: string): Promise<WaitlistEntryRecord | undefined> {
  const result = await getPool().query<Row>(`SELECT ${ENTRY} WHERE w.id = $1 AND w.consumer_id = $2`, [
    id,
    consumerId,
  ]);
  const row = result.rows[0];
  return row === undefined ? undefined : toRecord(row);
}

/** The consumer's places on waitlists whose pickup has not ended (newest first); accepted ones are not shown. */
export async function listEntries(consumerId: string, now: Date): Promise<WaitlistEntryRecord[]> {
  const result = await getPool().query<Row>(
    `SELECT ${ENTRY} WHERE w.consumer_id = $1 AND w.status IN ('Waiting', 'Offered', 'Expired', 'Declined')
       AND l.pickup_end > $2 ORDER BY w.created_at DESC, w.seq DESC`,
    [consumerId, now],
  );
  return result.rows.map(toRecord);
}

export type JoinOutcome =
  | { kind: 'joined'; id: string }
  | { kind: 'notFound' }
  | { kind: 'bagsAvailable' }
  | { kind: 'alreadyWaiting' };

/** FR-RES-06: a consumer joins when every bag of a consumer offer is reserved. */
export async function joinWaitlist(listingId: string, consumerId: string, now: Date): Promise<JoinOutcome> {
  return withTransaction(async (client) => {
    const offer = await client.query<{ bags: number }>(
      `SELECT l.bags_available AS bags FROM listings l JOIN users u ON u.id = l.vendor_id
       WHERE l.id = $1 AND l.status IN ('Active', 'Fully reserved') AND l.listing_type = 'Discounted Surplus Bag'
         AND NOT l.unfit_for_people AND l.pickup_end > $2 AND u.status = 'Approved'
       FOR UPDATE OF l`,
      [listingId, now],
    );
    const bags = offer.rows[0]?.bags;
    if (bags === undefined) return { kind: 'notFound' };
    if (bags > 0) return { kind: 'bagsAvailable' };
    const active = await client.query(
      `SELECT 1 FROM waitlist_entries WHERE listing_id = $1 AND consumer_id = $2 AND status IN ('Waiting', 'Offered')`,
      [listingId, consumerId],
    );
    if ((active.rowCount ?? 0) > 0) return { kind: 'alreadyWaiting' };
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO waitlist_entries (listing_id, consumer_id, status, created_at) VALUES ($1, $2, 'Waiting', $3)
       RETURNING id`,
      [listingId, consumerId, now],
    );
    return { kind: 'joined', id: inserted.rows[0]?.id ?? '' };
  });
}

/** D-119: a consumer leaves while Waiting. Returns the status it had, or undefined when it is not theirs. */
export async function leaveWaitlist(id: string, consumerId: string): Promise<string | undefined> {
  return withTransaction(async (client) => {
    const found = await client.query<{ status: string }>(
      'SELECT status FROM waitlist_entries WHERE id = $1 AND consumer_id = $2 FOR UPDATE',
      [id, consumerId],
    );
    const status = found.rows[0]?.status;
    if (status === 'Waiting') {
      await client.query(`UPDATE waitlist_entries SET status = 'Left' WHERE id = $1`, [id]);
    }
    return status;
  });
}

/** A set-aside bag goes back to the listing (the offer ended without a reservation). */
async function giveBagBack(client: PoolClient, listingId: string): Promise<void> {
  await client.query(
    `UPDATE listings SET bags_available = bags_available + 1,
       status = CASE WHEN status = 'Fully reserved' THEN 'Active' ELSE status END
     WHERE id = $1`,
    [listingId],
  );
}

/** D-119: the consumer declines an offer: its bag goes back to the listing. Returns the status it had. */
export async function declineOffer(id: string, consumerId: string): Promise<string | undefined> {
  return withTransaction(async (client) => {
    const found = await client.query<{ status: string; listingId: string }>(
      `SELECT status, listing_id AS "listingId" FROM waitlist_entries WHERE id = $1 AND consumer_id = $2 FOR UPDATE`,
      [id, consumerId],
    );
    const entry = found.rows[0];
    if (entry?.status === 'Offered') {
      await client.query(`SELECT 1 FROM listings WHERE id = $1 FOR UPDATE`, [entry.listingId]);
      await client.query(`UPDATE waitlist_entries SET status = 'Declined' WHERE id = $1`, [id]);
      await giveBagBack(client, entry.listingId);
    }
    return entry?.status;
  });
}

/** SDD 5.3 expireOffer, run by the worker (BR-05): offers not accepted in time end; their bags go back. */
export async function expireOffers(now: Date): Promise<number> {
  return withTransaction(async (client) => {
    const expired = await client.query<{ listingId: string }>(
      `UPDATE waitlist_entries SET status = 'Expired'
       WHERE id IN (SELECT id FROM waitlist_entries WHERE status = 'Offered' AND offer_expires_at <= $1
                    FOR UPDATE SKIP LOCKED)
       RETURNING listing_id AS "listingId"`,
      [now],
    );
    for (const row of expired.rows) await giveBagBack(client, row.listingId);
    return expired.rows.length;
  });
}

/**
 * SDD 5.3 offerNext (FR-RES-05, FR-RES-06): every consumer offer with free bags and people waiting, whose pickup has
 * at least `minMinutes` left (BR-04), sets a bag aside for the first person waiting for `acceptMinutes` (BR-05).
 * Returns the offers made, so the people can be told (D-118).
 */
export interface OfferMade {
  entryId: string;
  consumerId: string;
  listingId: string;
  offerExpiresAt: Date;
}

export async function offerFreeBags(
  now: Date,
  minMinutes: number,
  acceptMinutes: number,
): Promise<OfferMade[]> {
  const candidates = await getPool().query<{ id: string }>(
    `SELECT DISTINCT l.id FROM listings l JOIN waitlist_entries w ON w.listing_id = l.id AND w.status = 'Waiting'
     WHERE l.listing_type = 'Discounted Surplus Bag' AND l.status IN ('Active', 'Fully reserved')
       AND l.bags_available > 0 AND l.pickup_end >= $1::timestamptz + make_interval(mins => $2)`,
    [now, minMinutes],
  );
  const made: OfferMade[] = [];
  for (const { id } of candidates.rows) {
    const offers = await withTransaction(async (client) => {
      const locked = await client.query<{ bags: number }>(
        `SELECT bags_available AS bags FROM listings WHERE id = $1 AND status IN ('Active', 'Fully reserved')
           AND pickup_end >= $2::timestamptz + make_interval(mins => $3) FOR UPDATE`,
        [id, now, minMinutes],
      );
      let bags = locked.rows[0]?.bags ?? 0;
      const here: OfferMade[] = [];
      while (bags > 0) {
        const next = await client.query<{ entryId: string; consumerId: string; offerExpiresAt: Date }>(
          `UPDATE waitlist_entries SET status = 'Offered',
             offer_expires_at = $2::timestamptz + make_interval(mins => $3)
           WHERE id = (SELECT id FROM waitlist_entries WHERE listing_id = $1 AND status = 'Waiting'
                       ORDER BY seq LIMIT 1 FOR UPDATE SKIP LOCKED)
           RETURNING id AS "entryId", consumer_id AS "consumerId", offer_expires_at AS "offerExpiresAt"`,
          [id, now, acceptMinutes],
        );
        const offer = next.rows[0];
        if (offer === undefined) break;
        await client.query(
          `UPDATE listings SET bags_available = bags_available - 1,
             status = CASE WHEN bags_available - 1 = 0 THEN 'Fully reserved' ELSE status END
           WHERE id = $1`,
          [id],
        );
        bags -= 1;
        here.push({ ...offer, listingId: id });
      }
      return here;
    });
    made.push(...offers);
  }
  return made;
}

export type ClaimOutcome = 'claimed' | 'expired' | 'notFound';

/**
 * FR-RES-06 accept, inside the reservation transaction (the listing row is already locked): the consumer's Offered
 * entry for this listing becomes Accepted and its set-aside bag is made available again, so the normal reservation
 * takes it at once.
 */
export async function claimOffer(
  client: PoolClient,
  entryId: string,
  consumerId: string,
  listingId: string,
  now: Date,
): Promise<ClaimOutcome> {
  const found = await client.query<{ status: string; offerExpiresAt: Date | null }>(
    `SELECT status, offer_expires_at AS "offerExpiresAt" FROM waitlist_entries
     WHERE id = $1 AND consumer_id = $2 AND listing_id = $3 FOR UPDATE`,
    [entryId, consumerId, listingId],
  );
  const entry = found.rows[0];
  if (entry === undefined) return 'notFound';
  if (entry.status !== 'Offered' || entry.offerExpiresAt === null || entry.offerExpiresAt <= now)
    return 'expired';
  await client.query(`UPDATE waitlist_entries SET status = 'Accepted' WHERE id = $1`, [entryId]);
  await giveBagBack(client, listingId);
  return 'claimed';
}

export interface CancelFacts {
  status: string;
  method: 'card' | 'no-card';
  createdAt: Date;
  slotStart: Date | null;
  pickupEnd: Date;
  listingId: string;
  paymentReference: string | null;
  paymentAmount: number | null;
}

/** FR-RES-12: what decides a cancellation: status, method, when it was made, its slot, and the card payment. */
export async function findCancelFacts(id: string, consumerId: string): Promise<CancelFacts | undefined> {
  const result = await getPool().query<CancelFacts>(
    `SELECT r.status, r.method, r.created_at AS "createdAt", r.slot_start AS "slotStart",
            l.pickup_end AS "pickupEnd", r.listing_id AS "listingId",
            p.gateway_reference AS "paymentReference", p.amount::float8 AS "paymentAmount"
     FROM reservations r JOIN listings l ON l.id = r.listing_id
     LEFT JOIN payments p ON p.reservation_id = r.id AND p.status = 'Approved'
     WHERE r.id = $1 AND r.consumer_id = $2 AND r.status <> 'Pending payment'`,
    [id, consumerId],
  );
  return result.rows[0];
}

/**
 * FR-RES-12, FR-RES-13: the reservation is Cancelled (only from Held or Confirmed), its code Void and its bag back on
 * the listing; the payment is marked Refunded when it was refunded; a no-show is recorded when asked. Returns false
 * when it was no longer Held or Confirmed.
 */
export async function cancelReservation(input: {
  id: string;
  listingId: string;
  consumerId: string;
  method: 'card' | 'no-card';
  refunded: boolean;
  noShow: boolean;
  now: Date;
}): Promise<boolean> {
  return withTransaction(async (client) => {
    await client.query('SELECT 1 FROM listings WHERE id = $1 FOR UPDATE', [input.listingId]);
    const done = await client.query(
      `UPDATE reservations SET status = 'Cancelled', cancelled_at = $2 WHERE id = $1 AND status IN ('Held', 'Confirmed')`,
      [input.id, input.now],
    );
    if ((done.rowCount ?? 0) === 0) return false;
    await client.query(
      `UPDATE pickup_codes SET status = 'Void' WHERE reservation_id = $1 AND status = 'Active'`,
      [input.id],
    );
    await giveBagBack(client, input.listingId);
    if (input.refunded) {
      await client.query(
        `UPDATE payments SET status = 'Refunded', refunded_at = $2 WHERE reservation_id = $1 AND status = 'Approved'`,
        [input.id, input.now],
      );
    }
    if (input.noShow) {
      await client.query(
        `INSERT INTO no_shows (reservation_id, consumer_id, source, method, created_at)
         VALUES ($1, $2, 'cancelled after start', $3, $4) ON CONFLICT (reservation_id) DO NOTHING`,
        [input.id, input.consumerId, input.method, input.now],
      );
    }
    return true;
  });
}
