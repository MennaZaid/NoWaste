// The customer's profile menu (asked for by Maryam on 2026-11-14, D-94, D-95): a person icon in the consumer home
// header opens a menu with Active reservations, Past reservations and Edit profile. The lists show the customer's
// reservations (FR-RES-08, US-31); Edit profile has the language, a password change (FR-ACC-06) and Log out.
// The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import {
  changePassword,
  getMe,
  getMyReservations,
  getNearbyOffers,
  getReservation,
  logout,
  type Reservation,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  getNotifications: jest.fn().mockResolvedValue({ kind: 'ok', notifications: [], unreadCount: 0 }),
  readNotifications: jest.fn().mockResolvedValue(true),
  getMyWaitlist: jest.fn().mockResolvedValue({ kind: 'ok', entries: [] }),
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getNearbyOffers: jest.fn(),
  getCategoryHours: jest.fn().mockResolvedValue({
    kind: 'ok',
    hours: { highlyPerishableMaxHours: 6, shortLifeMaxHours: 48 },
  }),
  downloadListingPhoto: jest.fn().mockResolvedValue(null),
  getMyReservations: jest.fn(),
  getReservation: jest.fn(),
  getNoShowStanding: jest.fn().mockResolvedValue({ kind: 'unexpected' }),
  changePassword: jest.fn(),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 30.0381, longitude: 31.2122 } }),
  Accuracy: { Balanced: 3 },
}));

const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;
const mocked = {
  getMe: jest.mocked(getMe),
  nearby: jest.mocked(getNearbyOffers),
  list: jest.mocked(getMyReservations),
  reservation: jest.mocked(getReservation),
  change: jest.mocked(changePassword),
  logout: jest.mocked(logout),
};

const NOW = Date.parse('2026-11-01T11:00:00.000Z');

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    method: 'no-card',
    status: 'Held',
    holdExpiresAt: '2026-11-01T11:15:00.000Z',
    slotStart: '2026-11-01T10:30:00.000Z',
    checkedIn: false,
    pickupCode: '042917',
    createdAt: '2026-11-01T10:55:00.000Z',
    listing: {
      id: 'l1',
      nameAr: null,
      nameEn: 'Koshari',
      sourceLanguage: 'en',
      price: 40,
      pickupStart: '2026-11-01T10:30:00.000Z',
      pickupEnd: '2026-11-01T13:00:00.000Z',
      shopName: 'Fatma Bakery',
      address: '12 Tahrir Street, Dokki',
    },
    ...overrides,
  };
}

let nowSpy: jest.SpyInstance<number, []>;

beforeEach(async () => {
  nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
  await AsyncStorage.clear();
  store.clear();
  store.set(TOKEN_KEY, 'consumer-token');
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.getMe.mockResolvedValue({
    kind: 'ok',
    user: { id: 'c1', role: 'consumer', status: 'Active', language: 'en' },
  });
  mocked.nearby.mockResolvedValue({
    kind: 'ok',
    radius: { km: 10, defaultKm: 10, minKm: 1, maxKm: 50, stepKm: 1 },
    offers: [],
  });
  mocked.list.mockImplementation((_token, scope) =>
    Promise.resolve({
      kind: 'ok',
      reservations:
        scope === 'active'
          ? [reservation()]
          : [
              reservation({
                id: 'r0',
                status: 'No-show',
                pickupCode: null,
                holdExpiresAt: '2026-10-30T11:15:00.000Z',
              }),
            ],
    }),
  );
  mocked.reservation.mockResolvedValue({ kind: 'ok', reservation: reservation() });
  mocked.logout.mockResolvedValue(undefined);
});

afterEach(() => {
  nowSpy.mockRestore();
});

async function openMenu() {
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('header-profile'));
  return screen.findByTestId('profile-menu');
}

describe('D-94 the profile icon and its menu', () => {
  test('D-94 the consumer home has a profile icon that opens Active reservations, Past reservations and Edit profile', async () => {
    const menu = await openMenu();

    expect(screen.getByTestId('header-profile')).toHaveProp('accessibilityLabel', 'Profile menu');
    expect(within(menu).getByText('Active reservations')).toBeOnTheScreen();
    expect(within(menu).getByText('Past reservations')).toBeOnTheScreen();
    expect(within(menu).getByText('Edit profile')).toBeOnTheScreen();
  });

  test('D-94 the menu can be closed without choosing', async () => {
    await openMenu();

    await fireEvent.press(screen.getByTestId('profile-menu-close'));

    await waitFor(() => {
      expect(screen.queryByTestId('profile-menu')).toBeNull();
    });
  });
});

describe('FR-RES-08 my active and past reservations', () => {
  test('FR-RES-08 Active reservations lists the held bags with the time left; tapping one opens it', async () => {
    await openMenu();
    await fireEvent.press(screen.getByTestId('profile-menu-active'));

    const card = await screen.findByTestId('reservation-card-r1');
    expect(mocked.list).toHaveBeenCalledWith('consumer-token', 'active');
    expect(within(card).getByText('Koshari')).toBeOnTheScreen();
    expect(within(card).getByText('On hold')).toBeOnTheScreen();
    expect(within(card).getByText('Time left to collect: 15:00')).toBeOnTheScreen();

    await fireEvent.press(card);
    expect(await screen.findByTestId('reservation-details')).toBeOnTheScreen();
  });

  test('FR-RES-08 Past reservations lists the ended ones without a countdown', async () => {
    await openMenu();
    await fireEvent.press(screen.getByTestId('profile-menu-past'));

    const card = await screen.findByTestId('reservation-card-r0');
    expect(mocked.list).toHaveBeenCalledWith('consumer-token', 'past');
    expect(within(card).getByText('Hold ended')).toBeOnTheScreen();
    expect(within(card).queryByText(/Time left/)).toBeNull();
  });

  test('FR-RES-08 an empty list says so', async () => {
    mocked.list.mockResolvedValue({ kind: 'ok', reservations: [] });
    await openMenu();
    await fireEvent.press(screen.getByTestId('profile-menu-active'));

    expect(await screen.findByText('You have no active reservations.')).toBeOnTheScreen();
  });
});

describe('FR-ACC-06 D-95 edit profile', () => {
  async function openProfile() {
    await openMenu();
    await fireEvent.press(screen.getByTestId('profile-menu-edit'));
    await screen.findByTestId('profile-screen');
  }

  test('FR-ACC-06 the profile has the language switch, the password change and Log out', async () => {
    await openProfile();

    expect(within(screen.getByTestId('profile-screen')).getByText('Language')).toBeOnTheScreen();
    expect(screen.getByText('Change password')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-logout')).toBeOnTheScreen();
  });

  test('FR-ACC-06 a new password is saved and the fields are cleared', async () => {
    mocked.change.mockResolvedValue({ kind: 'ok' });
    await openProfile();

    await fireEvent.changeText(screen.getByTestId('profile-current-password'), 'abcd1234');
    await fireEvent.changeText(screen.getByTestId('profile-new-password'), 'newpass99');
    await fireEvent.press(screen.getByTestId('profile-save-password'));

    expect(mocked.change).toHaveBeenCalledWith('consumer-token', 'abcd1234', 'newpass99');
    expect(await screen.findByText('Your password was changed.')).toBeOnTheScreen();
    expect(screen.getByTestId('profile-new-password')).toHaveProp('value', '');
  });

  test('E-ACC-02 a new password that breaks the rules is marked and not sent', async () => {
    await openProfile();

    await fireEvent.changeText(screen.getByTestId('profile-current-password'), 'abcd1234');
    await fireEvent.changeText(screen.getByTestId('profile-new-password'), 'short');
    await fireEvent.press(screen.getByTestId('profile-save-password'));

    expect(mocked.change).not.toHaveBeenCalled();
    expect(screen.getByText('The new password does not follow the rules below.')).toBeOnTheScreen();
  });

  test('E-ACC-03 a wrong current password is shown next to that field', async () => {
    mocked.change.mockResolvedValue({ kind: 'wrongCurrent' });
    await openProfile();

    await fireEvent.changeText(screen.getByTestId('profile-current-password'), 'wrong123');
    await fireEvent.changeText(screen.getByTestId('profile-new-password'), 'newpass99');
    await fireEvent.press(screen.getByTestId('profile-save-password'));

    expect(await screen.findByText('The current password is not correct.')).toBeOnTheScreen();
  });

  test('FR-ACC-04 Log out on the profile ends the session and returns to Welcome', async () => {
    await openProfile();

    await fireEvent.press(screen.getByTestId('profile-logout'));

    await waitFor(() => {
      expect(mocked.logout).toHaveBeenCalledWith('consumer-token');
    });
    expect(await screen.findByText('Welcome to NoWaste')).toBeOnTheScreen();
  });

  test('NFR-06 the menu and the profile are in Arabic, right-to-left', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    mocked.getMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'c1', role: 'consumer', status: 'Active', language: 'ar' },
    });

    const menu = await openMenu();
    expect(within(menu).getByText('الحجوزات الحالية')).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('profile-menu-edit'));

    expect(await screen.findByTestId('profile-screen')).toHaveStyle({ direction: 'rtl' });
    expect(screen.getByText('تغيير كلمة المرور')).toBeOnTheScreen();
  });
});
