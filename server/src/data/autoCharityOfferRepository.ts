// C-27 Data Access: automatic charity offers (US-23, FR-RTE-11, D-112): the vendor's opt-in and the Donation listing
// the worker makes from a consumer listing's unreserved bags.
import { getPool } from './db.js';

export async function readAutoCharityOptIn(vendorId: string): Promise<boolean | undefined> {
  const result = await getPool().query<{ optIn: boolean }>(
    'SELECT auto_charity_opt_in AS "optIn" FROM vendor_profiles WHERE user_id = $1',
    [vendorId],
  );
  return result.rows[0]?.optIn;
}

export async function saveAutoCharityOptIn(vendorId: string, optIn: boolean): Promise<boolean | undefined> {
  const result = await getPool().query<{ optIn: boolean }>(
    `UPDATE vendor_profiles SET auto_charity_opt_in = $2 WHERE user_id = $1 RETURNING auto_charity_opt_in AS "optIn"`,
    [vendorId, optIn],
  );
  return result.rows[0]?.optIn;
}

export interface AutoOfferCandidate {
  id: string;
  pickupStart: Date;
  pickupEnd: Date;
}

/** Consumer listings of opted-in vendors that still have unreserved bags and were not offered yet. */
export async function findAutoOfferCandidates(now: Date): Promise<AutoOfferCandidate[]> {
  const result = await getPool().query<AutoOfferCandidate>(
    `SELECT l.id, l.pickup_start AS "pickupStart", l.pickup_end AS "pickupEnd"
     FROM listings l JOIN vendor_profiles v ON v.user_id = l.vendor_id
     WHERE v.auto_charity_opt_in AND l.listing_type = 'Discounted Surplus Bag' AND l.status = 'Active'
       AND l.bags_available > 0 AND l.auto_charity_offered_at IS NULL AND l.pickup_end > $1
       AND l.food_category IS NOT NULL AND NOT l.unfit_for_people`,
    [now],
  );
  return result.rows;
}

/**
 * FR-RTE-11: in one transaction, the consumer listing's unreserved bags become a new Active Donation listing (same
 * food, branch and window) and the consumer listing is Fully reserved and marked as offered. Returns false when the
 * listing changed in the meantime (no bags left, already offered).
 */
export async function moveUnreservedBagsToDonation(listingId: string, now: Date): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query<{ bags: number }>(
      `SELECT bags_available AS bags FROM listings
       WHERE id = $1 AND status = 'Active' AND bags_available > 0 AND auto_charity_offered_at IS NULL FOR UPDATE`,
      [listingId],
    );
    const bags = locked.rows[0]?.bags;
    if (bags === undefined) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query(
      `INSERT INTO listings (vendor_id, listing_type, status, is_quick_post, food_type, food_category, photo_key,
         description_ar, description_en, calorie_min, calorie_max, bags_total, bags_available, original_value, price,
         pickup_start, pickup_end, prep_time, storage, expiry_at, perishability_category, unfit_for_people, location,
         name_ar, name_en, source_language, branch_id, auto_from_listing_id)
       SELECT vendor_id, 'Donation', 'Active', is_quick_post, food_type, food_category, photo_key,
         description_ar, description_en, calorie_min, calorie_max, $2, $2, original_value, price,
         pickup_start, pickup_end, prep_time, storage, expiry_at, perishability_category, unfit_for_people, location,
         name_ar, name_en, source_language, branch_id, id
       FROM listings WHERE id = $1`,
      [listingId, bags],
    );
    await client.query(
      `UPDATE listings SET bags_available = 0, status = 'Fully reserved', auto_charity_offered_at = $2 WHERE id = $1`,
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

export interface AutoOfferRecord {
  offeredAt: Date;
  bags: number;
  donationListingId: string;
}

/** The vendor's view: when the consumer listing's bags were offered to charities, and how many. */
export async function findAutoOffer(listingId: string): Promise<AutoOfferRecord | undefined> {
  const result = await getPool().query<AutoOfferRecord>(
    `SELECT p.auto_charity_offered_at AS "offeredAt", d.bags_total AS bags, d.id AS "donationListingId"
     FROM listings p JOIN listings d ON d.auto_from_listing_id = p.id
     WHERE p.id = $1 AND p.auto_charity_offered_at IS NOT NULL`,
    [listingId],
  );
  return result.rows[0];
}
