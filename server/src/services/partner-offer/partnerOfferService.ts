// C-10 Partner Offer Service, IPartnerOffer (SDD 3.2.1): Donation listings offered to charity partners that accept the
// food type within the partner distance; a charity accepts one and proposes a pickup time inside the pickup window
// (FR-RTE-10, E-RTE-03); the first charity wins (E-RTE-04); the charity may cancel, and the Donation is offered again
// while its window is open ("Partner cancels"). US-22, decisions D-108 to D-110. US-24 (FR-RTE-12, D-111): the same
// flow gives Compost offers to composting partners.
import { randomInt } from 'node:crypto';
import { clock } from '../../domain/clock.js';
import { SrsError } from '../../domain/errors.js';
import { getSetting } from '../../data/settingsRepository.js';
import {
  acceptDonation,
  cancelPartnerPickup,
  findEligibleDonation,
  findListingPartnerPickup,
  findPartnerPickup,
  findPartnerType,
  listOpenDonations,
  listPartnerPickups,
  type DonationOffer,
  type PartnerPickupRecord,
} from '../../data/partnerOfferRepository.js';
import { ownListing } from '../listing/listingService.js';
import { radiusMeters } from '../routing/routingService.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new SrsError(404, { error: 'not_found' });

export interface OfferView extends Omit<DonationOffer, 'pickupStart' | 'pickupEnd' | 'distanceMeters'> {
  pickupStart: string;
  pickupEnd: string;
  distanceMeters: number;
}

export interface PartnerPickupView extends Omit<
  PartnerPickupRecord,
  'pickupTime' | 'pickupStart' | 'pickupEnd' | 'partnerId'
> {
  pickupTime: string;
  pickupStart: string;
  pickupEnd: string;
}

const offerView = (offer: DonationOffer): OfferView => ({
  ...offer,
  distanceMeters: Math.round(offer.distanceMeters),
  pickupStart: offer.pickupStart.toISOString(),
  pickupEnd: offer.pickupEnd.toISOString(),
});

export function pickupView(pickup: PartnerPickupRecord): PartnerPickupView {
  return {
    id: pickup.id,
    listingId: pickup.listingId,
    organisationName: pickup.organisationName,
    status: pickup.status,
    listingType: pickup.listingType,
    pickupCode: pickup.pickupCode,
    shopName: pickup.shopName,
    address: pickup.address,
    nameAr: pickup.nameAr,
    nameEn: pickup.nameEn,
    sourceLanguage: pickup.sourceLanguage,
    foodCategory: pickup.foodCategory,
    bags: pickup.bags,
    latitude: pickup.latitude,
    longitude: pickup.longitude,
    pickupTime: pickup.pickupTime.toISOString(),
    pickupStart: pickup.pickupStart.toISOString(),
    pickupEnd: pickup.pickupEnd.toISOString(),
  };
}

/** D-111: charities take Donations (FR-RTE-10) and composting partners Compost offers (FR-RTE-12); "other" neither. */
async function foodPartnerOnly(partnerId: string): Promise<void> {
  const type = await findPartnerType(partnerId);
  if (type !== 'charity' && type !== 'composting') throw new SrsError(403, { error: 'not_food_partner' });
}

/** GET /partner/offers: the Donations this charity can take, nearest first. */
export async function listOffers(partnerId: string): Promise<{ offers: OfferView[] }> {
  await foodPartnerOnly(partnerId);
  const offers = await listOpenDonations(partnerId, clock.now(), await radiusMeters());
  return { offers: offers.map(offerView) };
}

/** GET /partner/offers/:listingId: one Donation this charity can take. */
export async function getOffer(partnerId: string, listingId: string): Promise<OfferView> {
  await foodPartnerOnly(partnerId);
  const offer = UUID.test(listingId)
    ? await findEligibleDonation(partnerId, listingId, clock.now(), await radiusMeters())
    : undefined;
  if (offer === undefined) throw notFound();
  return offerView(offer);
}

async function codeDigits(): Promise<number> {
  const value = (await getSetting('BR-09'))?.value as { digits?: unknown } | null | undefined;
  if (typeof value?.digits !== 'number') throw new Error('Settings row BR-09 is missing or invalid');
  return value.digits;
}

function parseTime(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? null : time;
}

/**
 * POST /partner/offers/:listingId/accept {pickupTime}: E-RTE-03 when the time is not inside the window still to come
 * (from the later of now and the pickup start, to the pickup end); E-RTE-04 when another charity took it first.
 */
export async function acceptOffer(
  partnerId: string,
  listingId: string,
  input: { pickupTime?: unknown },
): Promise<PartnerPickupView> {
  await foodPartnerOnly(partnerId);
  const now = clock.now();
  const offer = UUID.test(listingId)
    ? await findEligibleDonation(partnerId, listingId, now, await radiusMeters())
    : undefined;
  if (offer === undefined) throw notFound();
  const earliest = new Date(Math.max(offer.pickupStart.getTime(), now.getTime()));
  const latest = offer.pickupEnd;
  const pickupTime = parseTime(input.pickupTime);
  if (pickupTime === null || pickupTime < earliest || pickupTime > latest) {
    throw new SrsError(400, {
      error: 'E-RTE-03',
      earliest: earliest.toISOString(),
      latest: latest.toISOString(),
    });
  }
  const digits = await codeDigits();
  const outcome = await acceptDonation(listingId, partnerId, pickupTime, () =>
    String(randomInt(0, 10 ** digits)).padStart(digits, '0'),
  );
  if (outcome.kind === 'taken') throw new SrsError(409, { error: 'E-RTE-04' });
  const pickup = await findPartnerPickup(partnerId, outcome.offerId);
  if (pickup === undefined) throw new Error('Accepted pickup not found');
  return pickupView(pickup);
}

/** GET /partner/pickups: the charity's accepted, completed and cancelled pickups. */
export async function listPickups(partnerId: string): Promise<{ pickups: PartnerPickupView[] }> {
  await foodPartnerOnly(partnerId);
  return { pickups: (await listPartnerPickups(partnerId)).map(pickupView) };
}

/** POST /partner/pickups/:id/cancel: "Partner cancels"; only an Accepted pickup can be cancelled. */
export async function cancelPickup(partnerId: string, offerId: string): Promise<PartnerPickupView> {
  await foodPartnerOnly(partnerId);
  if (!UUID.test(offerId)) throw notFound();
  const outcome = await cancelPartnerPickup(partnerId, offerId, clock.now());
  if (outcome.kind === 'notFound') throw notFound();
  if (outcome.kind === 'notCancellable') {
    throw new SrsError(409, { error: 'pickup_not_cancellable', status: outcome.status });
  }
  const pickup = await findPartnerPickup(partnerId, offerId);
  if (pickup === undefined) throw notFound();
  return pickupView(pickup);
}

/** GET /listings/:id/partner-pickup: the vendor sees which charity collects the Donation, and when. */
export async function listingPartnerPickup(
  vendorId: string,
  listingId: string,
): Promise<{ pickup: PartnerPickupView | null }> {
  await ownListing(vendorId, listingId);
  const pickup = await findListingPartnerPickup(listingId);
  if (pickup === undefined) return { pickup: null };
  // The vendor types the charity's code; they never see it.
  return { pickup: { ...pickupView(pickup), pickupCode: null } };
}
