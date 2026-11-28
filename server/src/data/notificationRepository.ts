// C-27 Data Access: notifications kept for the app (US-34, FR-RES-11, IF-SW-06, decision D-121).
import { getPool } from './db.js';

export type NotificationKind =
  'reservation_confirmed' | 'reservation_released' | 'waitlist_offer' | 'window_open';

export interface NotificationRecord {
  id: string;
  kind: NotificationKind;
  data: Record<string, string>;
  createdAt: Date;
  readAt: Date | null;
}

export async function insertNotification(
  userId: string,
  kind: NotificationKind,
  data: Record<string, string>,
  now: Date,
): Promise<void> {
  await getPool().query(
    'INSERT INTO notifications (user_id, kind, data, created_at) VALUES ($1, $2, $3, $4)',
    [userId, kind, JSON.stringify(data), now],
  );
}

/** The user's latest notifications, newest first. */
export async function listNotifications(userId: string, limit: number): Promise<NotificationRecord[]> {
  const result = await getPool().query<NotificationRecord>(
    `SELECT id, kind, data, created_at AS "createdAt", read_at AS "readAt" FROM notifications
     WHERE user_id = $1 ORDER BY created_at DESC, id LIMIT $2`,
    [userId, limit],
  );
  return result.rows;
}

export async function countUnread(userId: string): Promise<number> {
  const result = await getPool().query<{ n: number }>(
    'SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL',
    [userId],
  );
  return result.rows[0]?.n ?? 0;
}

export async function markAllRead(userId: string, now: Date): Promise<void> {
  await getPool().query('UPDATE notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL', [
    userId,
    now,
  ]);
}

export interface ListingFacts {
  listingId: string;
  shopName: string;
  nameAr: string | null;
  nameEn: string | null;
}

const FACTS = `l.id AS "listingId", v.shop_name AS "shopName", l.name_ar AS "nameAr", l.name_en AS "nameEn"`;

/** The consumer and listing of a reservation, for its notification. */
export async function findReservationFacts(
  reservationId: string,
): Promise<(ListingFacts & { consumerId: string }) | undefined> {
  const result = await getPool().query<ListingFacts & { consumerId: string }>(
    `SELECT r.consumer_id AS "consumerId", ${FACTS}
     FROM reservations r JOIN listings l ON l.id = r.listing_id JOIN vendor_profiles v ON v.user_id = l.vendor_id
     WHERE r.id = $1`,
    [reservationId],
  );
  return result.rows[0];
}

export async function findListingFacts(listingId: string): Promise<ListingFacts | undefined> {
  const result = await getPool().query<ListingFacts>(
    `SELECT ${FACTS} FROM listings l JOIN vendor_profiles v ON v.user_id = l.vendor_id WHERE l.id = $1`,
    [listingId],
  );
  return result.rows[0];
}

/**
 * FR-RES-11 "bag ready": Held or Confirmed reservations whose pickup (the no-card slot, or the pickup start for a card)
 * has started and not ended, not yet told. Each is marked at once so it is told once (SDD 5.5: idempotent jobs).
 */
export async function takeWindowOpenDue(now: Date): Promise<string[]> {
  const result = await getPool().query<{ id: string }>(
    `UPDATE reservations r SET window_notified_at = $1
     FROM listings l
     WHERE l.id = r.listing_id AND r.status IN ('Held', 'Confirmed') AND r.window_notified_at IS NULL
       AND COALESCE(r.slot_start, l.pickup_start) <= $1 AND l.pickup_end > $1
     RETURNING r.id`,
    [now],
  );
  return result.rows.map((row) => row.id);
}
