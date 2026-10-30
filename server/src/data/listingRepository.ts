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
  /** null = the vendor's shop pin. */
  location: { latitude: number; longitude: number } | null;
};

const columns = `id, vendor_id AS "vendorId", listing_type AS "listingType", status, is_quick_post AS "isQuickPost",
  food_type AS "foodType", food_category AS "foodCategory", photo_key AS "photoKey",
  description_ar AS "descriptionAr", description_en AS "descriptionEn",
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
       prep_time, storage, expiry_at, perishability_category, location)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, $11, $12, $13, $14, $15, $16, $17, $18,
       CASE WHEN $19::float8 IS NULL THEN v.location
            ELSE ST_SetSRID(ST_MakePoint($20, $19), 4326)::geography END
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
}

export async function findShopDetails(vendorId: string): Promise<ShopDetails | undefined> {
  const result = await getPool().query<ShopDetails>(
    `SELECT shop_name AS "shopName", vendor_type AS "vendorType", address,
            ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
     FROM vendor_profiles WHERE user_id = $1`,
    [vendorId],
  );
  return result.rows[0];
}
