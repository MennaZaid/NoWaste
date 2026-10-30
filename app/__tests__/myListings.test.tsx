// US-15 View my listings (FR-LST-06) and the listing photo (FR-LST-01) on the app: the vendor opens My listings from
// the home screen, sees every listing with its photo and status, and opens one. Found missing in phone testing
// (decision D-51). Reservations are not shown yet: they arrive with Sprint 2. The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import {
  downloadListingPhoto,
  getListing,
  getMe,
  getMyListings,
  getShop,
  type Listing,
  type Shop,
} from '@/api/client';
import { LANGUAGE_STORAGE_KEY } from '@/i18n/languageStorage';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getShop: jest.fn(),
  getListing: jest.fn(),
  getMyListings: jest.fn(),
  downloadListingPhoto: jest.fn(),
}));

const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;
const mocked = {
  getMe: jest.mocked(getMe),
  getShop: jest.mocked(getShop),
  get: jest.mocked(getListing),
  mine: jest.mocked(getMyListings),
  photo: jest.mocked(downloadListingPhoto),
};

const SHOP: Shop = {
  shopName: 'Fatma Bakery',
  vendorType: 'informal',
  address: '12 Tahrir Street, Dokki',
  latitude: 30.0381,
  longitude: 31.2122,
};

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'l1',
    status: 'Draft',
    listingType: null,
    isQuickPost: false,
    foodType: 'Baladi bread',
    foodCategory: 'bread_and_baked_goods',
    photoKey: 'k.jpg',
    descriptionAr: 'خبز بلدي طازج',
    descriptionEn: 'Fresh baladi bread',
    bagsTotal: 3,
    bagsAvailable: 3,
    originalValue: 100,
    price: 40,
    pickupStart: '2026-11-01T11:00:00.000Z',
    pickupEnd: '2026-11-01T13:00:00.000Z',
    prepTime: '2026-11-01T08:00:00.000Z',
    storage: 'room_temperature',
    expiryAt: '2026-11-01T18:00:00.000Z',
    perishabilityCategory: null,
    latitude: SHOP.latitude,
    longitude: SHOP.longitude,
    ...overrides,
  };
}

const QUICK = listing({
  id: 'l2',
  status: 'Active',
  isQuickPost: true,
  foodType: null,
  foodCategory: 'unknown',
  descriptionAr: null,
  descriptionEn: null,
  originalValue: null,
  price: 15,
  prepTime: null,
  storage: null,
  expiryAt: null,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  store.clear();
  store.set(TOKEN_KEY, 'vendor-token');
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.getMe.mockResolvedValue({
    kind: 'ok',
    user: { id: 'v1', role: 'vendor', status: 'Approved', language: 'en' },
  });
  mocked.getShop.mockResolvedValue({ kind: 'ok', shop: SHOP });
  mocked.mine.mockResolvedValue({ kind: 'ok', listings: [QUICK, listing()] });
  mocked.get.mockResolvedValue({ kind: 'ok', listing: listing() });
  mocked.photo.mockImplementation((_token, id) => Promise.resolve(`file:///cache/listing-photo-${id}.jpg`));
});

async function openMyListings() {
  const app = await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('home-my-listings'));
  await screen.findByTestId('my-listings');
  return app;
}

describe('FR-LST-06 the vendor views their listings (US-15)', () => {
  test('FR-LST-06 the vendor home has My listings, which opens the list', async () => {
    const app = await openMyListings();

    expect(app.getPathname()).toBe('/listings');
    expect(mocked.mine).toHaveBeenCalledWith('vendor-token');
  });

  test('FR-LST-06 every listing is shown in the order the server gives (newest first) with its status', async () => {
    await openMyListings();

    const rows = await screen.findAllByTestId(/^my-listing-l/);
    expect(rows.map((row) => row.props.testID)).toEqual(['my-listing-l2', 'my-listing-l1']);
    expect(within(rows[0]!).getByText('Quick Post')).toBeOnTheScreen();
    expect(within(rows[0]!).getByText('Active: published')).toBeOnTheScreen();
    expect(within(rows[1]!).getByText('Baladi bread')).toBeOnTheScreen();
    expect(within(rows[1]!).getByText('Draft: not published yet')).toBeOnTheScreen();
  });

  test('FR-LST-01 each listing in the list shows its photo, downloaded with the login token', async () => {
    await openMyListings();

    const photo = await screen.findByTestId('my-listing-photo-l1');
    expect(photo.props.source).toEqual({ uri: 'file:///cache/listing-photo-l1.jpg' });
    expect(mocked.photo).toHaveBeenCalledWith('vendor-token', 'l1');
    expect(mocked.photo).toHaveBeenCalledWith('vendor-token', 'l2');
  });

  test('FR-LST-01 a photo that cannot be downloaded leaves a labelled empty box and the listing still shows', async () => {
    mocked.photo.mockResolvedValue(null);
    await openMyListings();

    expect(await screen.findByTestId('my-listing-photo-l1-placeholder')).toBeOnTheScreen();
    expect(screen.queryByTestId('my-listing-photo-l1')).toBeNull();
    expect(screen.getByTestId('my-listing-l1')).toBeOnTheScreen();
  });

  test('FR-LST-06 tapping a listing opens its details', async () => {
    const app = await openMyListings();
    await fireEvent.press(await screen.findByTestId('my-listing-l1'));

    expect(await screen.findByTestId('listing-status')).toHaveTextContent('Draft: not published yet');
    expect(app.getPathname()).toBe('/listings/l1');
  });

  test('FR-LST-06 a vendor with no listings is told so and can create one', async () => {
    mocked.mine.mockResolvedValue({ kind: 'ok', listings: [] });
    const app = await openMyListings();

    expect(await screen.findByText(/You have no listings yet/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Create listing' }));
    expect(await screen.findByTestId('listing-form')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/listings/new');
  });

  test('FR-LST-06 when the server cannot be reached, the app says so and Try again loads the list', async () => {
    mocked.mine.mockResolvedValueOnce({ kind: 'unreachable' });
    await openMyListings();

    expect(await screen.findByText(/We could not reach the server/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('my-listing-l1')).toBeOnTheScreen();
    expect(mocked.mine).toHaveBeenCalledTimes(2);
  });

  test('NFR-06 My listings is shown in Arabic', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'ar');
    mocked.getMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'v1', role: 'vendor', status: 'Approved', language: 'ar' },
    });
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('home-my-listings'));

    const rows = await screen.findAllByTestId(/^my-listing-l/);
    expect(within(rows[1]!).getByText('مسودة: لم يُنشر بعد')).toBeOnTheScreen();
  });
});

describe('FR-LST-01 the listing screen shows the photo', () => {
  test('FR-LST-01 the listing details show the photo of the food, downloaded with the login token', async () => {
    await openMyListings();
    await fireEvent.press(await screen.findByTestId('my-listing-l1'));

    const photo = await screen.findByTestId('listing-photo');
    expect(photo.props.source).toEqual({ uri: 'file:///cache/listing-photo-l1.jpg' });
    expect(photo.props.accessibilityLabel).toBe('Photo of the food');
    await waitFor(() => {
      expect(mocked.get).toHaveBeenCalledWith('vendor-token', 'l1');
    });
  });
});
