// C-27 Data Access: the perishability_rules table (US-18, [FEEDBACK CHANGE]): shelf-life per food category and
// storage condition, read by the Perishability Service instead of values in code.
import type { FoodCategory } from '@nowaste/shared';
import { getPool } from './db.js';

/** The shelf-life in hours, or null when the team has not set it (or there is no row). */
export async function findShelfLifeHours(
  foodCategory: FoodCategory,
  storage: 'room_temperature' | 'chilled' | 'frozen',
): Promise<number | null> {
  const result = await getPool().query<{ hours: number | null }>(
    `SELECT shelf_life_hours::float8 AS hours FROM perishability_rules
     WHERE food_category = $1 AND storage = $2`,
    [foodCategory, storage],
  );
  return result.rows[0]?.hours ?? null;
}
