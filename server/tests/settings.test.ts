// Checks that the first migration seeded the settings table with the exact SRS 5.5 values.
// Runs against the real nowaste_test database after `npm run migrate:test`.
import { getSetting } from '../src/data/settingsRepository.js';
import { closePool } from '../src/data/db.js';

afterAll(async () => {
  await closePool();
});

const expected: Array<[string, unknown]> = [
  ['BR-01', { highly_perishable_max_hours: 6, short_life_max_hours: 48 }],
  // BR-02 and BR-03 were changed from 45 and 20 minutes by decision D-89 (2026-11-14).
  ['BR-02', { hold_minutes: 15 }],
  ['BR-03', { check_ins_allowed: 1, extension_minutes: 10 }],
  ['BR-04', { min_minutes_remaining: 30 }],
  ['BR-05', { accept_minutes: 10 }],
  ['BR-06', { full_refund_within_minutes: 10 }],
  ['BR-07', { no_shows: 3, within_days: 30, block_days: 14 }],
  ['BR-08', { no_shows: 3, within_days: 30 }],
  ['BR-09', { digits: 6 }],
  // BR-10 was decided as 60 minutes by D-106 (TBD-5, 2026-11-21).
  ['BR-10', { minutes_before_window_end: 60 }],
  ['BR-11', { refund: 'full' }],
  ['BR-12', { ai_draft_time_limit_seconds: 10 }],
];

describe('settings table (SRS 5.5 business rules)', () => {
  test.each(expected)('%s settings row holds the SRS 5.5 value', async (key, value) => {
    const row = await getSetting(key);

    expect(row).toBeDefined();
    expect(row?.value).toEqual(value);
    expect(row?.source).toContain(`SRS 5.5 ${key}`);
  });

  test.each([
    ['BR-02', 'No-card hold: 15 minutes'],
    ['BR-03', '+10 minutes'],
  ])('%s D-89 the settings row describes the shorter time', async (key, text) => {
    const row = await getSetting(key);

    expect(row?.description).toContain(text);
    expect(row?.source).toContain('D-89');
  });

  test('E-LST-04 D-104 settings row LISTING-START holds the pickup start limits', async () => {
    const row = await getSetting('LISTING-START');

    expect(row?.value).toEqual({ max_days_ahead: 7, past_grace_minutes: 5 });
    expect(row?.source).toContain('D-104');
  });

  // TBD-5 was open (value null) until D-106 decided it on 2026-11-21.
  test('BR-10 TBD-5 D-106 the TBD-5 row is decided as 60 minutes and BR-10 matches it', async () => {
    const tbd5 = await getSetting('TBD-5');
    const br10 = await getSetting('BR-10');

    expect(tbd5?.value).toEqual({ minutes_before_window_end: 60 });
    expect(br10?.value).toEqual(tbd5?.value);
    expect(tbd5?.source).toContain('D-106');
    expect(br10?.source).toContain('D-106');
  });
});
