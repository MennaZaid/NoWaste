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

/** US-28: a reservation row as stored. */
export async function readReservationRow(id: string) {
  const result = await getPool().query<Record<string, unknown>>('SELECT * FROM reservations WHERE id = $1', [
    id,
  ]);
  return result.rows[0];
}

/** US-28: the no-shows recorded for a consumer (SDD 4.2 NoShow). */
export async function readNoShows(consumerId: string) {
  const result = await getPool().query<{ reservationId: string; source: string; method: string }>(
    `SELECT reservation_id AS "reservationId", source, method FROM no_shows WHERE consumer_id = $1
     ORDER BY created_at`,
    [consumerId],
  );
  return result.rows;
}

/** US-28: the pickup code row of a reservation (SDD 4.2 PickupCode). */
export async function readPickupCode(reservationId: string) {
  const result = await getPool().query<{ code: string; status: string }>(
    'SELECT code, status FROM pickup_codes WHERE reservation_id = $1',
    [reservationId],
  );
  return result.rows[0];
}

/** D-99: the balance of a pretend-bank test card (mock_bank schema), found by its number's hash. */
export async function readMockBankBalance(number: string): Promise<number | undefined> {
  const result = await getPool().query<{ balance: number }>(
    `SELECT balance::float8 AS balance FROM mock_bank.cards WHERE number_hash = encode(sha256($1::bytea), 'hex')`,
    [number],
  );
  return result.rows[0]?.balance;
}

/** D-99: puts the pretend bank back as the migration seeded it (balances), and forgets tokens and charges. */
export async function resetMockBank(): Promise<void> {
  await getPool().query('DELETE FROM mock_bank.charges');
  await getPool().query('DELETE FROM mock_bank.tokens');
  await getPool().query('UPDATE mock_bank.cards SET balance = seeded_balance');
}

/** D-99: whether a text appears anywhere in the NoWaste reservation and payment tables (it must not, NFR-10). */
export async function nowasteTablesContain(text: string): Promise<boolean> {
  const result = await getPool().query<{ found: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM reservations r WHERE r::text LIKE '%' || $1 || '%')
         OR EXISTS (SELECT 1 FROM payments p WHERE p::text LIKE '%' || $1 || '%') AS found`,
    [text],
  );
  return result.rows[0]?.found ?? false;
}

/** D-99: the payments of a reservation (SDD 4.2 Payment). */
export async function readPayments(reservationId: string) {
  const result = await getPool().query<{ amount: number; status: string; gatewayReference: string }>(
    `SELECT amount::float8 AS amount, status, gateway_reference AS "gatewayReference" FROM payments
     WHERE reservation_id = $1`,
    [reservationId],
  );
  return result.rows;
}

export async function countReservations(listingId: string): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    'SELECT count(*) AS count FROM reservations WHERE listing_id = $1',
    [listingId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

/** D-99: a card reservation left in Pending payment (as after a crash during the charge), with its bag taken. */
export async function insertPendingCardReservation(
  listingId: string,
  consumerId: string,
  createdAt: Date,
): Promise<string> {
  await getPool().query('UPDATE listings SET bags_available = bags_available - 1 WHERE id = $1', [listingId]);
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO reservations (listing_id, consumer_id, method, status, created_at)
     VALUES ($1, $2, 'card', 'Pending payment', $3) RETURNING id`,
    [listingId, consumerId, createdAt],
  );
  return result.rows[0]?.id ?? '';
}

/**
 * US-44 impact fixtures: a consumer collected one bag (a Completed reservation, one bag each, SDD 4.2) at `pricePaid`.
 */
export async function insertCompletedReservation(
  listingId: string,
  consumerId: string,
  pricePaid: number,
  status = 'Completed',
): Promise<void> {
  await getPool().query('UPDATE listings SET bags_available = bags_available - 1 WHERE id = $1', [listingId]);
  await getPool().query(
    `INSERT INTO reservations (listing_id, consumer_id, method, status, price_paid)
     VALUES ($1, $2, 'card', $3, $4)`,
    [listingId, consumerId, status, pricePaid],
  );
}

/** US-44: the listing became a Donation or Compost offer and a partner took it (`status` Completed or Accepted). */
export async function insertPartnerPickup(
  listingId: string,
  partnerId: string,
  listingType: 'Donation' | 'Compost offer',
  status: 'Accepted' | 'Completed' = 'Completed',
): Promise<void> {
  await getPool().query(`UPDATE listings SET listing_type = $2, status = 'Active' WHERE id = $1`, [
    listingId,
    listingType,
  ]);
  await getPool().query(
    `INSERT INTO partner_offers (listing_id, partner_id, status, pickup_time, completed_at)
     VALUES ($1, $2, $3, now(), CASE WHEN $3 = 'Completed' THEN now() END)`,
    [listingId, partnerId, status],
  );
}

/**
 * US-44: a Zakat donation of `bags` bags of a consumer listing (as zakatRepository makes it: a Donation listing for
 * the charity and a receipt). A Delivered one also has the charity's Completed pickup.
 */
export async function insertZakat(
  listingId: string,
  consumerId: string,
  charityId: string,
  bags: number,
  amount: number,
  status: 'Paid' | 'Delivered' | 'Refunded',
): Promise<void> {
  const donation = await getPool().query<{ id: string }>(
    `INSERT INTO listings (vendor_id, listing_type, status, is_quick_post, food_type, food_category, photo_key,
       bags_total, bags_available, original_value, price, pickup_start, pickup_end, storage, location, branch_id,
       reserved_for_partner_id)
     SELECT vendor_id, 'Donation', 'Active', is_quick_post, food_type, food_category, photo_key, $2, $2,
       original_value, price, pickup_start, pickup_end, storage, location, branch_id, $3
     FROM listings WHERE id = $1 RETURNING id`,
    [listingId, bags, charityId],
  );
  const donationId = donation.rows[0]?.id;
  await getPool().query(
    `INSERT INTO zakat_donations (consumer_id, listing_id, donation_listing_id, charity_id, bags, amount,
       receipt_number, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'ZK-TEST-' || substr(md5(random()::text), 1, 8), $7, now())`,
    [consumerId, listingId, donationId, charityId, bags, amount, status],
  );
  if (status === 'Delivered') {
    await getPool().query(
      `INSERT INTO partner_offers (listing_id, partner_id, status, pickup_time, completed_at)
       VALUES ($1, $2, 'Completed', now(), now())`,
      [donationId, charityId],
    );
  }
}

/** FR-RTE-13: the landfill records of a listing. */
export async function readLandfillRecords(listingId: string) {
  const result = await getPool().query<{ bags: number }>(
    'SELECT bags FROM landfill_records WHERE listing_id = $1',
    [listingId],
  );
  return result.rows;
}
