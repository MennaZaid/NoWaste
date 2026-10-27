// Test-only helpers for the real nowaste_test database. Application SQL stays in server/src/data.
import { getPool } from '../../src/data/db.js';

export async function deleteAllUsers(): Promise<void> {
  await getPool().query('TRUNCATE users CASCADE');
}

export async function countUsers(): Promise<number> {
  const result = await getPool().query<{ count: string }>('SELECT count(*) AS count FROM users');
  return Number(result.rows[0]?.count ?? 0);
}

/** Reads a vendor profile back, with the pin taken apart by PostGIS (ST_Y = latitude, ST_X = longitude). */
export async function readVendorProfile(userId: string) {
  const result = await getPool().query<Record<string, unknown>>(
    `SELECT shop_name AS "shopName", vendor_type AS "vendorType", address, contact, description,
            auto_charity_opt_in AS "autoCharityOptIn", average_rating AS "averageRating",
            pg_typeof(location)::text AS "locationType",
            ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
     FROM vendor_profiles WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0];
}

/** Reads a partner profile back, with the pin taken apart by PostGIS. */
export async function readPartnerProfile(userId: string) {
  const result = await getPool().query<Record<string, unknown>>(
    `SELECT organisation_name AS "organisationName", partner_type AS "partnerType", address,
            accepted_food_types::text[] AS "acceptedFoodTypes",
            other_partner_type AS "otherPartnerType", other_food_type AS "otherFoodType",
            pg_typeof(location)::text AS "locationType",
            ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
     FROM partner_profiles WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0];
}

/** The values of the food_category enum, in their declared order. */
export async function listFoodCategoryEnum(): Promise<string[]> {
  const result = await getPool().query<{ value: string }>(
    'SELECT unnest(enum_range(NULL::food_category))::text AS value',
  );
  return result.rows.map((row) => row.value);
}
