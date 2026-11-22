// Unit tests for @nowaste/shared, the one validator used by both the app and the server (US-01).
// Password rules: decision D-11 (TBD-4). Phone format: decision D-12.
import {
  ramadanHighlight,
  validateRamadanTimes,
  PASSWORD_RULES,
  checkPasswordRules,
  isValidEmail,
  isValidPassword,
  normalizeEgyptianMobile,
  pickupStartProblem,
  validateApplication,
  validateRejection,
  validateCardInput,
  validateRegistration,
} from '@nowaste/shared';

describe('E-ACC-02 shared password rules', () => {
  test('E-ACC-02 the minimum password length is 8 characters', () => {
    expect(PASSWORD_RULES.minLength).toBe(8);
  });

  test('E-ACC-02 checkPasswordRules reports each rule separately', () => {
    expect(checkPasswordRules('abc')).toEqual({ minLength: false, hasLetter: true, hasDigit: false });
    expect(checkPasswordRules('12345678')).toEqual({ minLength: true, hasLetter: false, hasDigit: true });
    expect(checkPasswordRules('abcd1234')).toEqual({ minLength: true, hasLetter: true, hasDigit: true });
  });

  test.each([
    ['abc1234', false],
    ['abcd1234', true],
    ['abcdefgh', false],
    ['12345678', false],
    ['كلمةسر١٢', true],
    ['كلمةسرطويلة', false],
    ['', false],
  ])('E-ACC-02 isValidPassword(%j) is %s', (password, expected) => {
    expect(isValidPassword(password)).toBe(expected);
  });

  test('E-ACC-02 a password that is not a string is invalid', () => {
    expect(isValidPassword(undefined)).toBe(false);
    expect(isValidPassword(12345678)).toBe(false);
  });
});

describe('E-ACC-02 shared email and phone rules', () => {
  test.each([
    ['mona@example.com', true],
    ['  mona@example.com  ', true],
    ['userexample.com', false],
    ['mona@example', false],
    ['mona @example.com', false],
    ['', false],
  ])('E-ACC-02 isValidEmail(%j) is %s', (email, expected) => {
    expect(isValidEmail(email)).toBe(expected);
  });

  test.each([
    ['01012345678', '+201012345678'],
    ['01112345678', '+201112345678'],
    ['01212345678', '+201212345678'],
    ['01512345678', '+201512345678'],
    [' 01012345678 ', '+201012345678'],
    ['٠١٠١٢٣٤٥٦٧٨', '+201012345678'],
    ['۰۱۰۱۲۳۴۵۶۷۸', '+201012345678'],
    ['01312345678', null],
    ['0101234567', null],
    ['010123456789', null],
    ['+201012345678', null],
    ['010 1234 5678', null],
  ])('E-ACC-02 normalizeEgyptianMobile(%j) is %j', (phone, expected) => {
    expect(normalizeEgyptianMobile(phone)).toBe(expected);
  });
});

describe('E-ACC-02 validateRegistration lists every invalid field', () => {
  test('E-ACC-02 neither email nor phone marks both fields', () => {
    expect(validateRegistration({ password: 'abcd1234', language: 'en' })).toEqual({
      ok: false,
      fields: ['email', 'phone'],
    });
  });

  test('E-ACC-02 every invalid field is listed in order', () => {
    expect(validateRegistration({ email: 'bad', phone: '013', password: 'x', language: 'fr' })).toEqual({
      ok: false,
      fields: ['email', 'phone', 'password', 'language'],
    });
  });

  test('FR-ACC-01 a valid registration is returned trimmed and with the phone in +20 form', () => {
    expect(
      validateRegistration({
        email: ' Mona@Example.com ',
        phone: '01012345678',
        password: 'abcd1234',
        language: 'ar',
      }),
    ).toEqual({
      ok: true,
      value: { email: 'Mona@Example.com', phone: '+201012345678', password: 'abcd1234', language: 'ar' },
    });
  });
});

// D-99 (Maryam, 2026-11-16): the card form of the pretend bank: an 8-digit number, the expiry as MM/YY and a 3-digit
// CVV. Only the format is checked here; whether the card exists, is expired or has money is the bank's answer.
describe('FR-RES-02 D-99 shared card format', () => {
  test('FR-RES-02 a well-formed card is returned with the expiry taken apart', () => {
    expect(validateCardInput({ number: ' 4000 0000 ', expiry: '12/30', cvv: '123' })).toEqual({
      ok: true,
      value: { number: '40000000', expiryMonth: 12, expiryYear: 2030, cvv: '123' },
    });
  });

  test('FR-RES-02 digits typed on an Arabic keyboard are accepted', () => {
    expect(validateCardInput({ number: '٤٠٠٠٠٠٠٠', expiry: '١٢/٣٠', cvv: '١٢٣' })).toMatchObject({
      ok: true,
      value: { number: '40000000', cvv: '123' },
    });
  });

  test.each([
    ['a 7-digit number', { number: '4000000' }, ['number']],
    ['a 9-digit number', { number: '400000000' }, ['number']],
    ['letters in the number', { number: '4000abcd' }, ['number']],
    ['month 13', { expiry: '13/30' }, ['expiry']],
    ['month 00', { expiry: '00/30' }, ['expiry']],
    ['no slash', { expiry: '1230' }, ['expiry']],
    ['a 2-digit CVV', { cvv: '12' }, ['cvv']],
    ['a 4-digit CVV', { cvv: '1234' }, ['cvv']],
    [
      'everything missing',
      { number: undefined, expiry: undefined, cvv: undefined },
      ['number', 'expiry', 'cvv'],
    ],
  ])('E-RES-01 %s is refused', (_case, change, fields) => {
    expect(validateCardInput({ number: '40000000', expiry: '12/30', cvv: '123', ...change })).toEqual({
      ok: false,
      fields,
    });
  });
});

describe('E-LST-04 D-104 shared pickup start limits', () => {
  const now = Date.parse('2026-11-17T10:00:00.000Z');
  const rule = { maxDaysAhead: 7, pastGraceMinutes: 5 };
  const minutes = (n: number) => now + n * 60_000;

  test.each([
    ['now', 0, null],
    ['4 minutes ago (within the grace)', -4, null],
    ['exactly 5 minutes ago', -5, null],
    ['6 minutes ago', -6, 'past'],
    ['ten days ago', -10 * 24 * 60, 'past'],
    ['exactly 7 days ahead', 7 * 24 * 60, null],
    ['7 days and a minute ahead', 7 * 24 * 60 + 1, 'too_far'],
  ])('E-LST-04 D-104 a start %s gives %s', (_name, offset, expected) => {
    expect(pickupStartProblem(minutes(offset), now, rule)).toBe(expected);
  });
});

describe('FR-ACC-07 D-105 shared rejection reason', () => {
  test.each(['wrong_location', 'wrong_contact', 'not_food_business', 'duplicate_account'])(
    'FR-ACC-07 D-105 %s is accepted without a note',
    (reason) => {
      expect(validateRejection({ reason })).toEqual({ ok: true, value: { reason, note: null } });
    },
  );

  test('FR-ACC-07 D-105 the note is trimmed and kept', () => {
    expect(validateRejection({ reason: 'wrong_contact', note: '  Call us  ' })).toEqual({
      ok: true,
      value: { reason: 'wrong_contact', note: 'Call us' },
    });
  });

  test.each([
    ['no reason', {}, ['reason']],
    ['an unknown reason', { reason: 'x' }, ['reason']],
    ['Other without a note', { reason: 'other' }, ['note']],
    ['Other with a blank note', { reason: 'other', note: '  ' }, ['note']],
    ['a note that is not text', { reason: 'wrong_location', note: 5 }, ['note']],
    ['a note over 300 characters', { reason: 'wrong_location', note: 'x'.repeat(301) }, ['note']],
  ])('FR-ACC-07 D-105 %s is refused', (_name, input, fields) => {
    expect(validateRejection(input)).toEqual({ ok: false, fields });
  });
});

describe('FR-ACC-02 FR-ACC-03 D-105 shared application check (sign-up and sending again)', () => {
  test('FR-ACC-02 D-105 a vendor application without login details is checked like the sign-up', () => {
    const result = validateApplication({
      role: 'vendor',
      vendorProfile: {
        shopName: ' Fatma ',
        vendorType: 'formal',
        address: 'Dokki',
        latitude: 30,
        longitude: 31,
        contact: '01012345678',
        opensAt: '08:00',
        closesAt: '20:00',
      },
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        role: 'vendor',
        vendorProfile: { shopName: 'Fatma', contact: '+201012345678' },
        partnerProfile: null,
      },
    });
  });

  test('E-ACC-02 D-105 an invalid partner application lists its fields', () => {
    expect(validateApplication({ role: 'charity', partnerProfile: {} })).toMatchObject({ ok: false });
    expect(validateApplication({ role: 'consumer' })).toEqual({ ok: false, fields: ['role'] });
  });
});

describe('FR-TGI-08 D-107 Ramadan rules (shared)', () => {
  const moments = { iftarAt: '2026-11-21T15:05:00Z', suhoorAt: '2026-11-22T01:30:00Z' };

  test.each([
    ['a window ending in the 2 hours before iftar', '2026-11-21T12:00:00Z', '2026-11-21T13:30:00Z', 'iftar'],
    [
      'a window that starts before and ends after iftar',
      '2026-11-21T14:30:00Z',
      '2026-11-21T16:00:00Z',
      'iftar',
    ],
    ['a window in the 2 hours before suhoor', '2026-11-21T23:45:00Z', '2026-11-22T00:30:00Z', 'suhoor'],
    ['a morning window', '2026-11-21T07:00:00Z', '2026-11-21T09:00:00Z', null],
    ['a window ending exactly when the lead starts', '2026-11-21T11:00:00Z', '2026-11-21T13:05:00Z', null],
    ['a window that starts at iftar', '2026-11-21T15:05:00Z', '2026-11-21T17:00:00Z', null],
  ])('FR-TGI-08 %s is highlighted as %s', (_name, start, end, meal) => {
    expect(ramadanHighlight(start, end, moments, 120)).toBe(meal);
  });

  test('FR-TGI-08 Ramadan times accept Arabic-Indic digits and must differ', () => {
    expect(validateRamadanTimes({ iftar: '١٧:٠٥', suhoor: '3:30' })).toEqual({
      ok: true,
      value: { iftar: '17:05', suhoor: '03:30' },
    });
    expect(validateRamadanTimes({ iftar: '17:05', suhoor: '17:05' })).toEqual({
      ok: false,
      fields: ['suhoor'],
    });
    expect(validateRamadanTimes(null)).toEqual({ ok: false, fields: ['iftar', 'suhoor'] });
  });
});
