// C-07 Routing Service (US-19): ranks the destinations of a listing and shows the top recommendation (FR-RTE-05),
// sets the listing type from the vendor's choice (FR-RTE-06) and keeps food unfit for people for composting only
// (FR-RTE-07). The ranking rules are the pure functions in domain/routing.ts; this service finds the eligible
// partners with PostGIS and reads the radius from the settings table.
import { SrsError } from '../../domain/errors.js';
import { clock } from '../../domain/clock.js';
import {
  eligibleDestinations,
  isDestination,
  LISTING_TYPE_OF,
  rankDestinations,
  type Destination,
  type RoutingFacts,
} from '../../domain/routing.js';
import { getSetting } from '../../data/settingsRepository.js';
import {
  findPartnerReach,
  saveDraftListingType,
  saveDraftUnfit,
  saveQuickPostListingType,
  type ListingRecord,
} from '../../data/listingRepository.js';
import { ownListing, present, type ListingView } from '../listing/listingService.js';
import { withCategory } from '../perishability/perishabilityService.js';

export interface DestinationOption {
  destination: Destination;
  /** Matching partners (charity and composting only). */
  partners: number | null;
  nearestPartnerMeters: number | null;
  /** Landfill is shown last but cannot be chosen yet: recording it is US-25. */
  available: boolean;
}

export interface Destinations {
  options: DestinationOption[];
  /** The top destination, or null when the recommendation failed (E-RTE-02). */
  recommended: Destination | null;
  timeLeftMinutes: number;
}

/** The FR-RTE-05 settings row: partner radius in km, null = no limit (open question 49). */
async function radiusMeters(): Promise<number | null> {
  const value = (await getSetting('FR-RTE-05'))?.value as { partner_radius_km?: unknown } | null | undefined;
  const km = value?.partner_radius_km;
  return typeof km === 'number' && km > 0 ? km * 1000 : null;
}

async function factsOf(listing: ListingRecord): Promise<RoutingFacts> {
  const radius = await radiusMeters();
  const [charity, composting] = await Promise.all([
    findPartnerReach(listing.id, 'charity', radius),
    findPartnerReach(listing.id, 'composting', radius),
  ]);
  return { unfitForPeople: listing.unfitForPeople, charity, composting };
}

/**
 * GET /listings/:id/destinations (FR-RTE-05, FR-RTE-07, E-RTE-02). `rank` is the ranking rule; tests pass one that
 * fails to check E-RTE-02.
 */
export async function getDestinations(
  vendorId: string,
  id: string,
  rank: (eligible: readonly Destination[]) => Destination[] = rankDestinations,
): Promise<Destinations> {
  // D-72: routing follows the estimated category (set on saving; worked out now for a Draft saved before D-70).
  const listing = await withCategory(vendorId, await ownListing(vendorId, id));
  const facts = await factsOf(listing);
  const eligible = eligibleDestinations(facts);
  let ordered: Destination[];
  let recommended: Destination | null;
  try {
    ordered = rank(eligible);
    recommended = ordered[0] ?? null;
  } catch {
    // E-RTE-02: no recommendation; the vendor still chooses from the eligible options.
    ordered = eligible;
    recommended = null;
  }
  const reachOf = (d: Destination) =>
    d === 'charity' ? facts.charity : d === 'composting' ? facts.composting : null;
  return {
    options: ordered.map((destination) => ({
      destination,
      partners: reachOf(destination)?.partners ?? null,
      nearestPartnerMeters: reachOf(destination)?.nearestMeters ?? null,
      available: destination !== 'landfill',
    })),
    recommended,
    timeLeftMinutes: Math.round((listing.pickupEnd.getTime() - clock.now().getTime()) / 60_000),
  };
}

function draftOnly(listing: ListingRecord): void {
  if (listing.status !== 'Draft')
    throw new SrsError(409, { error: 'listing_not_draft', status: listing.status });
}

/**
 * D-68: an Active Quick Post may change its destination after posting, until its pickup ends (it was published for
 * consumers at once, D-43). Every other listing chooses its destination as a Draft.
 */
function changeableQuickPost(listing: ListingRecord): boolean {
  if (!listing.isQuickPost || listing.status !== 'Active') return false;
  if (listing.pickupEnd.getTime() <= clock.now().getTime()) {
    throw new SrsError(409, { error: 'pickup_ended' });
  }
  return true;
}

/** POST /listings/:id/destination {destination} (FR-RTE-06): sets the listing type. */
export async function chooseDestination(
  vendorId: string,
  id: string,
  destination: unknown,
): Promise<ListingView> {
  if (!isDestination(destination)) throw new SrsError(400, { error: 'E-LST-04', fields: ['destination'] });
  const found = await ownListing(vendorId, id);
  const quickPost = changeableQuickPost(found);
  if (!quickPost) draftOnly(found);
  const listing = await withCategory(vendorId, found);
  // FR-RTE-13 (US-25, a later story): a landfill disposal cannot be recorded yet.
  if (destination === 'landfill') throw new SrsError(409, { error: 'landfill_not_available' });
  if (!eligibleDestinations(await factsOf(listing)).includes(destination)) {
    throw new SrsError(409, { error: 'destination_not_eligible' });
  }
  const saved = quickPost
    ? await saveQuickPostListingType(vendorId, id, LISTING_TYPE_OF[destination], clock.now())
    : await saveDraftListingType(vendorId, id, LISTING_TYPE_OF[destination]);
  if (saved === undefined && !quickPost) draftOnly(await ownListing(vendorId, id));
  if (saved === undefined && quickPost) throw new SrsError(409, { error: 'pickup_ended' });
  return present(saved ?? listing);
}

/** POST /listings/:id/unfit {unfitForPeople} (FR-RTE-07). Clears a destination chosen before. */
export async function markUnfit(vendorId: string, id: string, unfitForPeople: unknown): Promise<ListingView> {
  if (typeof unfitForPeople !== 'boolean') {
    throw new SrsError(400, { error: 'E-LST-04', fields: ['unfitForPeople'] });
  }
  draftOnly(await ownListing(vendorId, id));
  const saved = await saveDraftUnfit(vendorId, id, unfitForPeople);
  if (saved === undefined) {
    draftOnly(await ownListing(vendorId, id));
    throw new SrsError(409, { error: 'listing_not_draft' });
  }
  return present(saved);
}
