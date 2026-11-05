// The password rules under the password field show their complete text in both languages (US-01, D-11).
// Regression tests for the manual Expo Go finding of 2026-10-24: in English the phone showed
// "At least one" instead of "At least one letter" / "At least one number".
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from 'expo-router/testing-library';
import ar from '../src/i18n/ar.json';
import en from '../src/i18n/en.json';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  registerConsumer: jest.fn(),
}));

const english = {
  title: 'Your password needs:',
  rules: ['At least 8 characters', 'At least one letter', 'At least one number'],
};

const arabic = {
  title: 'يجب أن تحتوي كلمة المرور على:',
  // D-67: numbers in Arabic texts use Arabic digits.
  rules: ['٨ أحرف على الأقل', 'حرف واحد على الأقل', 'رقم واحد على الأقل'],
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

async function openRegister(language: 'en' | 'ar') {
  await renderApp('/register');
  await screen.findByTestId('register-password');
  if (language === 'ar') {
    await fireEvent.press(screen.getByRole('button', { name: 'العربية' }));
    await screen.findByText(arabic.title);
  }
}

describe('NFR-06 password rule texts are complete in both languages', () => {
  test('NFR-06 the translation files hold the full password rule texts', () => {
    expect(en.register.rulesTitle).toBe(english.title);
    expect([en.register.ruleMinLength, en.register.ruleLetter, en.register.ruleDigit]).toEqual([
      'At least {{count}} characters',
      'At least one letter',
      'At least one number',
    ]);
    expect(ar.register.rulesTitle).toBe(arabic.title);
    expect([ar.register.ruleMinLength, ar.register.ruleLetter, ar.register.ruleDigit]).toEqual([
      '{{count}} أحرف على الأقل',
      'حرف واحد على الأقل',
      'رقم واحد على الأقل',
    ]);
  });

  test.each([
    ['English', 'en', english],
    ['Arabic', 'ar', arabic],
  ] as const)(
    'NFR-06 the Register screen shows the full password rules in %s',
    async (_name, language, texts) => {
      await openRegister(language);

      expect(screen.getByText(texts.title)).toBeOnTheScreen();
      for (const rule of texts.rules) {
        // getByText matches the whole text exactly, so a cut-off label would not be found.
        expect(screen.getByText(rule)).toBeOnTheScreen();
      }
    },
  );

  test.each([
    ['English', 'en', english],
    ['Arabic', 'ar', arabic],
  ] as const)(
    'NFR-06 each password rule label takes the rest of its row so its last word is not cut off (%s)',
    async (_name, language, texts) => {
      await openRegister(language);

      for (const rule of texts.rules) {
        expect(screen.getByText(rule)).toHaveStyle({ flex: 1 });
      }
    },
  );

  test('NFR-07a screen readers hear the full rule and whether it is met (English)', async () => {
    await openRegister('en');
    expect(screen.getByLabelText('At least one letter, not met')).toBeOnTheScreen();
    expect(screen.getByLabelText('At least one number, not met')).toBeOnTheScreen();

    await fireEvent.changeText(screen.getByTestId('register-password'), 'abcd1234');

    expect(screen.getByLabelText('At least 8 characters, met')).toBeOnTheScreen();
    expect(screen.getByLabelText('At least one letter, met')).toBeOnTheScreen();
    expect(screen.getByLabelText('At least one number, met')).toBeOnTheScreen();
  });

  test('NFR-07a screen readers hear the full rule and whether it is met (Arabic)', async () => {
    await openRegister('ar');
    await fireEvent.changeText(screen.getByTestId('register-password'), 'abcd1234');

    expect(screen.getByLabelText('٨ أحرف على الأقل, متحقق')).toBeOnTheScreen();
    expect(screen.getByLabelText('حرف واحد على الأقل, متحقق')).toBeOnTheScreen();
    expect(screen.getByLabelText('رقم واحد على الأقل, متحقق')).toBeOnTheScreen();
  });
});
