// C-11 Pickup Code Service, IPickupCode (SDD 3.2.1): the vendor types the customer's code on one of their listings
// (FR-RES-10, E-RES-03, US-33), decision D-101. verify shows which reservation it is and changes nothing; complete hands
// the bag over (Completed, the code Used). A code works only from the pickup start (and the no-card slot start) until
// the pickup end; a wrong, used or ended code gives 409 E-RES-03 with the reason. The digits come from BR-09.
// US-22 (D-110): the same screen takes a charity's code for a Donation; the answer then has `partnerPickup`.
import { parsePickupCode } from '@nowaste/shared';
import { clock } from '../../domain/clock.js';
import { SrsError } from '../../domain/errors.js';
import { completePickup, findCodeOnListing, type CodeMatch } from '../../data/reservationRepository.js';
import { getSetting } from '../../data/settingsRepository.js';
import {
  completePartnerPickup,
  findListingPartnerPickup,
  findPartnerCodeOnListing,
  type PartnerCodeMatch,
} from '../../data/partnerOfferRepository.js';
import { ownListing } from '../listing/listingService.js';
import { pickupView, type PartnerPickupView } from '../partner-offer/partnerOfferService.js';
import { releaseExpiredHolds } from '../reservation/reservationService.js';

export interface ReservationPickupView {
  reservation: { id: string; number: number; method: 'card' | 'no-card'; status: string };
}

/** US-22: a charity collecting a Donation; the vendor never sees the code. */
export interface PartnerPickupAnswer {
  partnerPickup: PartnerPickupView;
}

export type PickupView = ReservationPickupView | PartnerPickupAnswer;

async function codeDigits(): Promise<number> {
  const value = (await getSetting('BR-09'))?.value as { digits?: unknown } | null | undefined;
  if (typeof value?.digits !== 'number') throw new Error('Settings row BR-09 is missing or invalid');
  return value.digits;
}

const refuse = (reason: string, extra: Record<string, unknown> = {}) =>
  new SrsError(409, { error: 'E-RES-03', reason, ...extra });

type Usable = { kind: 'reservation'; match: CodeMatch } | { kind: 'partner'; match: PartnerCodeMatch };

/** D-110: a charity's code; Used gives already_used, Void or a cancelled pickup gives expired. */
function usablePartnerCode(match: PartnerCodeMatch): Usable {
  if (match.codeStatus === 'Used') throw refuse('already_used');
  if (match.codeStatus === 'Void' || match.status !== 'Accepted') throw refuse('expired');
  const now = clock.now();
  if (now.getTime() < match.pickupStart.getTime()) {
    throw refuse('not_started', { startsAt: match.pickupStart.toISOString() });
  }
  if (now.getTime() > match.pickupEnd.getTime()) throw refuse('ended');
  return { kind: 'partner', match };
}

/** The reservation or charity pickup the code belongs to, if it can be handed over now; otherwise E-RES-03. */
async function usableCode(vendorId: string, listingId: string, input: unknown): Promise<Usable> {
  await ownListing(vendorId, listingId);
  const code = parsePickupCode(input, await codeDigits());
  if (code === null) throw new SrsError(400, { error: 'invalid_input', fields: ['code'] });
  // D-93: an ended hold is released (its code made void) before the code is checked.
  await releaseExpiredHolds();
  const match = await findCodeOnListing(listingId, code);
  if (match === undefined) {
    const partner = await findPartnerCodeOnListing(listingId, code);
    if (partner === undefined) throw refuse('wrong_code');
    return usablePartnerCode(partner);
  }
  if (match.codeStatus === 'Used') throw refuse('already_used');
  if (match.codeStatus === 'Void' || (match.status !== 'Held' && match.status !== 'Confirmed')) {
    throw refuse('expired');
  }
  const now = clock.now();
  const startsAt = new Date(Math.max(match.pickupStart.getTime(), match.slotStart?.getTime() ?? 0));
  if (now.getTime() < startsAt.getTime()) throw refuse('not_started', { startsAt: startsAt.toISOString() });
  if (now.getTime() > match.pickupEnd.getTime()) throw refuse('ended');
  return { kind: 'reservation', match };
}

const toView = (match: CodeMatch, status: string): ReservationPickupView => ({
  reservation: { id: match.reservationId, number: match.number, method: match.method, status },
});

async function partnerAnswer(listingId: string): Promise<PartnerPickupAnswer> {
  const pickup = await findListingPartnerPickup(listingId);
  if (pickup === undefined) throw refuse('expired');
  return { partnerPickup: { ...pickupView(pickup), pickupCode: null } };
}

/** POST /listings/:id/pickups/verify {code}: which reservation the code belongs to (nothing changes). */
export async function verifyPickup(vendorId: string, listingId: string, input: unknown): Promise<PickupView> {
  const usable = await usableCode(vendorId, listingId, input);
  if (usable.kind === 'partner') return partnerAnswer(listingId);
  return toView(usable.match, usable.match.status);
}

/** POST /listings/:id/pickups/complete {code}: the bag is handed over (Completed). */
export async function completePickupByCode(
  vendorId: string,
  listingId: string,
  input: unknown,
): Promise<PickupView> {
  const usable = await usableCode(vendorId, listingId, input);
  if (usable.kind === 'partner') {
    if (!(await completePartnerPickup(usable.match.offerId, clock.now()))) throw refuse('already_used');
    return partnerAnswer(listingId);
  }
  if (!(await completePickup(usable.match.reservationId, clock.now()))) throw refuse('already_used');
  return toView(usable.match, 'Completed');
}
