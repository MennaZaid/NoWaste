// BR-10 (decision D-106, SCRUM-73): reads the automatic charity offer minutes from the settings table. The worker job
// that makes the offer (US-23) calls this; the value is never a constant in code.
import { getSetting } from '../../data/settingsRepository.js';

/** BR-10 minutes_before_window_end; throws when the row is missing or not a positive whole number. */
export async function automaticCharityOfferMinutes(): Promise<number> {
  const value = (await getSetting('BR-10'))?.value as
    { minutes_before_window_end?: unknown } | null | undefined;
  const minutes = value?.minutes_before_window_end;
  if (typeof minutes !== 'number' || !Number.isInteger(minutes) || minutes <= 0) {
    throw new Error('Settings row BR-10 is missing or invalid (TBD-5)');
  }
  return minutes;
}
