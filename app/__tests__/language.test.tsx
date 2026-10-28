// US-09: switching between Arabic and English (FR-ACC-09, IF-UI-02, IF-UI-03).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { LANGUAGE_STORAGE_KEY } from '@/i18n/languageStorage';
import { renderApp } from './helpers/renderApp';
import { headerDirections } from './helpers/headerDirection';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  registerConsumer: jest.fn(),
}));

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('FR-ACC-09 switching between Arabic and English', () => {
  test('FR-ACC-09 the switch changes the Welcome text to Arabic and back', async () => {
    await renderApp();
    expect(await screen.findByText('Welcome to NoWaste')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'العربية' }));
    expect(await screen.findByText('مرحبًا بك في NoWaste')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'مستهلك' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'English' }));
    expect(await screen.findByText('Welcome to NoWaste')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Consumer' })).toBeOnTheScreen();
  });

  test('FR-ACC-09 the language choice is saved on the device', async () => {
    await renderApp();
    await fireEvent.press(await screen.findByRole('button', { name: 'العربية' }));
    await screen.findByText('مرحبًا بك في NoWaste');

    expect(await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('ar');
  });

  test('FR-ACC-09 the saved choice is restored when the app starts again', async () => {
    // A previous run saved Arabic on the device (mocked storage); this render is the restart.
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'ar');

    await renderApp();

    expect(await screen.findByText('مرحبًا بك في NoWaste')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'العربية' })).toBeSelected();
    expect(screen.getByTestId('screen-root')).toHaveStyle({ direction: 'rtl' });
  });

  test('FR-ACC-09 the first launch uses English when nothing is saved yet', async () => {
    await renderApp();

    expect(await screen.findByText('Welcome to NoWaste')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'English' })).toBeSelected();
  });

  test('IF-UI-02 the language can be switched on the Register screen, before login', async () => {
    await renderApp('/register');
    expect(
      await screen.findByText('Sign up with your email address or your mobile number.'),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'العربية' }));

    expect(await screen.findByText('سجّل باستخدام بريدك الإلكتروني أو رقم هاتفك المحمول.')).toBeOnTheScreen();
  });
});

describe('IF-UI-03 Arabic mirrors every screen right-to-left', () => {
  test.each(['/', '/register', '/registered'])(
    'IF-UI-03 the direction is RTL in Arabic and LTR in English on %s',
    async (url) => {
      await renderApp(url);
      expect(await screen.findByTestId('screen-root')).toHaveStyle({ direction: 'ltr' });

      await fireEvent.press(screen.getByRole('button', { name: 'العربية' }));

      expect(await screen.findByTestId('screen-root')).toHaveStyle({ direction: 'rtl' });
    },
  );
});

describe('IF-UI-03 the navigation header mirrors in Arabic (LocaleProvider, decision D-14)', () => {
  test.each(['/register', '/registered'])(
    'IF-UI-03 the header direction is RTL in Arabic and LTR in English on %s',
    async (url) => {
      await renderApp(url);
      await screen.findByTestId('screen-root');
      expect(headerDirections()).toContain('ltr');
      expect(headerDirections()).not.toContain('rtl');

      await fireEvent.press(screen.getByRole('button', { name: 'العربية' }));
      await waitFor(() => {
        expect(headerDirections()).toContain('rtl');
      });
      expect(headerDirections()).not.toContain('ltr');
    },
  );
});

describe('IF-UI-02 the language switch stays in place (decision D-38)', () => {
  function switchOrder() {
    return screen
      .getAllByRole('button')
      .map((button) => button.props.accessibilityLabel as string)
      .filter((label) => label === 'English' || label === 'العربية');
  }

  test('IF-UI-02 the switch keeps the order English | العربية and its side in English and in Arabic', async () => {
    await renderApp('/');
    await screen.findByText('Welcome to NoWaste');
    expect(screen.getByTestId('language-switch')).toHaveStyle({ direction: 'ltr' });
    expect(switchOrder()).toEqual(['English', 'العربية']);

    await fireEvent.press(screen.getByRole('button', { name: 'العربية' }));
    await screen.findByText('مرحبًا بك في NoWaste');

    // The screen is mirrored, but the switch is not: same order, same side.
    expect(screen.getByTestId('screen-root')).toHaveStyle({ direction: 'rtl' });
    expect(screen.getByTestId('language-switch')).toHaveStyle({ direction: 'ltr' });
    expect(switchOrder()).toEqual(['English', 'العربية']);
  });
});
