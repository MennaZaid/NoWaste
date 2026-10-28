// The current time for business rules (for example the NFR-09d lockout window). Tests replace `now` with a fake
// clock, so time-based rules can be checked at exact boundaries.
export const clock = {
  now: (): Date => new Date(),
};
