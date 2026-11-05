// C-27 Data Access: the listings table (SDD 4.2 "Listing") and the vendor's shop details used by the listing form.
import type { ListingFoodCategory, StorageCondition } from '@nowaste/shared';
import { getPool } from './db.js';

export type ListingStatus = 'Draft' | 'Active' | 'Fully reserved' | 'Closed' | 'Cancelled';
export type ListingType = 'Discounted Surplus Bag' | 'Donation' | 'Compost offer';
export type PerishabilityCategory = 'Highly perishable' | 'Short-life' | 'Long-life';

export interface ListingRecord {
  id: string;
  vendorId: string;
  listingType: ListingType | null;
  status: ListingStatus;
  isQuickPost: boolean;
  foodType: string | null;
  /** null = Unknown. */
  foodCategory: Exclude<ListingFoodCategory, 'unknown'> | null;
  photoKey: string;
  descriptionAr: string | null;
  descriptionEn: string | null;
  /** D-63: the name in each language; the one the vendor did not write is the translation, or null. */
  nameAr: string | null;
  nameEn: string | null;
  sourceLanguage: 'ar' | 'en' | null;
  /** D-64: the branch where the food is picked up. */
  branchId: string | null;
  calorieMin: number | null;
  calorieMax: number | null;
  bagsTotal: number;
  bagsAvailable: number;
  originalValue: number | null;
  price: number;
  pickupStart: Date;
  pickupEnd: Date;
  prepTime: Date | null;
  storage: StorageCondition | null;
  expiryAt: Date | null;
  perishabilityCategory: PerishabilityCategory | null;
  unfitForPeople: boolean;
  latitude: number;
  longitude: number;
}

export type NewListing = Omit<
  ListingRecord,
  | 'id'
  | 'status'
  | 'bagsAvailable'
  | 'calorieMin'
  | 'calorieMax'
  | 'unfitForPeople'
  | 'latitude'
  | 'longitude'
> & {
  status: 'Draft' | 'Active';
  /** null = the vendor's shop pin; otherwise the branch pin (D-64). */
  location: { latitude: number; longitude: number } | null;
};

const columns = `id, vendor_id AS "vendorId", listing_type AS "listingType", status, is_quick_post AS "isQuickPost",
  food_type AS "foodType", food_category AS "foodCategory", photo_key AS "photoKey",
  description_ar AS "descriptionAr", description_en AS "descriptionEn",
  name_ar AS "nameAr", name_en AS "nameEn", source_language AS "sourceLanguage", branch_id AS "branchId",
  calorie_min AS "calorieMin", calorie_max AS "calorieMax", bags_total AS "bagsTotal",
  bags_available AS "bagsAvailable", original_value::float8 AS "originalValue", price::float8 AS price,
  pickup_start AS "pickupStart", pickup_end AS "pickupEnd", prep_time AS "prepTime", storage,
  expiry_at AS "expiryAt", perishability_category AS "perishabilityCategory",
  unfit_for_people AS "unfitForPeople",
  ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude`;

/**
 * Inserts a listing. Without a location the pickup location is the vendor's shop pin (docs/feedback-changes.md),
 * copied in the same statement.
 */
export async function insertListing(listing: NewListing): Promise<ListingRecord> {
  const result = await getPool().query<ListingRecord>(
    `INSERT INTO listings (vendor_id, listing_type, status, is_quick_post, food_type, food_category, photo_key,
       description_ar, description_en, bags_total, bags_available, original_value, price, pickup_start, pickup_end,
       prep_time, storage, expiry_at, perishability_category, location, name_ar, name_en, source_language, branch_id)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $12, $13, $14, $15, $16, $17, $18,
       CASE WHEN $19::float8 IS NULL THEN v.location
            ELSE ST_SetSRID(ST_MakePoint($20, $19), 4326)::geography END,
       $21, $22, $23, $24
     FROM vendor_profiles v WHERE v.user_id = $1
     RETURNING ${columns}`,
    [
      listing.vendorId,
      listing.listingType,
      listing.status,
      listing.isQuickPost,
      listing.foodType,
      listing.foodCategory,
      listing.photoKey,
      listing.descriptionAr,
      listing.descriptionEn,
      listing.bagsTotal,
      listing.originalValue,
      listing.price,
      listing.pickupStart,
      listing.pickupEnd,
      listing.prepTime,
      listing.storage,
      listing.expiryAt,
      listing.perishabilityCategory,
      listing.location?.latitude ?? null,
      listing.location?.longitude ?? null,
      listing.nameAr,
      listing.nameEn,
      listing.sourceLanguage,
      listing.branchId,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('No vendor profile for this vendor');
  return row;
}

/** A listing of this vendor, or undefined (another vendor's listing is not found either). */
export async function findVendorListing(vendorId: string, id: string): Promise<ListingRecord | undefined> {
  const result = await getPool().query<ListingRecord>(
    `SELECT ${columns} FROM listings WHERE id = $1 AND vendor_id = $2`,
    [id, vendorId],
  );
  return result.rows[0];
}

/** Every listing of this vendor, newest first (FR-LST-06). */
export async function findVendorListings(vendorId: string): Promise<ListingRecord[]> {
  const result = await getPool().query<ListingRecord>(
    `SELECT ${columns} FROM listings WHERE vendor_id = $1 ORDER BY created_at DESC, id`,
    [vendorId],
  );
  return result.rows;
}

/** Saves the confirmed perishability category of a Draft (FR-RTE-03). Undefined when it is no longer a Draft. */
export async function saveDraftCategory(
  vendorId: string,
  id: string,
  category: PerishabilityCategory,
): Promise<ListingRecord | undefined> {
  const result = await getPool().query<ListingRecord>(
    `UPDATE listings SET perishability_category = $3 WHERE id = $1 AND vendor_id = $2 AND status = 'Draft'
     RETURNING ${columns}`,
    [id, vendorId, category],
  );
  return result.rows[0];
}

/** Sets the listing type of a Draft from the chosen destination (FR-RTE-06). */
export async function saveDraftListingType(
  vendorId: string,
  id: string,
  listingType: ListingType,
): Promise<ListingRecord | undefined> {
  const result = await getPool().query<ListingRecord>(
    `UPDATE listings SET listing_type = $3 WHERE id = $1 AND vendor_id = $2 AND status = 'Draft'
     RETURNING ${columns}`,
    [id, vendorId, listingType],
  );
  return result.rows[0];
}

/**
 * D-68: changes the listing type of the vendor's Active Quick Post whose pickup has not ended. Undefined otherwise.
 */
export async function saveQuickPostListingType(
  vendorId: string,
  id: string,
  listingType: ListingType,
  now: Date,
): Promise<ListingRecord | undefined> {
  const result = await getPool().query<ListingRecord>(
    `UPDATE listings SET listing_type = $3
     WHERE id = $1 AND vendor_id = $2 AND is_quick_post AND status = 'Active' AND pickup_end > $4
     RETURNING ${columns}`,
    [id, vendorId, listingType, now],
  );
  return result.rows[0];
}

/**
 * Marks a Draft as unfit for people or not (FR-RTE-07). A destination chosen before may no longer be allowed, so the
 * listing type is cleared and the vendor chooses again.
 */
export async function saveDraftUnfit(
  vendorId: string,
  id: string,
  unfit: boolean,
): Promise<ListingRecord | undefined> {
  const result = await getPool().query<ListingRecord>(
    `UPDATE listings SET unfit_for_people = $3, listing_type = NULL
     WHERE id = $1 AND vendor_id = $2 AND status = 'Draft'
     RETURNING ${columns}`,
    [id, vendorId, unfit],
  );
  return result.rows[0];
}

/**
 * FR-RTE-05: how many Approved partners of this type accept the listing's food category and are within the radius
 * (null = no limit), and the distance in metres from the pickup location to the nearest (PostGIS ST_Distance).
 * A listing whose food category is Unknown (NULL) matches no partner.
 */
export async function findPartnerReach(
  listingId: string,
  partnerType: 'charity' | 'composting',
  radiusMeters: number | null,
): Promise<{ partners: number; nearestMeters: number | null }> {
  const result = await getPool().query<{ partners: number; nearestMeters: number | null }>(
    `SELECT count(p.user_id)::int AS partners, min(ST_Distance(p.location, l.location)) AS "nearestMeters"
     FROM listings l
     JOIN partner_profiles p ON p.partner_type = $2 AND l.food_category = ANY (p.accepted_food_types)
     JOIN users u ON u.id = p.user_id AND u.status = 'Approved'
     WHERE l.id = $1 AND ($3::float8 IS NULL OR ST_DWithin(p.location, l.location, $3::float8))`,
    [listingId, partnerType, radiusMeters],
  );
  return result.rows[0] ?? { partners: 0, nearestMeters: null };
}

/** Moves a Draft to Active. Returns undefined when the listing is no longer a Draft. */
export async function activateDraft(vendorId: string, id: string): Promise<ListingRecord | undefined> {
  const result = await getPool().query<ListingRecord>(
    `UPDATE listings SET status = 'Active' WHERE id = $1 AND vendor_id = $2 AND status = 'Draft'
     RETURNING ${columns}`,
    [id, vendorId],
  );
  return result.rows[0];
}

export interface ShopDetails {
  shopName: string;
  vendorType: 'formal' | 'informal';
  address: string;
  latitude: number;
  longitude: number;
  /** D-62: "HH:MM" local time; null only for a vendor registered before the hours were required. */
  opensAt: string | null;
  closesAt: string | null;
}

const shopColumns = `shop_name AS "shopName", vendor_type AS "vendorType", address,
  ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude,
  to_char(opens_at, 'HH24:MI') AS "opensAt", to_char(closes_at, 'HH24:MI') AS "closesAt"`;

export async function findShopDetails(vendorId: string): Promise<ShopDetails | undefined> {
  const result = await getPool().query<ShopDetails>(
    `SELECT ${shopColumns} FROM vendor_profiles WHERE user_id = $1`,
    [vendorId],
  );
  return result.rows[0];
}

/** D-62: saves the opening hours ("HH:MM") and returns the shop. */
export async function saveOpeningHours(
  vendorId: string,
  hours: { opensAt: string; closesAt: string },
): Promise<ShopDetails | undefined> {
  // D-64: the shop's hours are the hours of its first (main) branch, so both are saved together.
  const result = await getPool().query<ShopDetails>(
    `WITH main AS (
       UPDATE vendor_branches SET opens_at = $2, closes_at = $3
       WHERE id = (SELECT id FROM vendor_branches WHERE vendor_id = $1 ORDER BY created_at, id LIMIT 1)
     )
     UPDATE vendor_profiles SET opens_at = $2, closes_at = $3 WHERE user_id = $1 RETURNING ${shopColumns}`,
    [vendorId, hours.opensAt, hours.closesAt],
  );
  return result.rows[0];
}
