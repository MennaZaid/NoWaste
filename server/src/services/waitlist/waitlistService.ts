// C-10 Waitlist Service, IWaitlist (SDD 3.2.1, 5.3): join(listingId, consumerId), offerNext, accept, expireOffer.
// US-29 (FR-RES-05, FR-RES-06, E-RES-02, BR-04, BR-05), decisions D-117 to D-119. A consumer joins when every bag is
// reserved; a freed bag is set aside for the first person waiting when at least BR-04 minutes of the pickup remain,
// for BR-05 minutes; they accept with the normal card or no-card reservation (POST /reservations with
// waitlistEntryId), decline, or let it expire, and it passes to the next person. The offer is shown in the app; push
// waits for a development build (D-118).
import { clock } from '../../domain/clock.js';
import { SrsError } from '../../domain/errors.js';
import { getSetting } from '../../data/settingsRepository.js';
import { notifyWaitlistOffer } from '../notification/notificationService.js';
import {
  declineOffer,
  expireOffers,
  findEntry,
  joinWaitlist,
  leaveWaitlist,
  listEntries,
  offerFreeBags,
  type WaitlistEntryRecord,
} from '../../data/waitlistRepository.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new SrsError(404, { error: 'not_found' });

async function settingNumber(key: string, field: string): Promise<number> {
  const value = ((await getSetting(key))?.value as Record<string, unknown> | null | undefined)?.[field];
  if (typeof value !== 'number' || value < 0) throw new Error(`Settings row ${key} is missing or invalid`);
  return value;
}

export interface WaitlistEntryView {
  id: string;
  listingId: string;
  status: WaitlistEntryRecord['status'];
  position: number | null;
  offerExpiresAt: string | null;
  createdAt: string;
  listing: {
    nameAr: string | null;
    nameEn: string | null;
    sourceLanguage: 'ar' | 'en' | null;
    price: number;
    pickupStart: string;
    pickupEnd: string;
    shopName: string;
  };
}

function toView(entry: WaitlistEntryRecord): WaitlistEntryView {
  return {
    id: entry.id,
    listingId: entry.listingId,
    status: entry.status,
    position: entry.position,
    offerExpiresAt: entry.offerExpiresAt?.toISOString() ?? null,
    createdAt: entry.createdAt.toISOString(),
    listing: {
      ...entry.listing,
      pickupStart: entry.listing.pickupStart.toISOString(),
      pickupEnd: entry.listing.pickupEnd.toISOString(),
    },
  };
}

/**
 * Worker job and before every read (like D-93): expires offers not accepted in time (BR-05) and offers every free
 * bag to the next person waiting (BR-04, BR-05). Returns how many new offers were made.
 */
export async function runWaitlist(now: Date = clock.now()): Promise<number> {
  const minMinutes = await settingNumber('BR-04', 'min_minutes_remaining');
  const acceptMinutes = await settingNumber('BR-05', 'accept_minutes');
  await expireOffers(now);
  const offers = await offerFreeBags(now, minMinutes, acceptMinutes);
  // D-118: the person is told by push when a push mode is on; the app also shows the offer.
  for (const offer of offers) await notifyWaitlistOffer(offer.consumerId, offer);
  return offers.length;
}

async function viewOf(id: string, consumerId: string): Promise<WaitlistEntryView> {
  const entry = await findEntry(id, consumerId);
  if (entry === undefined) throw notFound();
  return toView(entry);
}

/** POST /listings/nearby/:id/waitlist: 201 the place; 409 bags_available or already_waiting (FR-RES-06). */
export async function join(consumerId: string, listingId: string): Promise<WaitlistEntryView> {
  if (!UUID.test(listingId)) throw notFound();
  await runWaitlist();
  const outcome = await joinWaitlist(listingId, consumerId, clock.now());
  if (outcome.kind === 'notFound') throw notFound();
  if (outcome.kind === 'bagsAvailable') throw new SrsError(409, { error: 'bags_available' });
  if (outcome.kind === 'alreadyWaiting') throw new SrsError(409, { error: 'already_waiting' });
  return viewOf(outcome.id, consumerId);
}

/** GET /waitlist: the consumer's places and offers (D-118: the offer is shown in the app). */
export async function myEntries(consumerId: string): Promise<{ entries: WaitlistEntryView[] }> {
  await runWaitlist();
  return { entries: (await listEntries(consumerId, clock.now())).map(toView) };
}

/** POST /waitlist/:id/leave (D-119): only while Waiting; 409 not_waiting otherwise. */
export async function leave(consumerId: string, id: string): Promise<WaitlistEntryView> {
  if (!UUID.test(id)) throw notFound();
  const status = await leaveWaitlist(id, consumerId);
  if (status === undefined) throw notFound();
  if (status !== 'Waiting') throw new SrsError(409, { error: 'not_waiting', status });
  return viewOf(id, consumerId);
}

/** POST /waitlist/:id/decline (D-119): the bag passes to the next person at once; 409 not_offered otherwise. */
export async function decline(consumerId: string, id: string): Promise<WaitlistEntryView> {
  if (!UUID.test(id)) throw notFound();
  await runWaitlist();
  const status = await declineOffer(id, consumerId);
  if (status === undefined) throw notFound();
  if (status !== 'Offered') throw new SrsError(409, { error: 'not_offered', status });
  await runWaitlist();
  return viewOf(id, consumerId);
}
