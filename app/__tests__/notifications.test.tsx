// US-34 notifications shown in the app (FR-RES-11, IF-SW-06, NFR-06, NFR-05a; decision D-121): the bell in the
// consumer's header shows the unread count and opens the list; each notification is written in the app's language and
// opens its reservation or offer; opening the list marks them read. The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import {
  getMe,
  getMyWaitlist,
  getNearbyOffers,
  getNotifications,
  getOffer,
  getReservation,
  readNotifications,
  type AppNotification,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import en from '../src/i18n/en.json';
import ar from '../src/i18n/ar.json';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getNearbyOffers: jest.fn(),
  getOffer: jest.fn(),
  getCategoryHours: jest.fn().mockResolvedValue({
    kind: 'ok',
    hours: { highlyPerishableMaxHours: 6, shortLifeMaxHours: 48 },
  }),
  downloadListingPhoto: jest.fn().mockResolvedValue(null),
  getNoShowStanding: jest.fn().mockResolvedValue({ kind: 'unexpected' }),
  getMyWaitlist: jest.fn(),
  getReservation: jest.fn(),
  getNotifications: jest.fn(),
  readNotifications: jest.fn(),
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
  offer: jest.mocked(getOffer),
  waitlist: jest.mocked(getMyWaitlist),
  reservation: jest.mocked(getReservation),
  list: jest.mocked(getNotifications),
  read: jest.mocked(readNotifications),
};

const note = (overrides: Partial<AppNotification>): AppNotification => ({
  id: 'n1',
  kind: 'reservation_confirmed',
  data: { reservationId: 'r1', listingId: 'l1', shopName: 'Fatma Bakery', nameEn: 'Koshari' },
  createdAt: '2026-11-01T10:00:00.000Z',
  read: false,
  ...overrides,
});

beforeEach(async () => {
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
  mocked.waitlist.mockResolvedValue({ kind: 'ok', entries: [] });
  mocked.reservation.mockResolvedValue({ kind: 'notFound' });
  mocked.offer.mockResolvedValue({ kind: 'notFound' });
  mocked.read.mockResolvedValue(true);
  mocked.list.mockResolvedValue({
    kind: 'ok',
    notifications: [
      note({ id: 'n2', kind: 'window_open', createdAt: '2026-11-01T11:00:00.000Z' }),
      note({ id: 'n1', read: true }),
    ],
    unreadCount: 1,
  });
});

async function openList() {
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('header-notifications'));
  await screen.findByTestId('notifications');
}

describe('FR-RES-11 IF-SW-06 notifications in the app', () => {
  test('IF-SW-06 the consumer header has a bell with the number of new notifications', async () => {
    await renderApp('/home');

    expect(await screen.findByTestId('header-notifications-count')).toHaveTextContent('1');
    expect(screen.getByLabelText('Notifications, 1 new')).toBeOnTheScreen();
  });

  test('FR-RES-11 the list shows each notification written in the app language, newest first', async () => {
    await openList();

    expect(
      await screen.findByText('Pickup has started: your bag of Koshari at Fatma Bakery is ready to collect.'),
    ).toBeOnTheScreen();
    expect(screen.getByText('Your reservation of Koshari at Fatma Bakery is confirmed.')).toBeOnTheScreen();
  });

  test('IF-SW-06 opening the list marks the notifications read', async () => {
    await openList();

    await waitFor(() => expect(mocked.read).toHaveBeenCalledWith('consumer-token'));
  });

  test('FR-RES-11 a waitlist offer says until when, and opens the offer with its entry', async () => {
    mocked.list.mockResolvedValue({
      kind: 'ok',
      notifications: [
        note({
          id: 'n3',
          kind: 'waitlist_offer',
          data: {
            listingId: 'l1',
            entryId: 'w1',
            shopName: 'Fatma Bakery',
            nameEn: 'Koshari',
            offerExpiresAt: '2026-11-01T10:10:00.000Z',
          },
        }),
      ],
      unreadCount: 1,
    });
    await openList();

    await fireEvent.press(await screen.findByTestId('notification-n3'));

    await waitFor(() => expect(mocked.offer).toHaveBeenCalledWith('consumer-token', 'l1'));
  });

  test('FR-RES-11 a reservation notification opens the reservation', async () => {
    await openList();

    await fireEvent.press(await screen.findByTestId('notification-n1'));

    await waitFor(() => expect(mocked.reservation).toHaveBeenCalledWith('consumer-token', 'r1'));
  });

  test('IF-SW-06 with no notifications the screen says so', async () => {
    mocked.list.mockResolvedValue({ kind: 'ok', notifications: [], unreadCount: 0 });
    await openList();

    expect(await screen.findByText(en.notifications.empty)).toBeOnTheScreen();
    expect(screen.queryByTestId('header-notifications-count')).toBeNull();
  });

  test('NFR-06 in Arabic the notification uses the Arabic name and text', async () => {
    mocked.getMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'c1', role: 'consumer', status: 'Active', language: 'ar' },
    });
    await AsyncStorage.setItem('nowaste.language', 'ar');
    mocked.list.mockResolvedValue({
      kind: 'ok',
      notifications: [
        note({ data: { reservationId: 'r1', shopName: 'Fatma Bakery', nameAr: 'كشري', nameEn: 'Koshari' } }),
      ],
      unreadCount: 1,
    });
    await openList();

    expect(await screen.findByText('تم تأكيد حجزك لـكشري من Fatma Bakery.')).toBeOnTheScreen();
  });

  test('NFR-05a no notification text says the food is safe', () => {
    for (const texts of [en.notifications, ar.notifications]) {
      expect(JSON.stringify(texts).toLowerCase()).not.toMatch(/\bsafe\b|آمن|سليم/);
    }
  });
});
