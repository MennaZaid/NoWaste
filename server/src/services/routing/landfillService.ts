// US-25 Landfill record (FR-RTE-13, decision D-117), part of the C-07 Routing Service: landfill is the last resort
// (FR-RTE-05). When the pickup window has ended and no consumer, charity or composting partner took the food, the
// vendor records the bags left as a landfill disposal, once; it is counted in the impact numbers (US-44).
import { recordLandfill } from '../../data/landfillRepository.js';
import { clock } from '../../domain/clock.js';
import { SrsError } from '../../domain/errors.js';
import { ownListing } from '../listing/listingService.js';

export interface LandfillView {
  bags: number;
  recordedAt: string;
}

/** POST /listings/:id/landfill: 201 {bags, recordedAt}. */
export async function recordLandfillDisposal(vendorId: string, id: string): Promise<LandfillView> {
  const listing = await ownListing(vendorId, id);
  // Only food that was offered: a Draft was never published and a Cancelled listing was withdrawn.
  if (listing.status === 'Draft' || listing.status === 'Cancelled') {
    throw new SrsError(409, { error: 'listing_not_published', status: listing.status });
  }
  const now = clock.now();
  if (listing.pickupEnd.getTime() > now.getTime()) throw new SrsError(409, { error: 'pickup_not_ended' });
  const result = await recordLandfill(listing.id, now);
  switch (result.kind) {
    case 'recorded':
      return { bags: result.record.bags, recordedAt: result.record.recordedAt.toISOString() };
    case 'alreadyRecorded':
      throw new SrsError(409, { error: 'landfill_already_recorded' });
    case 'takenByPartner':
      throw new SrsError(409, { error: 'taken_by_partner' });
    case 'nothingLeft':
      throw new SrsError(409, { error: 'nothing_left' });
  }
}
