// C-27 Data Access: Donation offers for charity partners and Compost offers for composting partners, and their
// accepted pickups (US-22, US-24, SDD 4.2 PartnerOffer).
// Accepting locks the listing row (SELECT ... FOR UPDATE) and the partial unique index partner_offers_one_taker keeps a
// second Accepted row out, so the first charity wins (E-RTE-04).
import type { PoolClient } from 'pg';
import { getPool } from './db.js';

export interface DonationOffer {
  listingId: string;
  /** D-111: Donation (charity partners) or Compost offer (composting partners). */
  listingType: 'Donation' | 'Compost offer';
  shopName: string;
  address: string;
  nameAr: string | null;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  sourceLanguage: 'ar' | 'en' | null;
  foodCategory: string | null;
  bags: number;
  pickupStart: Date;
  pickupEnd: Date;
  distanceMeters: number;
  latitude: number;
  longitude: number;
}

export interface PartnerPickupRecord {
  id: string;
  listingId: string;
  partnerId: string;
  organisationName: string;
  status: 'Accepted' | 'Completed' | 'Cancelled';
  listingType: 'Donation' | 'Compost offer';
  pickupTime: Date;
  /** The code while it is Active, otherwise null. */
  pickupCode: string | null;
  shopName: string;
  address: string;
  nameAr: string | null;
  nameEn: string | null;
  sourceLanguage: 'ar' | 'en' | null;
  foodCategory: string | null;
  bags: number;
  pickupStart: Date;
  pickupEnd: Date;
  latitude: number;
  longitude: number;
}

const LISTING = `l.listing_type AS "listingType", v.shop_name AS "shopName", COALESCE(b.address, v.address) AS address,
  l.name_ar AS "nameAr", l.name_en AS "nameEn", l.source_language AS "sourceLanguage",
  l.food_category::text AS "foodCategory", l.bags_total AS bags,
  l.pickup_start AS "pickupStart", l.pickup_end AS "pickupEnd",
  ST_Y(l.location::geometry) AS latitude, ST_X(l.location::geometry) AS longitude`;

const LISTING_JOINS = `JOIN vendor_profiles v ON v.user_id = l.vendor_id
  LEFT JOIN vendor_branches b ON b.id = l.branch_id`;

/**
 * Which listings a partner may take (D-111): Donations for charities, Compost offers for composting partners; food type
 * it accepts, within the partner distance, window not ended.
 */
const ELIGIBLE = `l.pickup_end > $2
  AND ((l.listing_type = 'Donation' AND p.partner_type = 'charity')
       OR (l.listing_type = 'Compost offer' AND p.partner_type = 'composting'))
  AND l.food_category = ANY (p.accepted_food_types)
  AND (l.reserved_for_partner_id IS NULL OR l.reserved_for_partner_id = $1)
  AND ($3::float8 IS NULL OR ST_DWithin(p.location, l.location, $3::float8))`;

/** The partner type of an Approved or other partner, or undefined when the user has no partner profile. */
export async function findPartnerType(userId: string): Promise<string | undefined> {
  const result = await getPool().query<{ partnerType: string }>(
    'SELECT partner_type AS "partnerType" FROM partner_profiles WHERE user_id = $1',
    [userId],
  );
  return result.rows[0]?.partnerType;
}

/** FR-RTE-10: the Active Donation listings this charity can take that nobody has taken yet, nearest first. */
export async function listOpenDonations(
  partnerId: string,
  now: Date,
  radiusMeters: number | null,
): Promise<DonationOffer[]> {
  const result = await getPool().query<DonationOffer>(
    `SELECT l.id AS "listingId", ${LISTING}, l.description_ar AS "descriptionAr", l.description_en AS "descriptionEn",
            ST_Distance(p.location, l.location) AS "distanceMeters"
     FROM listings l ${LISTING_JOINS}
     JOIN partner_profiles p ON p.user_id = $1
     WHERE ${ELIGIBLE} AND l.status = 'Active'
       AND NOT EXISTS (SELECT 1 FROM partner_offers o
                       WHERE o.listing_id = l.id AND o.status IN ('Accepted', 'Completed'))
     ORDER BY "distanceMeters", l.pickup_end`,
    [partnerId, now, radiusMeters],
  );
  return result.rows;
}

/** One Donation listing this charity may take (taken or not), or undefined. */
export async function findEligibleDonation(
  partnerId: string,
  listingId: string,
  now: Date,
  radiusMeters: number | null,
): Promise<DonationOffer | undefined> {
  const result = await getPool().query<DonationOffer>(
    `SELECT l.id AS "listingId", ${LISTING}, l.description_ar AS "descriptionAr", l.description_en AS "descriptionEn",
            ST_Distance(p.location, l.location) AS "distanceMeters"
     FROM listings l ${LISTING_JOINS}
     JOIN partner_profiles p ON p.user_id = $1
     WHERE ${ELIGIBLE} AND l.status IN ('Active', 'Fully reserved') AND l.id = $4`,
    [partnerId, now, radiusMeters, listingId],
  );
  return result.rows[0];
}

export type AcceptOutcome = { kind: 'accepted'; offerId: string } | { kind: 'taken' };

/**
 * FR-RTE-10, E-RTE-04: in one transaction, lock the listing, refuse it when another charity has it, write the
 * Accepted offer and its pickup code, and mark the listing Fully reserved. `newCode` gives a fresh code to try.
 */
export async function acceptDonation(
  listingId: string,
  partnerId: string,
  pickupTime: Date,
  newCode: () => string,
): Promise<AcceptOutcome> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const listing = await client.query<{ status: string }>(
      'SELECT status FROM listings WHERE id = $1 FOR UPDATE',
      [listingId],
    );
    const taken = await client.query(
      `SELECT 1 FROM partner_offers WHERE listing_id = $1 AND status IN ('Accepted', 'Completed')`,
      [listingId],
    );
    if (listing.rows[0]?.status !== 'Active' || (taken.rowCount ?? 0) > 0) {
      await client.query('ROLLBACK');
      return { kind: 'taken' };
    }
    const offer = await client.query<{ id: string }>(
      `INSERT INTO partner_offers (listing_id, partner_id, status, pickup_time, is_automatic)
       SELECT $1, $2, 'Accepted', $3, auto_from_listing_id IS NOT NULL FROM listings WHERE id = $1
       RETURNING id`,
      [listingId, partnerId, pickupTime],
    );
    const offerId = offer.rows[0]?.id ?? '';
    await insertOfferCode(client, offerId, newCode);
    await client.query(`UPDATE listings SET status = 'Fully reserved' WHERE id = $1`, [listingId]);
    await client.query('COMMIT');
    return { kind: 'accepted', offerId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** A code no Active code already has (BR-09 digits come with `newCode`). */
async function insertOfferCode(client: PoolClient, offerId: string, newCode: () => string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await client.query(
      `INSERT INTO pickup_codes (partner_offer_id, code) VALUES ($1, $2)
       ON CONFLICT (code) WHERE status = 'Active' DO NOTHING`,
      [offerId, newCode()],
    );
    if ((result.rowCount ?? 0) > 0) return;
  }
  throw new Error('Could not make a unique pickup code');
}

const PICKUP = `o.id, o.listing_id AS "listingId", o.partner_id AS "partnerId",
  pp.organisation_name AS "organisationName", o.status, o.pickup_time AS "pickupTime",
  pc.code AS "pickupCode", ${LISTING}`;

const PICKUP_FROM = `FROM partner_offers o
  JOIN listings l ON l.id = o.listing_id ${LISTING_JOINS}
  JOIN partner_profiles pp ON pp.user_id = o.partner_id
  LEFT JOIN pickup_codes pc ON pc.partner_offer_id = o.id AND pc.status = 'Active'`;

export async function findPartnerPickup(
  partnerId: string,
  offerId: string,
): Promise<PartnerPickupRecord | undefined> {
  const result = await getPool().query<PartnerPickupRecord>(
    `SELECT ${PICKUP} ${PICKUP_FROM} WHERE o.id = $1 AND o.partner_id = $2`,
    [offerId, partnerId],
  );
  return result.rows[0];
}

/** The charity's pickups, the newest first. */
export async function listPartnerPickups(partnerId: string): Promise<PartnerPickupRecord[]> {
  const result = await getPool().query<PartnerPickupRecord>(
    `SELECT ${PICKUP} ${PICKUP_FROM} WHERE o.partner_id = $1 ORDER BY o.created_at DESC`,
    [partnerId],
  );
  return result.rows;
}

/** The vendor's view: the Accepted or Completed pickup of a listing, or undefined. */
export async function findListingPartnerPickup(listingId: string): Promise<PartnerPickupRecord | undefined> {
  const result = await getPool().query<PartnerPickupRecord>(
    `SELECT ${PICKUP} ${PICKUP_FROM}
     WHERE o.listing_id = $1 AND o.status IN ('Accepted', 'Completed')`,
    [listingId],
  );
  return result.rows[0];
}

export type CancelOutcome =
  { kind: 'cancelled' } | { kind: 'notFound' } | { kind: 'notCancellable'; status: string };

/** "Partner cancels": the pickup is Cancelled, its code Void, and the listing Active again while its window is open. */
export async function cancelPartnerPickup(
  partnerId: string,
  offerId: string,
  now: Date,
): Promise<CancelOutcome> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const found = await client.query<{ status: string; listingId: string }>(
      `SELECT status, listing_id AS "listingId" FROM partner_offers WHERE id = $1 AND partner_id = $2 FOR UPDATE`,
      [offerId, partnerId],
    );
    const offer = found.rows[0];
    if (offer === undefined) {
      await client.query('ROLLBACK');
      return { kind: 'notFound' };
    }
    if (offer.status !== 'Accepted') {
      await client.query('ROLLBACK');
      return { kind: 'notCancellable', status: offer.status };
    }
    await client.query(`UPDATE partner_offers SET status = 'Cancelled', cancelled_at = $2 WHERE id = $1`, [
      offerId,
      now,
    ]);
    await client.query(
      `UPDATE pickup_codes SET status = 'Void' WHERE partner_offer_id = $1 AND status = 'Active'`,
      [offerId],
    );
    await client.query(
      `UPDATE listings SET status = 'Active' WHERE id = $1 AND status = 'Fully reserved' AND pickup_end > $2`,
      [offer.listingId, now],
    );
    await client.query('COMMIT');
    return { kind: 'cancelled' };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export interface PartnerCodeMatch {
  offerId: string;
  status: string;
  codeStatus: 'Active' | 'Used' | 'Void';
  pickupStart: Date;
  pickupEnd: Date;
}

/** FR-RES-10: the partner pickup of this listing whose code is `code` (an Active one first), or undefined. */
export async function findPartnerCodeOnListing(
  listingId: string,
  code: string,
): Promise<PartnerCodeMatch | undefined> {
  const result = await getPool().query<PartnerCodeMatch>(
    `SELECT o.id AS "offerId", o.status, pc.status AS "codeStatus",
            l.pickup_start AS "pickupStart", l.pickup_end AS "pickupEnd"
     FROM pickup_codes pc
     JOIN partner_offers o ON o.id = pc.partner_offer_id
     JOIN listings l ON l.id = o.listing_id
     WHERE o.listing_id = $1 AND pc.code = $2
     ORDER BY (pc.status = 'Active') DESC
     LIMIT 1`,
    [listingId, code],
  );
  return result.rows[0];
}

/** FR-RES-10: the charity collected the food: the pickup Completed, its code Used and the listing Closed, once. */
export async function completePartnerPickup(offerId: string, now: Date): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const done = await client.query<{ listingId: string }>(
      `UPDATE partner_offers SET status = 'Completed', completed_at = $2
       WHERE id = $1 AND status = 'Accepted' RETURNING listing_id AS "listingId"`,
      [offerId, now],
    );
    const listingId = done.rows[0]?.listingId;
    if (listingId === undefined) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      `UPDATE pickup_codes SET status = 'Used', used_at = $2 WHERE partner_offer_id = $1 AND status = 'Active'`,
      [offerId, now],
    );
    await client.query(`UPDATE listings SET status = 'Closed' WHERE id = $1`, [listingId]);
    // US-43 (FR-TGI-06): a Zakat donation's receipt shows it was delivered.
    await client.query(
      `UPDATE zakat_donations SET status = 'Delivered', delivered_at = $2
       WHERE donation_listing_id = $1 AND status = 'Paid'`,
      [listingId, now],
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
