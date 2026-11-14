// C-27 Data Access: offers a consumer can buy now (FR-RES-01, decision D-65). An offer is an Active Discounted Surplus
// Bag of an Approved vendor with bags left whose pickup has not ended. Distances are worked out by PostGIS (SDD 2.2),
// in metres, between the listing's pickup location (its branch) and the consumer.
import { getPool } from './db.js';

export interface OfferRecord {
  id: string;
  vendorId: string;
  photoKey: string;
  foodType: string | null;
  foodCategory: string | null;
  nameAr: string | null;
  nameEn: string | null;
  descriptionAr: string | null;
  descriptionEn: string | null;
  sourceLanguage: 'ar' | 'en' | null;
  isQuickPost: boolean;
  bagsAvailable: number;
  originalValue: number | null;
  price: number;
  pickupStart: Date;
  pickupEnd: Date;
  perishabilityCategory: string | null;
  branchId: string | null;
  shopName: string;
  /** The branch name, or the shop name for a listing made before branches (D-64). */
  branchName: string;
  address: string;
  latitude: number;
  longitude: number;
  /** null when no consumer location was given (the product page). */
  distanceMeters: number | null;
}

const OFFER_COLUMNS = `l.id, l.vendor_id AS "vendorId", l.photo_key AS "photoKey", l.food_type AS "foodType",
  l.food_category AS "foodCategory", l.name_ar AS "nameAr", l.name_en AS "nameEn",
  l.description_ar AS "descriptionAr", l.description_en AS "descriptionEn", l.source_language AS "sourceLanguage",
  l.is_quick_post AS "isQuickPost", l.bags_available AS "bagsAvailable",
  l.original_value::float8 AS "originalValue", l.price::float8 AS price,
  l.pickup_start AS "pickupStart", l.pickup_end AS "pickupEnd", l.perishability_category AS "perishabilityCategory",
  b.id AS "branchId", v.shop_name AS "shopName", COALESCE(b.name, v.shop_name) AS "branchName",
  COALESCE(b.address, v.address) AS address,
  ST_Y(l.location::geometry) AS latitude, ST_X(l.location::geometry) AS longitude`;

const OFFER_FROM = `FROM listings l
  JOIN users u ON u.id = l.vendor_id
  JOIN vendor_profiles v ON v.user_id = l.vendor_id
  LEFT JOIN vendor_branches b ON b.id = l.branch_id`;

// What a consumer may buy now ($1 = the time now).
const OFFER_WHERE = `l.status = 'Active' AND l.listing_type = 'Discounted Surplus Bag' AND NOT l.unfit_for_people
  AND l.bags_available > 0 AND l.pickup_end > $1 AND u.status = 'Approved'`;

/**
 * The offers within `radiusMeters` of the consumer: Highly perishable first (FR-RTE-08), then the nearest, and at
 * the same distance the one whose pickup ends sooner (FR-RTE-09). D-87: optionally only offers priced at or below
 * `maxPrice` and whose pickup starts by `pickupBy` (null = no filter).
 */
export async function findOffersNear(
  point: { latitude: number; longitude: number },
  radiusMeters: number,
  now: Date,
  filters: { maxPrice: number | null; pickupBy: string | null } = { maxPrice: null, pickupBy: null },
): Promise<OfferRecord[]> {
  const result = await getPool().query<OfferRecord>(
    `WITH here AS (SELECT ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography AS g)
     SELECT ${OFFER_COLUMNS}, ST_Distance(l.location, here.g) AS "distanceMeters"
     ${OFFER_FROM} CROSS JOIN here
     WHERE ${OFFER_WHERE} AND ST_DWithin(l.location, here.g, $4)
       AND ($5::numeric IS NULL OR l.price <= $5::numeric)
       AND ($6::timestamptz IS NULL OR l.pickup_start <= $6::timestamptz)
     ORDER BY (l.perishability_category = 'Highly perishable') DESC, "distanceMeters", l.pickup_end, l.id`,
    [now, point.latitude, point.longitude, radiusMeters, filters.maxPrice, filters.pickupBy],
  );
  return result.rows;
}

/** One offer by id, or undefined when it is not (or no longer) an offer. */
export async function findOffer(id: string, now: Date): Promise<OfferRecord | undefined> {
  const result = await getPool().query<OfferRecord>(
    `SELECT ${OFFER_COLUMNS}, NULL::float8 AS "distanceMeters" ${OFFER_FROM} WHERE ${OFFER_WHERE} AND l.id = $2`,
    [now, id],
  );
  return result.rows[0];
}
