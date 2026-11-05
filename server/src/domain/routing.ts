// C-07 Routing Service rules (US-19): pure functions, no database calls. The SRS impact table gives the order:
// consumers at a discount first, then charity, then composting, with landfill only as a last resort. Food unfit for
// people goes only to composting (FR-RTE-07). Distance and accepted food types decide which partners count; the
// service finds them with PostGIS and passes the result in.

export const DESTINATIONS = ['consumers', 'charity', 'composting', 'landfill'] as const;
export type Destination = (typeof DESTINATIONS)[number];

/** FR-RTE-06: the listing type each destination gives. Landfill sets none (recording it is US-25). */
export const LISTING_TYPE_OF = {
  consumers: 'Discounted Surplus Bag',
  charity: 'Donation',
  composting: 'Compost offer',
} as const;

/** Approved partners of one type that accept the food category and are within the radius (if any). */
export interface PartnerReach {
  partners: number;
  /** Distance in metres from the pickup location to the nearest of them; null when there are none. */
  nearestMeters: number | null;
}

export interface RoutingFacts {
  unfitForPeople: boolean;
  charity: PartnerReach;
  composting: PartnerReach;
}

export function isDestination(value: unknown): value is Destination {
  return DESTINATIONS.includes(value as Destination);
}

/** The destinations the vendor may choose, in the default order (FR-RTE-05, FR-RTE-07). */
export function eligibleDestinations(facts: RoutingFacts): Destination[] {
  return DESTINATIONS.filter((destination) => {
    switch (destination) {
      case 'consumers':
        return !facts.unfitForPeople;
      case 'charity':
        return !facts.unfitForPeople && facts.charity.partners > 0;
      case 'composting':
        return facts.composting.partners > 0;
      case 'landfill':
        return true;
    }
  });
}

/**
 * FR-RTE-05: ranks the eligible destinations, best first. Consumers, then charity, then composting, then landfill
 * last; the top one is the recommendation. Distance and accepted food types already decided eligibility. How time
 * left should change the order is not given in the SRS (open question 50), so it does not change it yet.
 */
export function rankDestinations(eligible: readonly Destination[]): Destination[] {
  return [...eligible].sort((a, b) => DESTINATIONS.indexOf(a) - DESTINATIONS.indexOf(b));
}
