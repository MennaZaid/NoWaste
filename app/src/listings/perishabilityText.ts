// Wording for the perishability category and listing type (US-18, US-19). IF-UI-05 and NFR-05a: the
// category is shown as how soon to collect the food, never as a statement that the food is safe.
import type { TFunction } from 'i18next';
import type {
  CategoryHours,
  Destination,
  DestinationOption,
  Listing,
  PerishabilityCategory,
} from '@/api/client';

const CATEGORY_KEY: Record<PerishabilityCategory, string> = {
  'Highly perishable': 'HighlyPerishable',
  'Short-life': 'ShortLife',
  'Long-life': 'LongLife',
};

export function categoryText(t: TFunction, category: PerishabilityCategory): string {
  return t(`perishability.categories.${CATEGORY_KEY[category]}`);
}

/**
 * D-70: the category with what it means in hours, for example "Short-life (6 to 48 hours left)". Without the hours
 * (not loaded yet) it is the category alone.
 */
export function categoryWithHours(
  t: TFunction,
  category: PerishabilityCategory,
  hours: CategoryHours | null,
): string {
  const name = categoryText(t, category);
  if (hours === null) return name;
  const meaning =
    category === 'Highly perishable'
      ? t('perishability.hours.highly', { max: hours.highlyPerishableMaxHours })
      : category === 'Short-life'
        ? t('perishability.hours.short', {
            min: hours.highlyPerishableMaxHours,
            max: hours.shortLifeMaxHours,
          })
        : t('perishability.hours.long', { min: hours.shortLifeMaxHours });
  return t('perishability.withHours', { category: name, hours: meaning });
}

const LISTING_TYPE_KEY: Record<NonNullable<Listing['listingType']>, string> = {
  'Discounted Surplus Bag': 'DiscountedSurplusBag',
  Donation: 'Donation',
  'Compost offer': 'CompostOffer',
};

export function listingTypeText(t: TFunction, listingType: NonNullable<Listing['listingType']>): string {
  return t(`routing.listingTypes.${LISTING_TYPE_KEY[listingType]}`);
}

/** The destination a listing type came from (FR-RTE-06), to show which one is chosen. */
export function destinationOf(listingType: Listing['listingType']): Destination | null {
  if (listingType === 'Discounted Surplus Bag') return 'consumers';
  if (listingType === 'Donation') return 'charity';
  if (listingType === 'Compost offer') return 'composting';
  return null;
}

/** The line under a destination: Recommended, the matching partners and the nearest one, or "not available yet". */
export function destinationDescription(
  t: TFunction,
  option: DestinationOption,
  recommended: Destination | null,
): string | undefined {
  const parts = [
    ...(option.destination === recommended ? [t('routing.recommended')] : []),
    ...(option.partners !== null && option.nearestPartnerMeters !== null
      ? [
          t('routing.partners', {
            count: option.partners,
            km: (option.nearestPartnerMeters / 1000).toFixed(1),
          }),
        ]
      : []),
    ...(!option.available ? [t('routing.landfillLater')] : []),
  ];
  return parts.length > 0 ? parts.join(' · ') : undefined;
}
