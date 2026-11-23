// Automatic charity offers, part of the C-10 Partner Offer Service (US-23, FR-RTE-11, D-112). A vendor opts in; the
// worker (C-19) offers the unreserved bags of their consumer listings as a Donation to eligible charities when the
// BR-10 minutes before the pickup end come (automaticOfferDue, D-106). Only when a charity can take the food, so bags
// are not taken away from consumers for nothing. Notifying the vendor by push waits for the push adapter; the vendor
// sees it on the listing.
import { clock } from '../../domain/clock.js';
import { automaticOfferDue } from '../../domain/charityOffer.js';
import { SrsError } from '../../domain/errors.js';
import { findPartnerReach } from '../../data/listingRepository.js';
import {
  findAutoOffer,
  findAutoOfferCandidates,
  moveUnreservedBagsToDonation,
  readAutoCharityOptIn,
  saveAutoCharityOptIn,
} from '../../data/autoCharityOfferRepository.js';
import { ownListing } from '../listing/listingService.js';
import { radiusMeters } from '../routing/routingService.js';
import { automaticCharityOfferMinutes } from './charityOfferRule.js';

/** GET /vendors/me/auto-charity */
export async function getAutoCharityOptIn(vendorId: string): Promise<{ autoCharityOptIn: boolean }> {
  const optIn = await readAutoCharityOptIn(vendorId);
  if (optIn === undefined) throw new Error('No vendor profile for this vendor');
  return { autoCharityOptIn: optIn };
}

/** PATCH /vendors/me/auto-charity {optIn} */
export async function setAutoCharityOptIn(
  vendorId: string,
  value: unknown,
): Promise<{ autoCharityOptIn: boolean }> {
  if (typeof value !== 'boolean') throw new SrsError(400, { error: 'invalid_input', fields: ['optIn'] });
  const optIn = await saveAutoCharityOptIn(vendorId, value);
  if (optIn === undefined) throw new Error('No vendor profile for this vendor');
  return { autoCharityOptIn: optIn };
}

/** Worker job: makes the due automatic charity offers; returns how many were made. */
export async function makeAutomaticCharityOffers(now: Date = clock.now()): Promise<number> {
  const minutes = await automaticCharityOfferMinutes();
  const radius = await radiusMeters();
  let made = 0;
  for (const listing of await findAutoOfferCandidates(now)) {
    if (!automaticOfferDue(listing.pickupStart, listing.pickupEnd, minutes, now)) continue;
    if ((await findPartnerReach(listing.id, 'charity', radius)).partners === 0) continue;
    if (await moveUnreservedBagsToDonation(listing.id, now)) made += 1;
  }
  return made;
}

/** GET /listings/:id/auto-charity: whether the listing's unreserved bags were offered to charities. */
export async function listingAutoOffer(
  vendorId: string,
  listingId: string,
): Promise<{ offer: { offeredAt: string; bags: number; donationListingId: string } | null }> {
  await ownListing(vendorId, listingId);
  const offer = await findAutoOffer(listingId);
  return {
    offer:
      offer === undefined
        ? null
        : {
            offeredAt: offer.offeredAt.toISOString(),
            bags: offer.bags,
            donationListingId: offer.donationListingId,
          },
  };
}
