// C-27 Data Access: Zakat donations and their receipts (US-43, SDD 4.2 ZakatDonation), decisions D-113 to D-116.
// Taking the bags locks the consumer listing (SELECT ... FOR UPDATE), like a reservation (FR-RES-07, E-RES-02).
import type { PoolClient } from 'pg';
import { getPool, withTransaction } from './db.js';

export interface CharityChoice {
  id: string;
  name: string;
  distanceMeters: number;
}

/** FR-TGI-05: Approved charities that accept the listing's food type, within the partner distance, nearest first. */
export async function findCharitiesFor(
  listingId: string,
  radiusMeters: number | null,
): Promise<CharityChoice[]> {
  const result = await getPool().query<CharityChoice>(
    `SELECT p.user_id AS id, p.organisation_name AS name, ST_Distance(p.location, l.location) AS "distanceMeters"
     FROM listings l
     JOIN partner_profiles p ON p.partner_type = 'charity' AND l.food_category = ANY (p.accepted_food_types)
     JOIN users u ON u.id = p.user_id AND u.status = 'Approved'
     WHERE l.id = $1 AND ($2::float8 IS NULL OR ST_DWithin(p.location, l.location, $2::float8))
     ORDER BY "distanceMeters"`,
    [listingId, radiusMeters],
  );
  return result.rows;
}

/** A consumer listing a Zakat donation can be made from now (Active, consumer bags, window not ended). */
export async function isZakatOffer(listingId: string, now: Date): Promise<boolean> {
  const result = await getPool().query(
    `SELECT 1 FROM listings WHERE id = $1 AND listing_type = 'Discounted Surplus Bag'
       AND status IN ('Active', 'Fully reserved') AND pickup_end > $2`,
    [listingId, now],
  );
  return (result.rowCount ?? 0) > 0;
}

export type TakeOutcome =
  | { kind: 'taken'; zakatId: string; amount: number }
  | { kind: 'notFound' }
  | { kind: 'notEnoughBags'; bagsAvailable: number };

/**
 * FR-TGI-05: under the listing lock, take `bags` bags, write them as a hidden Donation listing reserved for the charity
 * (D-113) and a Pending payment donation. The payment comes after; see confirmZakat and undoZakat.
 */
export async function takeBagsForZakat(input: {
  listingId: string;
  consumerId: string;
  charityId: string;
  bags: number;
  now: Date;
}): Promise<TakeOutcome> {
  return withTransaction(async (client: PoolClient) => {
    const locked = await client.query<{ bagsAvailable: number; price: number }>(
      `SELECT bags_available AS "bagsAvailable", price::float8 AS price FROM listings
       WHERE id = $1 AND listing_type = 'Discounted Surplus Bag' AND status IN ('Active', 'Fully reserved')
         AND pickup_end > $2 FOR UPDATE`,
      [input.listingId, input.now],
    );
    const listing = locked.rows[0];
    if (listing === undefined) return { kind: 'notFound' };
    if (listing.bagsAvailable < input.bags)
      return { kind: 'notEnoughBags', bagsAvailable: listing.bagsAvailable };
    await client.query(
      `UPDATE listings SET bags_available = bags_available - $2,
         status = CASE WHEN bags_available - $2 = 0 THEN 'Fully reserved' ELSE status END
       WHERE id = $1`,
      [input.listingId, input.bags],
    );
    const donation = await client.query<{ id: string }>(
      `INSERT INTO listings (vendor_id, listing_type, status, is_quick_post, food_type, food_category, photo_key,
         description_ar, description_en, calorie_min, calorie_max, bags_total, bags_available, original_value, price,
         pickup_start, pickup_end, prep_time, storage, expiry_at, perishability_category, unfit_for_people, location,
         name_ar, name_en, source_language, branch_id, reserved_for_partner_id)
       SELECT vendor_id, 'Donation', 'Draft', is_quick_post, food_type, food_category, photo_key,
         description_ar, description_en, calorie_min, calorie_max, $2, $2, original_value, price,
         pickup_start, pickup_end, prep_time, storage, expiry_at, perishability_category, unfit_for_people, location,
         name_ar, name_en, source_language, branch_id, $3
       FROM listings WHERE id = $1
       RETURNING id`,
      [input.listingId, input.bags, input.charityId],
    );
    const amount = Math.round(listing.price * input.bags * 100) / 100;
    const zakat = await client.query<{ id: string }>(
      `INSERT INTO zakat_donations (consumer_id, listing_id, donation_listing_id, charity_id, bags, amount, status,
         created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'Pending payment', $7) RETURNING id`,
      [
        input.consumerId,
        input.listingId,
        donation.rows[0]?.id,
        input.charityId,
        input.bags,
        amount,
        input.now,
      ],
    );
    return { kind: 'taken', zakatId: zakat.rows[0]?.id ?? '', amount };
  });
}

/** Approved: the donation is Paid with its receipt number, and the Donation listing is offered to the charity. */
export async function confirmZakat(id: string, reference: string, now: Date): Promise<void> {
  await withTransaction(async (client) => {
    const updated = await client.query<{ donationListingId: string }>(
      `UPDATE zakat_donations SET status = 'Paid', gateway_reference = $2,
         receipt_number = 'ZK-' || to_char($3::timestamptz AT TIME ZONE 'UTC', 'YYYY') || '-'
                          || lpad(nextval('zakat_receipt_seq')::text, 6, '0')
       WHERE id = $1 AND status = 'Pending payment' RETURNING donation_listing_id AS "donationListingId"`,
      [id, reference, now],
    );
    const listingId = updated.rows[0]?.donationListingId;
    if (listingId !== undefined) {
      await client.query(`UPDATE listings SET status = 'Active' WHERE id = $1`, [listingId]);
    }
  });
}

/** E-TGI-02: the payment failed: the bags go back to the consumer listing and nothing is kept. */
export async function undoZakat(id: string, now: Date): Promise<void> {
  await withTransaction(async (client) => {
    const found = await client.query<{ listingId: string; donationListingId: string; bags: number }>(
      `DELETE FROM zakat_donations WHERE id = $1 AND status = 'Pending payment'
       RETURNING listing_id AS "listingId", donation_listing_id AS "donationListingId", bags`,
      [id],
    );
    const row = found.rows[0];
    if (row === undefined) return;
    await client.query('DELETE FROM listings WHERE id = $1', [row.donationListingId]);
    await client.query(
      `UPDATE listings SET bags_available = bags_available + $2,
         status = CASE WHEN status = 'Fully reserved' AND pickup_end > $3 THEN 'Active' ELSE status END
       WHERE id = $1`,
      [row.listingId, row.bags, now],
    );
  });
}

export interface ReceiptRecord {
  id: string;
  consumerId: string;
  charityId: string;
  receiptNumber: string;
  status: 'Paid' | 'Delivered' | 'Refunded';
  shopName: string;
  nameAr: string | null;
  nameEn: string | null;
  foodType: string | null;
  bags: number;
  amount: number;
  charityName: string;
  createdAt: Date;
  deliveredAt: Date | null;
  refundedAt: Date | null;
}

const RECEIPT = `z.id, z.consumer_id AS "consumerId", z.charity_id AS "charityId", z.receipt_number AS "receiptNumber",
  z.status, v.shop_name AS "shopName", l.name_ar AS "nameAr", l.name_en AS "nameEn", l.food_type AS "foodType",
  z.bags, z.amount::float8 AS amount, p.organisation_name AS "charityName", z.created_at AS "createdAt",
  z.delivered_at AS "deliveredAt", z.refunded_at AS "refundedAt"
  FROM zakat_donations z
  JOIN listings l ON l.id = z.listing_id
  JOIN vendor_profiles v ON v.user_id = l.vendor_id
  JOIN partner_profiles p ON p.user_id = z.charity_id`;

/** A paid, delivered or refunded receipt (never a Pending payment one). */
export async function findReceipt(id: string): Promise<ReceiptRecord | undefined> {
  const result = await getPool().query<ReceiptRecord>(
    `SELECT ${RECEIPT} WHERE z.id = $1 AND z.status <> 'Pending payment'`,
    [id],
  );
  return result.rows[0];
}

export async function listReceipts(consumerId: string): Promise<ReceiptRecord[]> {
  const result = await getPool().query<ReceiptRecord>(
    `SELECT ${RECEIPT} WHERE z.consumer_id = $1 AND z.status <> 'Pending payment' ORDER BY z.created_at DESC, z.id`,
    [consumerId],
  );
  return result.rows;
}

/** E-TGI-03: Paid donations whose Donation pickup window has ended without collection. */
export async function findUncollectedZakat(
  now: Date,
): Promise<{ id: string; reference: string; amount: number }[]> {
  const result = await getPool().query<{ id: string; reference: string; amount: number }>(
    `SELECT z.id, z.gateway_reference AS reference, z.amount::float8 AS amount
     FROM zakat_donations z JOIN listings d ON d.id = z.donation_listing_id
     WHERE z.status = 'Paid' AND d.pickup_end <= $1`,
    [now],
  );
  return result.rows;
}

/** BR-11: the full amount went back to the consumer; the receipt says Refunded. Once only. */
export async function markZakatRefunded(id: string, now: Date): Promise<boolean> {
  const result = await getPool().query(
    `UPDATE zakat_donations SET status = 'Refunded', refunded_at = $2 WHERE id = $1 AND status = 'Paid'`,
    [id, now],
  );
  return (result.rowCount ?? 0) > 0;
}
