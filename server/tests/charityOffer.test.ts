// SCRUM-73 (TBD-5, decision D-106): the automatic charity offer is made 60 minutes before the pickup window ends
// (BR-10, FR-RTE-11). The settings tests run against nowaste_test after `npm run migrate:test`.
import { closePool } from '../src/data/db.js';
import { getSetting } from '../src/data/settingsRepository.js';
import { automaticOfferDue, automaticOfferTime } from '../src/domain/charityOffer.js';
import { automaticCharityOfferMinutes } from '../src/services/partner-offer/charityOfferRule.js';

afterAll(async () => {
  await closePool();
});

const at = (time: string) => new Date(`2026-11-21T${time}:00+02:00`);

describe('BR-10 TBD-5 automatic charity offer time', () => {
  test('BR-10 the settings row says 60 minutes before the window ends', async () => {
    await expect(automaticCharityOfferMinutes()).resolves.toBe(60);
  });

  test('BR-10 the TBD-5 row records the same decided value', async () => {
    expect((await getSetting('TBD-5'))?.value).toEqual({ minutes_before_window_end: 60 });
  });

  test('FR-RTE-11 a 17:00 to 21:00 window is offered to charities at 20:00', () => {
    expect(automaticOfferTime(at('17:00'), at('21:00'), 60)).toEqual(at('20:00'));
  });

  test('FR-RTE-11 a window shorter than 60 minutes is offered at its start', () => {
    expect(automaticOfferTime(at('20:30'), at('21:00'), 60)).toEqual(at('20:30'));
  });

  test.each([
    ['19:59', false],
    ['20:00', true],
    ['20:59', true],
    ['21:00', false],
  ])('FR-RTE-11 at %s the offer is due: %s', (time, due) => {
    expect(automaticOfferDue(at('17:00'), at('21:00'), 60, at(time))).toBe(due);
  });
});
