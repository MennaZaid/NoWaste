// A date and time in the reading language, for example "Sun 1 Nov, 12:00" or "الأحد ١ نوفمبر، ١٢:٠٠".
export function formatDateTime(iso: string, language: 'ar' | 'en'): string {
  return new Date(iso).toLocaleString(language === 'ar' ? 'ar-EG' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
