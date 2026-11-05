// C-06 Perishability Service (US-18): estimate the perishability category and pickup urgency of a listing (SDD section
// 5.1). D-72: the vendor no longer confirms or changes the category; the estimate is set when the listing is saved. The rules are the pure functions in domain/perishability.ts;
// this service only reads their inputs: the listing, BR-01 from settings and the shelf-life from perishability_rules.
// Sprint 1 has no AI: the vendor types the food category, so the estimate is treated as confident (decision D-54).
import { estimate, type PerishabilityCategory } from '../../domain/perishability.js';
import { saveDraftCategory, type ListingRecord } from '../../data/listingRepository.js';
import { ownListing, urgencyOf, type Urgency } from '../listing/listingService.js';
import { readThresholds, rulesFor } from './thresholds.js';

async function estimateRecord(
  listing: ListingRecord,
): Promise<{ category: PerishabilityCategory; urgency: Urgency }> {
  // D-61: the urgency is the collect-by time, the pickup end (never later than the food limit).
  const urgency = urgencyOf(listing);
  try {
    const { input, rules } = await rulesFor({
      foodCategory: listing.foodCategory,
      storage: listing.storage,
      pickupStart: listing.pickupStart,
      isQuickPost: listing.isQuickPost,
    });
    return { category: estimate(input, rules).category, urgency };
  } catch {
    // E-RTE-01: if the estimate fails, use Highly perishable and let the vendor continue.
    return { category: 'Highly perishable', urgency };
  }
}

/** POST /listings/:id/perishability/estimate (FR-RTE-01, FR-RTE-02, E-RTE-01). */
export async function estimateListing(
  vendorId: string,
  id: string,
): Promise<{ category: PerishabilityCategory; urgency: Urgency }> {
  return estimateRecord(await ownListing(vendorId, id));
}

/**
 * D-72: a Draft saved before D-70 has no category yet; it gets its estimate the first time it is needed (routing),
 * so the vendor never has a category step. Other listings are returned as they are.
 */
export async function withCategory(vendorId: string, listing: ListingRecord): Promise<ListingRecord> {
  if (listing.perishabilityCategory !== null || listing.status !== 'Draft') return listing;
  const { category } = await estimateRecord(listing);
  return (await saveDraftCategory(vendorId, listing.id, category)) ?? listing;
}

/**
 * GET /perishability/categories (D-70): what each category means in hours, from the BR-01 settings row, so the app can
 * show "Highly perishable: up to 6 hours" without writing the hours into its texts.
 */
export async function categoryHours(): Promise<{
  highlyPerishableMaxHours: number;
  shortLifeMaxHours: number;
}> {
  const thresholds = await readThresholds();
  return {
    highlyPerishableMaxHours: thresholds.highlyPerishableMaxHours,
    shortLifeMaxHours: thresholds.shortLifeMaxHours,
  };
}
