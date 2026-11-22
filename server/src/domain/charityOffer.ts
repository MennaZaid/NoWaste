// FR-RTE-11 / BR-10 (decision D-106, SCRUM-73): when the automatic charity offer is made for a listing. The minutes
// come from the BR-10 settings row; this file only does the time arithmetic. The offer itself is US-23.
const MINUTE = 60_000;

/** The moment unreserved bags are offered to charity partners: `minutesBefore` before the pickup window ends,
 * but never before the window starts (a window shorter than the lead is offered at its start). */
export function automaticOfferTime(pickupStart: Date, pickupEnd: Date, minutesBefore: number): Date {
  return new Date(Math.max(pickupEnd.getTime() - minutesBefore * MINUTE, pickupStart.getTime()));
}

/** True once the automatic offer time has come and the pickup window has not ended. */
export function automaticOfferDue(
  pickupStart: Date,
  pickupEnd: Date,
  minutesBefore: number,
  now: Date,
): boolean {
  return (
    now.getTime() >= automaticOfferTime(pickupStart, pickupEnd, minutesBefore).getTime() &&
    now.getTime() < pickupEnd.getTime()
  );
}
