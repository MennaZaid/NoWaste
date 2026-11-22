// US-45 Ramadan mode (FR-TGI-08, decision D-107): the next iftar and suhoor as moments in time, from the "HH:MM" times
// the administrator sets in the settings row FR-TGI-08 and its time zone (Africa/Cairo).
const MINUTE = 60_000;

/** The offset of `timeZone` from UTC at `at`, in minutes (Cairo: +120, or +180 in summer time). */
function offsetMinutes(at: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? '');
  if (match === null) return 0; // "GMT" alone means UTC.
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/** The local calendar date (year, month, day) in `timeZone` at `at`. */
function localDate(at: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .formatToParts(at)
    .reduce<Record<string, string>>((all, part) => ({ ...all, [part.type]: part.value }), {});
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) };
}

/** The moment the wall-clock time `hhmm` happens on the local date that is `dayOffset` days after `now`'s. */
function wallClock(now: Date, hhmm: string, timeZone: string, dayOffset: number): Date {
  const { year, month, day } = localDate(now, timeZone);
  const [hours = 0, minutes = 0] = hhmm.split(':').map(Number);
  const asUtc = Date.UTC(year, month - 1, day + dayOffset, hours, minutes);
  // Correct by the offset at that moment, so a change to or from summer time is handled.
  const guess = new Date(asUtc - offsetMinutes(new Date(asUtc), timeZone) * MINUTE);
  return new Date(asUtc - offsetMinutes(guess, timeZone) * MINUTE);
}

/** The next time `hhmm` comes in `timeZone`, strictly after `now` (today if still ahead, otherwise tomorrow). */
export function nextOccurrence(now: Date, hhmm: string, timeZone: string): Date {
  const today = wallClock(now, hhmm, timeZone, 0);
  return today.getTime() > now.getTime() ? today : wallClock(now, hhmm, timeZone, 1);
}
