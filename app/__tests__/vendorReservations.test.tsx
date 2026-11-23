// US-32 the vendor's reservations of a listing (FR-RES-09) and US-33 the pickup code at the counter (FR-RES-10,
// E-RES-03), decision D-101: My listings shows how many bags are reserved and collected; the listing page has a
// Reservations section (to collect, then finished) with Reservation #N, the method, the status and the time, never the
// customer or the pickup code; the vendor types the code, sees which reservation it is, and hands the bag over after
// confirming. Arabic and English, RTL (NFR-06). The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import {
  completePickup,
  downloadListingPhoto,
  getListing,
  getListingReservations,
  getMe,
  getMyListings,
  getShop,
  verifyPickup,
  type Listing,
  type Shop,
  type VendorReservations,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { formatTime } from '@/listings/formatDateTime';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  getAutoCharity: jest.fn().mockResolvedValue({ kind: 'ok', optIn: false }),
  setAutoCharity: jest.fn().mockResolvedValue({ kind: 'ok', optIn: true }),
  getListingAutoOffer: jest.fn().mockResolvedValue({ kind: 'ok', offer: null }),
  getListingPartnerPickup: jest.fn().mockResolvedValue({ kind: 'ok', pickup: null }),
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getShop: jest.fn(),
  getListing: jest.fn(),
  getMyListings: jest.fn(),
  downloadListingPhoto: jest.fn(),
  getListingReservations: jest.fn(),
  verifyPickup: jest.fn(),
  completePickup: jest.fn(),
  // A Draft listing shows its publish steps (US-19).
  getDestinations: jest.fn().mockResolvedValue({
    kind: 'ok',
    destinations: { options: [], recommended: null, timeLeftMinutes: 60 },
  }),
  chooseDestination: jest.fn(),
  markUnfit: jest.fn(),
}));

const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;
const mocked = {
  getMe: jest.mocked(getMe),
  getShop: jest.mocked(getShop),
  get: jest.mocked(getListing),
  mine: jest.mocked(getMyListings),
  photo: jest.mocked(downloadListingPhoto),
  reservations: jest.mocked(getListingReservations),
  verify: jest.mocked(verifyPickup),
  complete: jest.mocked(completePickup),
};

const SHOP: Shop = {
  shopName: 'Fatma Bakery',
  vendorType: 'formal',
  address: '12 Tahrir Street, Dokki',
  latitude: 30.0381,
  longitude: 31.2122,
  opensAt: '00:00',
  closesAt: '23:59',
  branches: [],
  // D-104: the pickup start limits.
  pickupStartRule: { maxDaysAhead: 7, pastGraceMinutes: 5 },
};

const LISTING: Listing = {
  id: 'l1',
  status: 'Active',
  listingType: 'Discounted Surplus Bag',
  isQuickPost: false,
  foodType: 'Koshari',
  foodCategory: 'cooked_meals',
  photoKey: 'k.jpg',
  nameAr: null,
  nameEn: 'Koshari',
  descriptionAr: null,
  descriptionEn: 'Fresh koshari',
  sourceLanguage: 'en',
  branchId: null,
  bagsTotal: 4,
  bagsAvailable: 1,
  originalValue: 100,
  price: 40,
  pickupStart: '2026-11-01T11:00:00.000Z',
  pickupEnd: '2026-11-01T13:00:00.000Z',
  storage: 'room_temperature',
  perishabilityCategory: 'Highly perishable',
  urgency: null,
  unfitForPeople: false,
  latitude: SHOP.latitude,
  longitude: SHOP.longitude,
  reservations: { taken: 3, collected: 1, waiting: 2, notCollected: 0 },
};

const VIEW: VendorReservations = {
  summary: { bagsTotal: 4, taken: 3, collected: 1, waiting: 2, notCollected: 0, available: 1 },
  reservations: [
    {
      id: 'r1',
      number: 1,
      method: 'no-card',
      status: 'Held',
      slotStart: '2026-11-01T11:00:00.000Z',
      holdExpiresAt: '2026-11-01T11:15:00.000Z',
      checkedIn: true,
    },
    {
      id: 'r3',
      number: 3,
      method: 'no-card',
      status: 'Held',
      slotStart: '2026-11-01T12:00:00.000Z',
      holdExpiresAt: '2026-11-01T12:15:00.000Z',
      checkedIn: false,
    },
    {
      id: 'r2',
      number: 2,
      method: 'card',
      status: 'Completed',
      slotStart: null,
      holdExpiresAt: null,
      checkedIn: false,
    },
  ],
};

let nowSpy: jest.SpyInstance<number, []>;

beforeEach(async () => {
  nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-01T11:05:00.000Z'));
  await AsyncStorage.clear();
  store.clear();
  store.set(TOKEN_KEY, 'vendor-token');
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.getMe.mockResolvedValue({
    kind: 'ok',
    user: { id: 'v1', role: 'vendor', status: 'Approved', language: 'en' },
  });
  mocked.getShop.mockResolvedValue({ kind: 'ok', shop: SHOP });
  mocked.mine.mockResolvedValue({ kind: 'ok', listings: [LISTING] });
  mocked.get.mockResolvedValue({ kind: 'ok', listing: LISTING });
  mocked.photo.mockResolvedValue(null);
  mocked.reservations.mockResolvedValue({ kind: 'ok', view: VIEW });
});

afterEach(() => {
  nowSpy.mockRestore();
});

async function openMyListings() {
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('home-my-listings'));
  await screen.findByTestId('my-listings');
}

async function openReservations() {
  await openMyListings();
  // The fixture listing is published and its pickup has not ended: it is in the Active tab (D-102).
  await fireEvent.press(screen.getByTestId('my-listing-l1'));
  return screen.findByTestId('vendor-reservations');
}

describe('FR-RES-09 the vendor sees the reservations of a listing', () => {
  test('FR-RES-09 My listings shows how many bags are reserved and collected', async () => {
    await openMyListings();

    expect(
      within(screen.getByTestId('my-listing-l1')).getByText(
        '3 of 4 bags reserved · 1 collected · 2 waiting for pickup',
      ),
    ).toBeOnTheScreen();
  });

  test('FR-RES-09 the listing page has the reservations: to collect first, then finished, with the counts', async () => {
    const section = await openReservations();

    expect(mocked.reservations).toHaveBeenCalledWith('vendor-token', 'l1');
    expect(
      within(section).getByText('3 of 4 bags reserved · 1 collected · 2 waiting for pickup · 1 left'),
    ).toBeOnTheScreen();
    const toCollect = within(screen.getByTestId('vendor-to-collect'));
    expect(toCollect.getByText('Reservation #1')).toBeOnTheScreen();
    expect(toCollect.getByText('Reservation #3')).toBeOnTheScreen();
    expect(within(screen.getByTestId('vendor-finished')).getByText('Reservation #2')).toBeOnTheScreen();
  });

  test('FR-RES-09 each row has the method, the status and the time, with "On the way" after a check-in', async () => {
    await openReservations();

    const first = within(screen.getByTestId('vendor-reservation-r1'));
    expect(first.getByText('No card · On hold')).toBeOnTheScreen();
    expect(
      first.getByText(`Hold until ${formatTime('2026-11-01T11:15:00.000Z', 'en')} · On the way`),
    ).toBeOnTheScreen();
    // The slot has not started yet: its start time is shown.
    const later = within(screen.getByTestId('vendor-reservation-r3'));
    expect(later.getByText(`Slot starts ${formatTime('2026-11-01T12:00:00.000Z', 'en')}`)).toBeOnTheScreen();
    expect(
      within(screen.getByTestId('vendor-reservation-r2')).getByText('Card · Collected'),
    ).toBeOnTheScreen();
  });

  test('FR-RES-09 D-101 a card reservation to collect says it can come any time in the pickup window', async () => {
    mocked.reservations.mockResolvedValue({
      kind: 'ok',
      view: {
        ...VIEW,
        reservations: [
          {
            id: 'r4',
            number: 4,
            method: 'card',
            status: 'Confirmed',
            slotStart: null,
            holdExpiresAt: null,
            checkedIn: false,
          },
        ],
      },
    });
    await openReservations();

    const row = within(screen.getByTestId('vendor-reservation-r4'));
    expect(row.getByText('Card · Confirmed')).toBeOnTheScreen();
    expect(row.getByText('Any time in the pickup window')).toBeOnTheScreen();
  });

  test('FR-RES-09 without reservations the section says so', async () => {
    mocked.reservations.mockResolvedValue({
      kind: 'ok',
      view: {
        summary: { bagsTotal: 4, taken: 0, collected: 0, waiting: 0, notCollected: 0, available: 4 },
        reservations: [],
      },
    });
    await openReservations();

    expect(screen.getByText('No reservations yet.')).toBeOnTheScreen();
  });

  test('FR-RES-09 a Draft listing has no reservations section', async () => {
    mocked.get.mockResolvedValue({ kind: 'ok', listing: { ...LISTING, status: 'Draft', listingType: null } });
    mocked.mine.mockResolvedValue({ kind: 'ok', listings: [{ ...LISTING, status: 'Draft' }] });
    await openMyListings();
    await fireEvent.press(screen.getByRole('button', { name: /^Drafts/ }));
    await fireEvent.press(screen.getByTestId('my-listing-l1'));
    await screen.findByTestId('listing-details');

    expect(screen.queryByTestId('vendor-reservations')).toBeNull();
    expect(mocked.reservations).not.toHaveBeenCalled();
  });
});

describe('FR-RES-10 E-RES-03 the vendor types the pickup code', () => {
  async function typeCode(code: string) {
    await fireEvent.changeText(screen.getByTestId('vendor-code'), code);
    await fireEvent.press(screen.getByTestId('vendor-code-check'));
  }

  test('FR-RES-10 a valid code shows the reservation; Hand over marks it collected and reloads the list', async () => {
    mocked.verify.mockResolvedValue({
      kind: 'ok',
      reservation: { id: 'r1', number: 1, method: 'no-card', status: 'Held' },
    });
    mocked.complete.mockResolvedValue({
      kind: 'ok',
      reservation: { id: 'r1', number: 1, method: 'no-card', status: 'Completed' },
    });
    await openReservations();

    await typeCode('123456');

    expect(mocked.verify).toHaveBeenCalledWith('vendor-token', 'l1', '123456');
    const confirm = within(await screen.findByTestId('vendor-code-confirm'));
    expect(confirm.getByText('Reservation #1 · No card')).toBeOnTheScreen();
    expect(mocked.complete).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('vendor-code-handover'));

    expect(mocked.complete).toHaveBeenCalledWith('vendor-token', 'l1', '123456');
    expect(await screen.findByText('Reservation #1 was handed over.')).toBeOnTheScreen();
    expect(screen.getByTestId('vendor-code')).toHaveProp('value', '');
    await waitFor(() => {
      expect(mocked.reservations).toHaveBeenCalledTimes(2);
    });
  });

  test('FR-RES-10 Cancel closes the confirmation without handing over', async () => {
    mocked.verify.mockResolvedValue({
      kind: 'ok',
      reservation: { id: 'r1', number: 1, method: 'no-card', status: 'Held' },
    });
    await openReservations();
    await typeCode('123456');

    await fireEvent.press(await screen.findByTestId('vendor-code-cancel'));

    expect(screen.queryByTestId('vendor-code-confirm')).toBeNull();
    expect(mocked.complete).not.toHaveBeenCalled();
  });

  test.each([
    [{ reason: 'wrong_code' }, 'This code does not match any reservation of this listing.'],
    [{ reason: 'already_used' }, 'This code was already used.'],
    [{ reason: 'expired' }, 'This reservation has ended, so the code no longer works.'],
    [{ reason: 'ended' }, 'The pickup time of this listing has ended.'],
    [{ reason: 'invalid' }, 'Enter the 6-digit code the customer shows you.'],
  ] as const)('E-RES-03 a refused code (%o) says why', async (refusal, message) => {
    mocked.verify.mockResolvedValue({ kind: 'refused', ...refusal });
    await openReservations();

    await typeCode('123456');

    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(screen.queryByTestId('vendor-code-confirm')).toBeNull();
  });

  test('E-RES-03 a code before the pickup or the slot starts says when it starts', async () => {
    mocked.verify.mockResolvedValue({
      kind: 'refused',
      reason: 'not_started',
      startsAt: '2026-11-01T12:00:00.000Z',
    });
    await openReservations();

    await typeCode('123456');

    expect(
      await screen.findByText(
        `Pickup for this reservation starts at ${formatTime('2026-11-01T12:00:00.000Z', 'en')}.`,
      ),
    ).toBeOnTheScreen();
  });

  test('NFR-06 the reservations section is in Arabic, right-to-left', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    mocked.getMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'v1', role: 'vendor', status: 'Approved', language: 'ar' },
    });

    const section = await openReservations();

    expect(section).toHaveStyle({ direction: 'rtl' });
    expect(within(section).getByText('الحجز رقم ١')).toBeOnTheScreen();
  });
});

describe('D-102 after the pickup end', () => {
  test('D-102 a paid bag not collected by the pickup end is listed in Finished as Not collected', async () => {
    mocked.reservations.mockResolvedValue({
      kind: 'ok',
      view: {
        summary: { bagsTotal: 4, taken: 1, collected: 0, waiting: 0, notCollected: 1, available: 3 },
        reservations: [
          {
            id: 'r5',
            number: 1,
            method: 'card',
            status: 'Not collected',
            slotStart: null,
            holdExpiresAt: null,
            checkedIn: false,
          },
        ],
      },
    });

    await openReservations();

    expect(within(screen.getByTestId('vendor-finished')).getByText('Card · Not collected')).toBeOnTheScreen();
    expect(screen.getByText('1 of 4 bags reserved · 1 not collected')).toBeOnTheScreen();
  });
});
