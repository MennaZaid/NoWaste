// US-25 Landfill record on the app (FR-RTE-13, NFR-06, decision D-117): after the pickup window, the listing page of a
// listing with bags nobody took offers "Record landfill disposal"; once recorded it says how many bags. The API is
// mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import {
  getListing,
  getMe,
  getMyListings,
  getShop,
  recordLandfill,
  type Listing,
  type Shop,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import en from '../src/i18n/en.json';
import ar from '../src/i18n/ar.json';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  getAutoCharity: jest.fn().mockResolvedValue({ kind: 'ok', optIn: false }),
  setAutoCharity: jest.fn().mockResolvedValue({ kind: 'ok', optIn: true }),
  getListingAutoOffer: jest.fn().mockResolvedValue({ kind: 'ok', offer: null }),
  getListingPartnerPickup: jest.fn().mockResolvedValue({ kind: 'ok', pickup: null }),
  getListingReservations: jest.fn().mockResolvedValue({ kind: 'unexpected' }),
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getShop: jest.fn(),
  getListing: jest.fn(),
  getMyListings: jest.fn(),
  downloadListingPhoto: jest.fn().mockResolvedValue(null),
  getCategoryHours: jest.fn().mockResolvedValue({
    kind: 'ok',
    hours: { highlyPerishableMaxHours: 6, shortLifeMaxHours: 48 },
  }),
  recordLandfill: jest.fn(),
}));

const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;
const mocked = {
  getMe: jest.mocked(getMe),
  getShop: jest.mocked(getShop),
  get: jest.mocked(getListing),
  mine: jest.mocked(getMyListings),
  record: jest.mocked(recordLandfill),
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
  pickupStartRule: { maxDaysAhead: 7, pastGraceMinutes: 5 },
};

// The pickup ended at 13:00; it is 14:00.
const ENDED: Listing = {
  id: 'l1',
  status: 'Closed',
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
  bagsAvailable: 2,
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
  landfill: null,
};

let nowSpy: jest.SpyInstance<number, []>;

beforeEach(async () => {
  nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-01T14:00:00.000Z'));
  await AsyncStorage.clear();
  store.clear();
  store.set(TOKEN_KEY, 'vendor-token');
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.getMe.mockResolvedValue({
    kind: 'ok',
    user: { id: 'v1', role: 'vendor', status: 'Approved', language: 'en' },
  });
  mocked.getShop.mockResolvedValue({ kind: 'ok', shop: SHOP });
  mocked.mine.mockResolvedValue({ kind: 'ok', listings: [ENDED] });
  mocked.get.mockResolvedValue({ kind: 'ok', listing: ENDED });
  mocked.record.mockResolvedValue({
    kind: 'ok',
    record: { bags: 2, recordedAt: '2026-11-01T14:00:00.000Z' },
  });
});

afterEach(() => {
  nowSpy.mockRestore();
});

async function openListing() {
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('home-my-listings'));
  await screen.findByTestId('my-listings');
  // An ended listing is in the Past tab (D-102).
  await fireEvent.press(await screen.findByRole('button', { name: /^Past/ }));
  await fireEvent.press(await screen.findByTestId('my-listing-l1'));
  await screen.findByTestId('listing-details');
}

describe('FR-RTE-13 the vendor records the bags nobody took as landfill', () => {
  test('FR-RTE-13 after the pickup window the listing page offers the record with the bags left', async () => {
    await openListing();

    expect(await screen.findByTestId('landfill')).toHaveTextContent(/Bags not taken: 2\./);
    expect(screen.getByRole('button', { name: en.landfill.record })).toBeOnTheScreen();
  });

  test('FR-RTE-13 recording it calls the server and shows the record', async () => {
    await openListing();

    await fireEvent.press(await screen.findByRole('button', { name: en.landfill.record }));

    await waitFor(() => expect(mocked.record).toHaveBeenCalledWith('vendor-token', 'l1'));
    expect(await screen.findByText('Recorded as sent to landfill. Bags: 2.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: en.landfill.record })).toBeNull();
  });

  test('FR-RTE-13 a refusal from the server is explained', async () => {
    mocked.record.mockResolvedValue({ kind: 'refused', reason: 'taken_by_partner' });
    await openListing();

    await fireEvent.press(await screen.findByRole('button', { name: en.landfill.record }));

    expect(await screen.findByText(en.landfill.errors.taken_by_partner)).toBeOnTheScreen();
  });

  test('FR-RTE-13 a listing already recorded shows the record and no button', async () => {
    mocked.get.mockResolvedValue({
      kind: 'ok',
      listing: { ...ENDED, landfill: { bags: 2, recordedAt: '2026-11-01T13:30:00.000Z' } },
    });
    await openListing();

    expect(await screen.findByText('Recorded as sent to landfill. Bags: 2.')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: en.landfill.record })).toBeNull();
  });

  test('FR-RTE-13 before the pickup ends, or with every bag taken, nothing is offered', async () => {
    nowSpy.mockReturnValue(Date.parse('2026-11-01T12:00:00.000Z'));
    mocked.mine.mockResolvedValue({ kind: 'ok', listings: [{ ...ENDED, status: 'Active' }] });
    mocked.get.mockResolvedValue({ kind: 'ok', listing: { ...ENDED, status: 'Active' } });
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('home-my-listings'));
    await fireEvent.press(await screen.findByTestId('my-listing-l1'));
    await screen.findByTestId('listing-details');
    await screen.findByTestId('listing-status');
    expect(screen.queryByTestId('landfill')).toBeNull();
  });

  test('NFR-06 FR-RTE-13 the landfill texts exist in Arabic', () => {
    expect(Object.keys(ar.landfill).sort()).toEqual(Object.keys(en.landfill).sort());
    expect(ar.landfill.record).toBe('تسجيل التخلص في المكب');
  });
});
