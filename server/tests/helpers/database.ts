// Test-only helpers for the real nowaste_test database. Application SQL stays in server/src/data.
import { getPool } from '../../src/data/db.js';

export async function deleteAllUsers(): Promise<void> {
  await getPool().query('TRUNCATE users CASCADE');
}

export async function countListings(): Promise<number> {
  const result = await getPool().query<{ count: string }>('SELECT count(*) AS count FROM listings');
  return Number(result.rows[0]?.count ?? 0);
}

/** A listing row as stored, with the pickup location taken apart by PostGIS. */
export async function readListingRow(id: string) {
  const result = await getPool().query<Record<string, unknown>>(
    `SELECT *, pg_typeof(location)::text AS "locationType",
            ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
     FROM listings WHERE id = $1`,
    [id],
  );
  return result.rows[0];
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

/** Sets an account status directly, for states that have no API yet (for example Suspended, US-08). */
export async function setUserStatus(userId: string, status: string): Promise<void> {
  await getPool().query('UPDATE users SET status = $2 WHERE id = $1', [userId, status]);
}

/** Inserts an administrator the way the team does (SRS 2.7), with the given bcrypt hash. */
export async function insertAdmin(email: string, passwordHash: string): Promise<string> {
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, status, language) VALUES ($1, $2, 'admin', 'Active', 'en')
     RETURNING id`,
    [email, passwordHash],
  );
  return result.rows[0]?.id ?? '';
}

export async function readUserStatus(userId: string): Promise<string | undefined> {
  const result = await getPool().query<{ status: string }>('SELECT status FROM users WHERE id = $1', [
    userId,
  ]);
  return result.rows[0]?.status;
}

export async function readSession(jti: string) {
  const result = await getPool().query<{ userId: string; endedAt: Date | null }>(
    'SELECT user_id AS "userId", ended_at AS "endedAt" FROM sessions WHERE jti = $1',
    [jti],
  );
  return result.rows[0];
}

export async function countLoginAttempts(userId: string): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    'SELECT count(*) AS count FROM login_attempts WHERE user_id = $1',
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

/** The value of a settings row (for tests that change a rule and put it back). */
export async function readSettingValue(key: string): Promise<unknown> {
  const result = await getPool().query<{ value: unknown }>('SELECT value FROM settings WHERE key = $1', [
    key,
  ]);
  return result.rows[0]?.value;
}

export async function setSettingValue(key: string, value: unknown): Promise<void> {
  await getPool().query('UPDATE settings SET value = $2 WHERE key = $1', [key, JSON.stringify(value)]);
}

export async function listPerishabilityRules(): Promise<
  { foodCategory: string; storage: string; shelfLifeHours: number | null }[]
> {
  const result = await getPool().query<{
    foodCategory: string;
    storage: string;
    shelfLifeHours: number | null;
  }>(
    `SELECT food_category::text AS "foodCategory", storage, shelf_life_hours::float8 AS "shelfLifeHours"
     FROM perishability_rules ORDER BY food_category, storage`,
  );
  return result.rows;
}

export async function setShelfLife(
  foodCategory: string,
  storage: string,
  hours: number | null,
): Promise<void> {
  await getPool().query(
    'UPDATE perishability_rules SET shelf_life_hours = $3 WHERE food_category = $1 AND storage = $2',
    [foodCategory, storage, hours],
  );
}

/** D-70: clears the category of a listing, like a Draft saved before the category was set on saving. */
export async function clearListingCategory(listingId: string): Promise<void> {
  await getPool().query('UPDATE listings SET perishability_category = NULL WHERE id = $1', [listingId]);
}

/** D-65: sets the bags left of a listing (for example 0: sold out). */
export async function setBagsAvailable(listingId: string, bags: number): Promise<void> {
  await getPool().query('UPDATE listings SET bags_available = $2 WHERE id = $1', [listingId, bags]);
}

export async function setUnfitForPeople(listingId: string, unfit: boolean): Promise<void> {
  await getPool().query('UPDATE listings SET unfit_for_people = $2 WHERE id = $1', [listingId, unfit]);
}

/** D-62: the stored opening hours of a vendor (PostgreSQL TIME, as text). */
export async function readOpeningHours(userId: string) {
  const result = await getPool().query<{ opensAt: string | null; closesAt: string | null }>(
    'SELECT opens_at::text AS "opensAt", closes_at::text AS "closesAt" FROM vendor_profiles WHERE user_id = $1',
    [userId],
  );
  return result.rows[0];
}

/** D-62: removes a vendor's opening hours, like a vendor registered before they were required. */
export async function clearOpeningHours(userId: string): Promise<void> {
  await getPool().query('UPDATE vendor_profiles SET opens_at = NULL, closes_at = NULL WHERE user_id = $1', [
    userId,
  ]);
  // D-64: the vendor's branches were also registered without hours.
  await getPool().query('UPDATE vendor_branches SET opens_at = NULL, closes_at = NULL WHERE vendor_id = $1', [
    userId,
  ]);
}
