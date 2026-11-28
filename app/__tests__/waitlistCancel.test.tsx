// US-29 Waitlist and US-35 Cancellation on the app (FR-RES-06, FR-RES-12, FR-RES-13, NFR-05a, NFR-06; decisions D-117
// to D-120). The consumer joins the waitlist of a sold-out offer, sees their number, leaves, gets a bag set aside on the
// home banner, reserves it or passes it on; and cancels a reservation with the refund or no-show result. API mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import {
  cancelReservation,
  declineWaitlistOffer,
  getMe,
  getMyWaitlist,
  getNearbyOffers,
  getOffer,
  getReservation,
  joinWaitlist,
  leaveWaitlist,
  reserveWithoutCard,
  type Offer,
  type Reservation,
  type WaitlistEntry,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import en from '../src/i18n/en.json';
import ar from '../src/i18n/ar.json';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  getNotifications: jest.fn().mockResolvedValue({ kind: 'ok', notifications: [], unreadCount: 0 }),
  readNotifications: jest.fn().mockResolvedValue(true),
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
  joinWaitlist: jest.fn(),
  leaveWaitlist: jest.fn(),
  declineWaitlistOffer: jest.fn(),
  reserveWithoutCard: jest.fn(),
  getReservation: jest.fn(),
  cancelReservation: jest.fn(),
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
  join: jest.mocked(joinWaitlist),
  leave: jest.mocked(leaveWaitlist),
  decline: jest.mocked(declineWaitlistOffer),
  reserve: jest.mocked(reserveWithoutCard),
  reservation: jest.mocked(getReservation),
  cancel: jest.mocked(cancelReservation),
};

const OFFER: Offer = {
  id: 'l1',
  nameAr: null,
  nameEn: 'Koshari',
  descriptionAr: null,
  descriptionEn: 'Fresh koshari',
  sourceLanguage: 'en',
  foodType: 'Koshari',
  foodCategory: 'cooked_meals',
  isQuickPost: false,
  bagsAvailable: 0,
  originalValue: 100,
  price: 40,
  pickupStart: '2026-11-01T11:00:00.000Z',
  pickupEnd: '2026-11-01T13:00:00.000Z',
  distanceMeters: null,
  pickupSlots: ['2026-11-01T11:00:00.000Z'],
  place: {
    key: 'b1',
    branchId: 'b1',
    shopName: 'Fatma Bakery',
    branchName: 'Fatma Bakery',
    address: '12 Tahrir Street, Dokki',
    latitude: 30.04,
    longitude: 31.21,
  },
};

const entry = (overrides: Partial<WaitlistEntry> = {}): WaitlistEntry => ({
  id: 'w1',
  listingId: 'l1',
  status: 'Waiting',
  position: 2,
  offerExpiresAt: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  listing: {
    nameAr: null,
    nameEn: 'Koshari',
    sourceLanguage: 'en',
    price: 40,
    pickupStart: OFFER.pickupStart,
    pickupEnd: OFFER.pickupEnd,
    shopName: 'Fatma Bakery',
  },
  ...overrides,
});

const HELD: Reservation = {
  id: 'r1',
  method: 'no-card',
  status: 'Held',
  holdExpiresAt: '2026-11-01T11:15:00.000Z',
  slotStart: '2026-11-01T11:00:00.000Z',
  checkedIn: false,
  pickupCode: null,
  createdAt: '2026-11-01T10:00:00.000Z',
  listing: {
    id: 'l1',
    nameAr: null,
    nameEn: 'Koshari',
    sourceLanguage: 'en',
    price: 40,
    pickupStart: OFFER.pickupStart,
    pickupEnd: OFFER.pickupEnd,
    shopName: 'Fatma Bakery',
    address: '12 Tahrir Street, Dokki',
  },
};

let nowSpy: jest.SpyInstance<number, []>;

beforeEach(async () => {
  nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-01T10:00:00.000Z'));
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
    offers: [{ ...OFFER, distanceMeters: 800 }],
  });
  mocked.offer.mockResolvedValue({ kind: 'ok', offer: OFFER });
  mocked.waitlist.mockResolvedValue({ kind: 'ok', entries: [] });
  mocked.join.mockResolvedValue({ kind: 'ok', entry: entry() });
  mocked.leave.mockResolvedValue({ kind: 'ok', entry: entry({ status: 'Left', position: null }) });
  mocked.decline.mockResolvedValue({ kind: 'ok', entry: entry({ status: 'Declined', position: null }) });
  mocked.reserve.mockResolvedValue({ kind: 'ok', reservation: HELD });
  mocked.reservation.mockResolvedValue({ kind: 'ok', reservation: HELD });
  mocked.cancel.mockResolvedValue({
    kind: 'ok',
    result: {
      reservation: { ...HELD, status: 'Cancelled' },
      refund: { refunded: false, amount: 0 },
      noShow: false,
    },
  });
});

afterEach(() => {
  nowSpy.mockRestore();
});

async function openOffer() {
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('offer-l1'));
  await screen.findByTestId('offer-details');
  await screen.findByTestId('waitlist-box');
}

describe('FR-RES-06 the waitlist on the offer page', () => {
  test('FR-RES-06 a sold-out offer offers the waitlist; joining shows the number', async () => {
    await openOffer();

    await fireEvent.press(await screen.findByRole('button', { name: en.waitlist.join }));

    expect(mocked.join).toHaveBeenCalledWith('consumer-token', 'l1');
    expect(await screen.findByText('You are number 2 on the waitlist.')).toBeOnTheScreen();
  });

  test('FR-RES-06 an offer with bags left does not offer the waitlist', async () => {
    mocked.offer.mockResolvedValue({ kind: 'ok', offer: { ...OFFER, bagsAvailable: 2 } });
    await openOffer();

    expect(screen.queryByRole('button', { name: en.waitlist.join })).toBeNull();
  });

  test('FR-RES-06 D-119 a waiting consumer sees the number and can leave', async () => {
    mocked.waitlist.mockResolvedValue({ kind: 'ok', entries: [entry()] });
    await openOffer();
    expect(await screen.findByText('You are number 2 on the waitlist.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: en.waitlist.leave }));

    expect(mocked.leave).toHaveBeenCalledWith('consumer-token', 'w1');
    expect(await screen.findByText(en.waitlist.left)).toBeOnTheScreen();
  });
});

describe('FR-RES-06 BR-05 a bag set aside for the consumer', () => {
  const offered = () =>
    entry({ status: 'Offered', position: null, offerExpiresAt: '2026-11-01T10:10:00.000Z' });

  test('FR-RES-06 D-118 the home shows a banner with the time left, and it opens the offer', async () => {
    mocked.waitlist.mockResolvedValue({ kind: 'ok', entries: [offered()] });
    await renderApp('/home');

    expect(await screen.findByTestId('waitlist-banner')).toBeOnTheScreen();
    expect(screen.getByText(en.waitlist.bannerTitle)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: en.waitlist.bannerOpen }));
    expect(await screen.findByTestId('waitlist-offered')).toBeOnTheScreen();
  });

  test('FR-RES-06 reserving without a card sends the waitlist entry', async () => {
    mocked.waitlist.mockResolvedValue({ kind: 'ok', entries: [offered()] });
    await openOffer();
    await screen.findByTestId('waitlist-offered');

    await fireEvent.press(screen.getByTestId('offer-reserve'));

    await waitFor(() => expect(mocked.reserve).toHaveBeenCalled());
    expect(mocked.reserve.mock.calls[0]?.[4]).toBe('w1');
  });

  test('D-119 passing the bag on declines the offer', async () => {
    mocked.waitlist.mockResolvedValue({ kind: 'ok', entries: [offered()] });
    await openOffer();
    await screen.findByTestId('waitlist-offered');

    await fireEvent.press(screen.getByRole('button', { name: en.waitlist.decline }));

    expect(mocked.decline).toHaveBeenCalledWith('consumer-token', 'w1');
    expect(await screen.findByText(en.waitlist.declined)).toBeOnTheScreen();
  });

  test('BR-05 accepting after the time ran out says the bag went to the next person', async () => {
    mocked.waitlist.mockResolvedValue({ kind: 'ok', entries: [offered()] });
    mocked.reserve.mockResolvedValue({ kind: 'offerExpired' });
    await openOffer();
    await screen.findByTestId('waitlist-offered');

    await fireEvent.press(screen.getByTestId('offer-reserve'));

    expect(await screen.findByText(en.waitlist.expired)).toBeOnTheScreen();
  });
});

describe('FR-RES-12 FR-RES-13 cancelling a reservation', () => {
  async function openReservation() {
    mocked.offer.mockResolvedValue({ kind: 'ok', offer: { ...OFFER, bagsAvailable: 2 } });
    await openOffer();
    await fireEvent.press(screen.getByTestId('offer-reserve'));
    await screen.findByTestId('reservation-details');
    await fireEvent.press(await screen.findByRole('button', { name: en.cancel.button }));
  }

  test('FR-RES-12 the consumer is asked to confirm, with what it means, before anything is cancelled', async () => {
    await openReservation();

    expect(screen.getByText(en.cancel.confirmNoCard)).toBeOnTheScreen();
    expect(mocked.cancel).not.toHaveBeenCalled();
  });

  test('FR-RES-12 a confirmed cancellation says it was cancelled', async () => {
    await openReservation();

    await fireEvent.press(screen.getByRole('button', { name: en.cancel.yes }));

    expect(mocked.cancel).toHaveBeenCalledWith('consumer-token', 'r1');
    expect(await screen.findByText(en.cancel.cancelled)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: en.cancel.button })).toBeNull();
  });

  test('FR-RES-12 BR-06 a refunded card reservation says how much comes back', async () => {
    mocked.cancel.mockResolvedValue({
      kind: 'ok',
      result: {
        reservation: { ...HELD, method: 'card', status: 'Cancelled' },
        refund: { refunded: true, amount: 40 },
        noShow: false,
      },
    });
    await openReservation();

    await fireEvent.press(screen.getByRole('button', { name: en.cancel.yes }));

    expect(await screen.findByTestId('cancel-outcome')).toHaveTextContent('40', { exact: false });
  });

  test('FR-RES-13 a cancellation after the slot started says it counts as a no-show', async () => {
    mocked.cancel.mockResolvedValue({
      kind: 'ok',
      result: {
        reservation: { ...HELD, status: 'Cancelled' },
        refund: { refunded: false, amount: 0 },
        noShow: true,
      },
    });
    await openReservation();

    await fireEvent.press(screen.getByRole('button', { name: en.cancel.yes }));

    expect(await screen.findByText(en.cancel.noShow)).toBeOnTheScreen();
  });

  test('FR-RES-12 a reservation that can no longer be cancelled says so', async () => {
    mocked.cancel.mockResolvedValue({ kind: 'notCancellable' });
    await openReservation();

    await fireEvent.press(screen.getByRole('button', { name: en.cancel.yes }));

    expect(await screen.findByText(en.cancel.notCancellable)).toBeOnTheScreen();
  });
});

describe('NFR-06 NFR-05a texts', () => {
  test('NFR-06 the waitlist button is in Arabic', async () => {
    mocked.getMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'c1', role: 'consumer', status: 'Active', language: 'ar' },
    });
    await AsyncStorage.setItem('nowaste.language', 'ar');
    await openOffer();

    expect(await screen.findByRole('button', { name: ar.waitlist.join })).toBeOnTheScreen();
  });

  test('NFR-05a no waitlist or cancellation text says the food is safe', () => {
    for (const texts of [en.waitlist, ar.waitlist, en.cancel, ar.cancel]) {
      expect(JSON.stringify(texts).toLowerCase()).not.toMatch(/\bsafe\b|آمن|سليم/);
    }
  });
});
