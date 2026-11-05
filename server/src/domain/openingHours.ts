// Shop opening hours (decision D-62): pure functions, no database calls. The hours are the same every day, in local
// time (the settings row LOCAL-TIME, Africa/Cairo); a closing time earlier than the opening time means the shop closes
// after midnight. The time zone rules (including summer time) come from the JavaScript Intl data.

export interface OpeningHours {
  /** "HH:MM" */
  opensAt: string;
  /** "HH:MM"; earlier than opensAt = the next day. */
  closesAt: string;
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** How far local time in `timeZone` is ahead of UTC at this instant, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }).formatToParts(new Date(instant));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'));
  return local - Math.floor(instant / MINUTE) * MINUTE;
}

/** The instant of a local wall-clock time; `dayUtc` is midnight UTC of the local calendar day. */
function localTime(dayUtc: number, clock: string, timeZone: string): number {
  const [hours = 0, minutes = 0] = clock.split(':').map(Number);
  const wall = dayUtc + (hours * 60 + minutes) * MINUTE;
  // The offset can change on that day (summer time), so look it up again at the first guess.
  const first = wall - offsetAt(wall, timeZone);
  return wall - offsetAt(first, timeZone);
}

/** Midnight UTC of the local calendar day that contains this instant. */
function localDay(instant: number, timeZone: string): number {
  const local = instant + offsetAt(instant, timeZone);
  return Math.floor(local / DAY) * DAY;
}

/**
 * The opening period that contains `time` (opening time included, closing time not), or null when the shop is
 * closed then. A period that started the day before (after midnight) is found too.
 */
export function openingPeriodFor(
  time: Date,
  hours: OpeningHours,
  timeZone: string,
): { opens: Date; closes: Date } | null {
  const today = localDay(time.getTime(), timeZone);
  const overnight = hours.closesAt <= hours.opensAt;
  for (const day of [today, today - DAY]) {
    const opens = localTime(day, hours.opensAt, timeZone);
    const closes = localTime(overnight ? day + DAY : day, hours.closesAt, timeZone);
    if (opens <= time.getTime() && time.getTime() < closes) {
      return { opens: new Date(opens), closes: new Date(closes) };
    }
  }
  return null;
}
