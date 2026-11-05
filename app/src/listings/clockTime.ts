// Times of day "HH:MM" for shop opening hours (D-62), read from and given to the phone's time picker.

/** The time of day of a picked date, as "HH:MM" (24-hour clock, the phone's local time). */
export function clockTimeOf(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Today at the given "HH:MM" (or 09:00 when there is none yet), to start the time picker on. */
export function dateAtClockTime(time: string | null): Date {
  const [hours = 9, minutes = 0] = (time ?? '09:00').split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/** The message key for an invalid opening or closing time (D-62): missing, equal to the other, or not a time. */
export function hoursErrorKey(field: 'opensAt' | 'closesAt', opensAt: string, closesAt: string): string {
  if (field === 'opensAt') return opensAt.trim() === '' ? 'errors.opensAtRequired' : 'errors.opensAtInvalid';
  if (closesAt.trim() === '') return 'errors.closesAtRequired';
  return closesAt.trim() === opensAt.trim() ? 'errors.closesAtSame' : 'errors.closesAtInvalid';
}
