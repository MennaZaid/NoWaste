// C-18 Notification Service, INotification (SDD 3.2.1): builds the consumer's notifications (FR-RES-11): a reservation
// confirmed, a reservation released, a waitlisted bag offered (US-29) and the pickup window open. Decision D-121
// (option A, 2026-11-28): every notification is kept and listed in the app (IF-SW-06); it is also handed to the Push
// Adapter (C-25), which stays off until a development build exists (D-118). The data holds ids, names and times only;
// the phone writes the text in its language (NFR-06). A failure here never stops the reservation flow.
import { getPush, type PushKind } from '../../adapters/push/push.js';
import { clock } from '../../domain/clock.js';
import {
  countUnread,
  findListingFacts,
  findReservationFacts,
  insertNotification,
  listNotifications,
  markAllRead,
  takeWindowOpenDue,
  type ListingFacts,
  type NotificationRecord,
} from '../../data/notificationRepository.js';

const LIST_LIMIT = 50;

function factsData(facts: ListingFacts): Record<string, string> {
  return {
    listingId: facts.listingId,
    shopName: facts.shopName,
    ...(facts.nameAr === null ? {} : { nameAr: facts.nameAr }),
    ...(facts.nameEn === null ? {} : { nameEn: facts.nameEn }),
  };
}

async function send(userId: string, kind: PushKind, data: Record<string, string>): Promise<void> {
  try {
    await insertNotification(userId, kind, data, clock.now());
    await getPush().send(userId, { kind, data });
  } catch (error) {
    console.error(`notification: ${kind} failed`, error instanceof Error ? error.message : 'unknown');
  }
}

async function aboutReservation(reservationId: string, kind: PushKind): Promise<void> {
  const facts = await findReservationFacts(reservationId).catch(() => undefined);
  if (facts === undefined) return;
  await send(facts.consumerId, kind, { reservationId, ...factsData(facts) });
}

/** FR-RES-11: a no-card hold was made, or a card payment approved. */
export function notifyReservationConfirmed(reservationId: string): Promise<void> {
  return aboutReservation(reservationId, 'reservation_confirmed');
}

/** FR-RES-11: the hold ran out and the bag was released (FR-RES-05). */
export async function notifyReservationsReleased(reservationIds: readonly string[]): Promise<void> {
  for (const id of reservationIds) await aboutReservation(id, 'reservation_released');
}

/** FR-RES-11, US-29: a freed bag is set aside for this consumer until offerExpiresAt (BR-05). */
export async function notifyWaitlistOffer(
  consumerId: string,
  offer: { entryId: string; listingId: string; offerExpiresAt: Date },
): Promise<void> {
  const facts = await findListingFacts(offer.listingId).catch(() => undefined);
  await send(consumerId, 'waitlist_offer', {
    entryId: offer.entryId,
    offerExpiresAt: offer.offerExpiresAt.toISOString(),
    ...(facts === undefined ? { listingId: offer.listingId } : factsData(facts)),
  });
}

/** Worker job (FR-RES-11, SDD 5.5 "Pickup window opens"): tells each consumer once that their bag is ready. */
export async function makeWindowOpenNotifications(now: Date = clock.now()): Promise<number> {
  const due = await takeWindowOpenDue(now);
  for (const id of due) await aboutReservation(id, 'window_open');
  return due.length;
}

export interface NotificationView {
  id: string;
  kind: NotificationRecord['kind'];
  data: Record<string, string>;
  createdAt: string;
  read: boolean;
}

/** GET /notifications: the latest notifications, newest first, and how many are unread. */
export async function myNotifications(
  userId: string,
): Promise<{ notifications: NotificationView[]; unreadCount: number }> {
  const rows = await listNotifications(userId, LIST_LIMIT);
  return {
    notifications: rows.map((n) => ({
      id: n.id,
      kind: n.kind,
      data: n.data,
      createdAt: n.createdAt.toISOString(),
      read: n.readAt !== null,
    })),
    unreadCount: await countUnread(userId),
  };
}

/** POST /notifications/read: everything is read. */
export async function readAll(userId: string): Promise<{ unreadCount: number }> {
  await markAllRead(userId, clock.now());
  return { unreadCount: 0 };
}
