// NFR-06: in Arabic every number is shown with Arabic-Indic digits (asked for by Maryam on 2026-11-04, decision D-67);
// in English the digits stay as they are.
import i18n from '@/i18n';
import { localDigits } from '@/i18n/digits';
import { formatDateTime } from '@/listings/formatDateTime';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

describe('NFR-06 D-67 localDigits', () => {
  test.each<[string | number, string]>([
    [0, '٠'],
    [40, '٤٠'],
    [1234567890, '١٢٣٤٥٦٧٨٩٠'],
    [12.5, '١٢٫٥'],
    ['09:00', '٠٩:٠٠'],
    ['Pin: 30.05000, 31.25000', 'Pin: ٣٠٫٠٥٠٠٠, ٣١٫٢٥٠٠٠'],
    ['no digits', 'no digits'],
  ])('NFR-06 %j in Arabic is %j', (value, expected) => {
    expect(localDigits(value, 'ar')).toBe(expected);
  });

  test.each<[string | number, string]>([
    [40, '40'],
    [12.5, '12.5'],
    ['09:00', '09:00'],
  ])('NFR-06 %j in English stays %j', (value, expected) => {
    expect(localDigits(value, 'en')).toBe(expected);
  });

  test('NFR-06 Arabic-Indic digits are left as they are', () => {
    expect(localDigits('٤٠', 'ar')).toBe('٤٠');
  });
});

describe('NFR-06 D-67 every Arabic text shows Arabic digits', () => {
  test('NFR-06 a price, a distance and opening hours in Arabic use Arabic digits', async () => {
    await i18n.changeLanguage('ar');

    expect(i18n.t('listing.egp', { amount: 40 })).toBe('٤٠ جنيه');
    expect(i18n.t('offers.km', { km: 10 })).toBe('١٠ كم');
    expect(i18n.t('listing.shopHours', { opensAt: '09:00', closesAt: '22:00' })).toMatch(/٠٩:٠٠.*٢٢:٠٠/);
  });

  test('NFR-06 the same texts in English keep Western digits', async () => {
    await i18n.changeLanguage('en');

    expect(i18n.t('listing.egp', { amount: 40 })).toBe('40 EGP');
    expect(i18n.t('offers.km', { km: 10 })).toBe('10 km');
  });

  test('NFR-06 dates and times in Arabic use Arabic digits', () => {
    expect(formatDateTime('2026-11-01T10:00:00.000Z', 'ar')).not.toMatch(/[0-9]/);
    expect(formatDateTime('2026-11-01T10:00:00.000Z', 'ar')).toMatch(/[٠-٩]/);
  });
});
