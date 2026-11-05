// C-06 Perishability Service rules (US-18, SDD section 5.1): pure functions, no database calls. The caller passes in
// the BR-01 hours from the settings table and the shelf-life from perishability_rules ([FEEDBACK CHANGE]: no rule
// value lives in code). The category tells how soon to collect the food; it never says the food is safe (NFR-05a).
// D-64 (2026-11-03, changes FR-RTE-01 and US-13): listings no longer ask for preparation time or expiry. The food
// limit is the pickup start + the shelf-life of the food category and storage, and the pick-by time is that limit,
// or the start + the BR-01 Highly perishable hours when the limit is unknown, never later than the closing time.
import type { ListingFoodCategory, StorageCondition } from '@nowaste/shared';

/** Most urgent first: Highly perishable > Short-life > Long-life. */
export const CATEGORIES_MOST_URGENT_FIRST = ['Highly perishable', 'Short-life', 'Long-life'] as const;
export type PerishabilityCategory = (typeof CATEGORIES_MOST_URGENT_FIRST)[number];

/** BR-01, read from the settings table. */
export interface Thresholds {
  highlyPerishableMaxHours: number;
  shortLifeMaxHours: number;
}

export interface EstimateInput {
  foodCategory: ListingFoodCategory;
  storage: StorageCondition;
  /** When the pickup window opens: the food's time is counted from here. */
  pickupStart: Date;
  isQuickPost: boolean;
  aiConfident: boolean;
}

export interface EstimateRules {
  now: Date;
  thresholds: Thresholds;
  /** perishability_rules.shelf_life_hours for the food category and storage; null = not set yet. */
  shelfLifeHours: number | null;
}

const HOUR = 3_600_000;

export function isPerishabilityCategory(value: unknown): value is PerishabilityCategory {
  return CATEGORIES_MOST_URGENT_FIRST.includes(value as PerishabilityCategory);
}

/**
 * The food limit (FR-RTE-01 as changed by D-64): the pickup start + the shelf-life, or null when it cannot be known:
 * a Quick Post, storage or food category Unknown, an uncertain estimate (FR-RTE-02, NFR-05d) or a shelf-life the team
 * has not set.
 */
export function foodLimit(input: EstimateInput, rules: EstimateRules): Date | null {
  if (
    input.isQuickPost ||
    input.storage === 'unknown' ||
    input.foodCategory === 'unknown' ||
    !input.aiConfident ||
    rules.shelfLifeHours === null
  ) {
    return null;
  }
  return new Date(input.pickupStart.getTime() + rules.shelfLifeHours * HOUR);
}

/** SDD 5.1 estimate(foodCategory, storage, pickup start, isQuickPost, aiConfident). */
export function estimate(input: EstimateInput, rules: EstimateRules): { category: PerishabilityCategory } {
  const limit = foodLimit(input, rules);
  // FR-RTE-02, NFR-05d: missing or uncertain information -> most urgent.
  if (limit === null) return { category: 'Highly perishable' };
  // FR-RTE-01: the time left until the limit decides the category (BR-01). D-71: counted from the pickup start, so
  // the category does not depend on how early the listing is saved; from now once the pickup has started (never
  // less urgent).
  const from = Math.max(input.pickupStart.getTime(), rules.now.getTime());
  const hours = (limit.getTime() - from) / HOUR;
  if (hours <= rules.thresholds.highlyPerishableMaxHours) return { category: 'Highly perishable' };
  if (hours <= rules.thresholds.shortLifeMaxHours) return { category: 'Short-life' };
  return { category: 'Long-life' };
}

/**
 * D-64: the pick-by time (the pickup end). The food limit, or the pickup start + the BR-01 Highly perishable hours
 * when the limit is unknown; if that is later than the closing time of the branch's opening period, the closing time.
 */
export function pickBy(input: EstimateInput, rules: EstimateRules, closes: Date | null): Date {
  const limit =
    foodLimit(input, rules) ??
    new Date(input.pickupStart.getTime() + rules.thresholds.highlyPerishableMaxHours * HOUR);
  return closes !== null && closes.getTime() < limit.getTime() ? closes : limit;
}
