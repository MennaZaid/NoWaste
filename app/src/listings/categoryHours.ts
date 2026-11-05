// D-70: what each perishability category means in hours, from the server (the BR-01 settings row, never constants in
// the app). Read once per app run and shared by every screen that shows a category.
import { useEffect, useState } from 'react';
import { getCategoryHours, type CategoryHours } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';

let cached: CategoryHours | null = null;

/** The hours of each category, or null until they arrive (the screens then show the category alone). */
export function useCategoryHours(): CategoryHours | null {
  const { token } = useAuth();
  const [hours, setHours] = useState<CategoryHours | null>(cached);

  useEffect(() => {
    if (cached !== null || token === null) return;
    let active = true;
    // A screen without the hours still works, so any failure only leaves them out.
    void Promise.resolve()
      .then(() => getCategoryHours(token))
      .then((result) => {
        if (result.kind !== 'ok') return;
        cached = result.hours;
        if (active) setHours(result.hours);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token]);

  return hours;
}

/** For tests: forget the hours read before. */
export function resetCategoryHours(): void {
  cached = null;
}
