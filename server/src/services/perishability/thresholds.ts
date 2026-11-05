// BR-01 perishability hours from the settings table ([FEEDBACK CHANGE]: never constants in code), and the inputs of the
// C-06 rules for one listing. Used by the Perishability Service (estimate, confirm) and by the Listing Service, which
// works out the pick-by time when a listing is saved (D-64).
import type { ListingFoodCategory, StorageCondition } from '@nowaste/shared';
import { getSetting } from '../../data/settingsRepository.js';
import { findShelfLifeHours } from '../../data/perishabilityRuleRepository.js';
import { clock } from '../../domain/clock.js';
import type { EstimateInput, EstimateRules, Thresholds } from '../../domain/perishability.js';

/** Sprint 1: the food category is typed by the vendor, never by AI, so it is confident (D-54). */
const AI_CONFIDENT_WITHOUT_AI = true;

/** Reads BR-01; throws when the row is missing or not a pair of positive numbers. */
export async function readThresholds(): Promise<Thresholds> {
  const value = (await getSetting('BR-01'))?.value as
    { highly_perishable_max_hours?: unknown; short_life_max_hours?: unknown } | null | undefined;
  const highly = value?.highly_perishable_max_hours;
  const short = value?.short_life_max_hours;
  if (typeof highly !== 'number' || typeof short !== 'number' || highly <= 0 || short <= highly) {
    throw new Error('Settings row BR-01 is missing or invalid');
  }
  return { highlyPerishableMaxHours: highly, shortLifeMaxHours: short };
}

/** The facts of one listing that the C-06 rules use. null food category or storage = Unknown. */
export interface PerishabilityFacts {
  foodCategory: ListingFoodCategory | null;
  storage: StorageCondition | null;
  pickupStart: Date;
  isQuickPost: boolean;
}

/** Reads BR-01 and the shelf-life, and turns the facts into the input of the C-06 rules. Throws if BR-01 is bad. */
export async function rulesFor(
  facts: PerishabilityFacts,
): Promise<{ input: EstimateInput; rules: EstimateRules }> {
  const thresholds = await readThresholds();
  const storage = facts.storage ?? 'unknown';
  const foodCategory = facts.foodCategory ?? 'unknown';
  const shelfLifeHours =
    foodCategory !== 'unknown' && storage !== 'unknown'
      ? await findShelfLifeHours(foodCategory, storage)
      : null;
  return {
    input: {
      foodCategory,
      storage,
      pickupStart: facts.pickupStart,
      isQuickPost: facts.isQuickPost,
      aiConfident: AI_CONFIDENT_WITHOUT_AI,
    },
    rules: { now: clock.now(), thresholds, shelfLifeHours },
  };
}
