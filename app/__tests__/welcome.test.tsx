// Welcome screen role selection (decision D-30): the user first chooses Consumer, Vendor, Partner or Administrator,
// then Register (sign up) or Log in (sign in). Administrators only log in (SRS 2.7). Log in is US-04 (D-20).
// Covers FR-ACC-01, FR-ACC-02, FR-ACC-03, FR-ACC-09, IF-UI-02, IF-UI-03 and NFR-07a.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { fireEvent, screen } from 'expo-router/testing-library';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  registerConsumer: jest.fn(),
  submitApplication: jest.fn(),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

beforeEach(async () => {
  await AsyncStorage.clear();
  jest
    .mocked(Location.requestForegroundPermissionsAsync)
    .mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
});

async function openWelcome() {
  const app = await renderApp('/');
  await screen.findByText('Welcome to NoWaste');
  return app;
}

async function chooseRole(name: string) {
  await fireEvent.press(screen.getByRole('radio', { name }));
}

describe('D-30 the Welcome screen starts with the role selection', () => {
  test('FR-ACC-01 Welcome shows the four roles, none chosen, and no Register or Log in yet', async () => {
    await openWelcome();

    expect(screen.getByText('I am a')).toBeOnTheScreen();
    for (const name of ['Consumer', 'Vendor', 'Partner', 'Administrator']) {
      expect(screen.getByRole('radio', { name })).not.toBeChecked();
    }
    expect(screen.queryByTestId('welcome-register')).toBeNull();
    expect(screen.queryByTestId('welcome-login')).toBeNull();
  });

  test.each(['Consumer', 'Vendor', 'Partner'])(
    'FR-ACC-01 choosing %s shows Register and Log in',
    async (role) => {
      await openWelcome();
      await chooseRole(role);

      expect(screen.getByRole('radio', { name: role })).toBeChecked();
      expect(screen.getByRole('button', { name: 'Register' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Log in' })).toBeOnTheScreen();
    },
  );

  test('FR-ACC-01 Consumer, then Register, opens the consumer form', async () => {
    const app = await openWelcome();
    await chooseRole('Consumer');
    await fireEvent.press(screen.getByTestId('welcome-register'));

    expect(
      await screen.findByText('Sign up with your email address or your mobile number.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Create account' })).toBeOnTheScreen();
    expect(screen.queryByLabelText('Shop name')).toBeNull();
    expect(app.getPathname()).toBe('/register');
    expect(app.getSearchParams()).toEqual({ role: 'consumer' });
  });

  test('FR-ACC-02 Vendor, then Register, opens the vendor form', async () => {
    const app = await openWelcome();
    await chooseRole('Vendor');
    await fireEvent.press(screen.getByTestId('welcome-register'));

    expect(await screen.findByLabelText('Shop name')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Organisation name')).toBeNull();
    expect(app.getSearchParams()).toEqual({ role: 'vendor' });
  });

  test('FR-ACC-03 Partner, then Register, opens the partner form with Charity or Composting', async () => {
    await openWelcome();
    await chooseRole('Partner');
    await fireEvent.press(screen.getByTestId('welcome-register'));

    expect(await screen.findByLabelText('Organisation name')).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Charity partner' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Composting partner' })).toBeOnTheScreen();
    expect(screen.getByTestId('food-types')).toBeOnTheScreen();
  });

  test('SRS 2.7 Administrator shows only Log in, with a note that the team creates admin accounts', async () => {
    await openWelcome();
    await chooseRole('Administrator');

    expect(screen.queryByTestId('welcome-register')).toBeNull();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeOnTheScreen();
    expect(
      screen.getByText(
        'Administrator accounts are created by the NoWaste team. You cannot register one in the app.',
      ),
    ).toBeOnTheScreen();
  });

  test('D-20 Log in after choosing a role explains that log in is coming soon', async () => {
    await openWelcome();
    await chooseRole('Administrator');
    await fireEvent.press(screen.getByTestId('welcome-login'));

    expect(screen.getByText('Log in will be available soon.')).toBeOnTheScreen();
  });

  test('D-30 changing the role from Administrator to Vendor brings Register back and hides the notes', async () => {
    await openWelcome();
    await chooseRole('Administrator');
    await fireEvent.press(screen.getByTestId('welcome-login'));
    await chooseRole('Vendor');

    expect(screen.getByTestId('welcome-register')).toBeOnTheScreen();
    expect(screen.queryByText(/Administrator accounts are created/)).toBeNull();
    expect(screen.queryByText('Log in will be available soon.')).toBeNull();
  });

  test('D-30 a Register screen opened without a role shows the consumer form', async () => {
    await renderApp('/register?role=unknown');

    expect(
      await screen.findByText('Sign up with your email address or your mobile number.'),
    ).toBeOnTheScreen();
  });
});

describe('NFR-06 IF-UI-03 the role selection in Arabic', () => {
  test('NFR-06 the roles and buttons are in Arabic and the Welcome screen is right-to-left', async () => {
    await openWelcome();
    await fireEvent.press(screen.getByRole('button', { name: 'العربية' }));

    expect(await screen.findByText('أنا')).toBeOnTheScreen();
    for (const name of ['مستهلك', 'بائع', 'شريك', 'مسؤول']) {
      expect(screen.getByRole('radio', { name })).toBeOnTheScreen();
    }
    await chooseRole('مسؤول');
    expect(screen.getByRole('button', { name: 'تسجيل الدخول' })).toBeOnTheScreen();
    expect(screen.getByTestId('screen-root')).toHaveStyle({ direction: 'rtl' });
  });

  test('NFR-07a every role has a label and a hint that says what it is for', async () => {
    await openWelcome();

    for (const name of ['Consumer', 'Vendor', 'Partner', 'Administrator']) {
      const option = screen.getByRole('radio', { name });
      expect(typeof option.props.accessibilityHint).toBe('string');
      expect(option.props.accessibilityHint).not.toBe('');
    }
  });
});
