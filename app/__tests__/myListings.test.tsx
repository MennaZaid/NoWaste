// US-15 View my listings (FR-LST-06) and the listing photo (FR-LST-01) on the app: the vendor opens My listings from
// the home screen, sees every listing with its photo and status, and opens one. Found missing in phone testing
// (decision D-51). D-102 (Maryam, 2026-11-17): the list has three tabs, Active (published, pickup not ended), Drafts
// (not published, still publishable) and Past (ended listings and drafts whose pickup has passed). The tests run at
// 10:00 on the day of the fixtures' pickup (11:00 to 13:00). The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { router } from 'expo-router';
import { act, fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
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
  getAutoCharity: jest.fn().mockResolvedValue({ kind: 'ok', optIn: false }),
  setAutoCharity: jest.fn().mockResolvedValue({ kind: 'ok', optIn: true }),
  getListingAutoOffer: jest.fn().mockResolvedValue({ kind: 'ok', offer: null }),
  getListingPartnerPickup: jest.fn().mockResolvedValue({ kind: 'ok', pickup: null }),
  // US-32 (D-101): a published listing also loads its reservations.
  getListingReservations: jest.fn().mockResolvedValue({ kind: 'unexpected' }),
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getShop: jest.fn(),
  getListing: jest.fn(),
  getMyListings: jest.fn(),
  downloadListingPhoto: jest.fn(),
  // D-72: a Draft goes straight to its destinations.
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
};

const SHOP: Shop = {
  shopName: 'Fatma Bakery',
  vendorType: 'informal',
  address: '12 Tahrir Street, Dokki',
  latitude: 30.0381,
  longitude: 31.2122,
  opensAt: '00:00',
  closesAt: '23:59',
  branches: [],
  // D-104: the pickup start limits.
  pickupStartRule: { maxDaysAhead: 7, pastGraceMinutes: 5 },
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
    nameAr: 'عيش بلدي',
    nameEn: 'Baladi bread',
    descriptionAr: 'خبز بلدي طازج',
    descriptionEn: 'Fresh baladi bread',
    sourceLanguage: 'en',
    branchId: null,
    bagsTotal: 3,
    bagsAvailable: 3,
    originalValue: 100,
    price: 40,
    pickupStart: '2026-11-01T11:00:00.000Z',
    pickupEnd: '2026-11-01T13:00:00.000Z',
    storage: 'room_temperature',
    perishabilityCategory: null,
    urgency: null,
    unfitForPeople: false,
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
  // A Quick Post from before D-63: no name, so it is shown as "Quick Post".
  nameAr: null,
  nameEn: null,
  descriptionAr: null,
  descriptionEn: null,
  sourceLanguage: null,
  originalValue: null,
  price: 15,
  storage: null,
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

let nowSpy: jest.SpyInstance<number, []>;

beforeEach(() => {
  nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-01T10:00:00.000Z'));
});

afterEach(() => {
  nowSpy.mockRestore();
});

/** D-102: opens a tab of My listings by its name (the name starts with the tab, then the count). */
async function showTab(name: RegExp) {
  await fireEvent.press(screen.getByRole('button', { name }));
}

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

  test('FR-LST-06 D-102 Active shows the published listings and Drafts the drafts, each with its status', async () => {
    await openMyListings();

    let rows = await screen.findAllByTestId(/^my-listing-l/);
    expect(rows.map((row) => row.props.testID)).toEqual(['my-listing-l2']);
    expect(within(rows[0]!).getByText('Quick Post')).toBeOnTheScreen();
    expect(within(rows[0]!).getByText('Active: published')).toBeOnTheScreen();

    await showTab(/^Drafts/);
    rows = await screen.findAllByTestId(/^my-listing-l/);
    expect(rows.map((row) => row.props.testID)).toEqual(['my-listing-l1']);
    expect(within(rows[0]!).getByText('Baladi bread')).toBeOnTheScreen();
    expect(within(rows[0]!).getByText('Draft: not published yet')).toBeOnTheScreen();
  });

  test('FR-LST-01 each listing in the list shows its photo, downloaded with the login token', async () => {
    await openMyListings();
    expect(await screen.findByTestId('my-listing-photo-l2')).toBeOnTheScreen();
    await showTab(/^Drafts/);

    const photo = await screen.findByTestId('my-listing-photo-l1');
    expect(photo.props.source).toEqual({ uri: 'file:///cache/listing-photo-l1.jpg' });
    expect(mocked.photo).toHaveBeenCalledWith('vendor-token', 'l1');
    expect(mocked.photo).toHaveBeenCalledWith('vendor-token', 'l2');
  });

  test('FR-LST-01 a photo that cannot be downloaded leaves a labelled empty box and the listing still shows', async () => {
    mocked.photo.mockResolvedValue(null);
    await openMyListings();
    await showTab(/^Drafts/);

    expect(await screen.findByTestId('my-listing-photo-l1-placeholder')).toBeOnTheScreen();
    expect(screen.queryByTestId('my-listing-photo-l1')).toBeNull();
    expect(screen.getByTestId('my-listing-l1')).toBeOnTheScreen();
  });

  test('FR-LST-06 tapping a listing opens its details', async () => {
    const app = await openMyListings();
    await showTab(/^Drafts/);
    await fireEvent.press(await screen.findByTestId('my-listing-l1'));

    expect(await screen.findByTestId('listing-status')).toHaveTextContent('Draft: not published yet');
    expect(app.getPathname()).toBe('/listings/l1');
  });

  // Found on the phone (2026-11-04): an informal vendor was sent to Create listing, which is for formal vendors (D-64).
  test('FR-LST-02 D-64 an informal vendor with no listings is told so and offered Quick Post only', async () => {
    mocked.mine.mockResolvedValue({ kind: 'ok', listings: [] });
    const app = await openMyListings();

    expect(
      await screen.findByText('You have no listings yet. Use Quick Post to post surplus food.'),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Create listing' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Quick Post' }));
    expect(await screen.findByTestId('quick-post-form')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/listings/quick');
  });

  test('FR-LST-06 a formal vendor with no listings is told so and offered Create listing only', async () => {
    mocked.getShop.mockResolvedValue({ kind: 'ok', shop: { ...SHOP, vendorType: 'formal' } });
    mocked.mine.mockResolvedValue({ kind: 'ok', listings: [] });
    const app = await openMyListings();

    expect(
      await screen.findByText('You have no listings yet. Use Create listing to post surplus food.'),
    ).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Quick Post' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Create listing' }));
    expect(await screen.findByTestId('listing-form')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/listings/new');
  });

  test('FR-LST-06 when the server cannot be reached, the app says so and Try again loads the list', async () => {
    mocked.mine.mockResolvedValueOnce({ kind: 'unreachable' });
    await openMyListings();

    expect(await screen.findByText(/We could not reach the server/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    await showTab(/^Drafts/);
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

    await screen.findAllByTestId(/^my-listing-l/);
    await showTab(/^المسودات/);
    const rows = await screen.findAllByTestId(/^my-listing-l/);
    expect(within(rows[0]!).getByText('مسودة: لم يُنشر بعد')).toBeOnTheScreen();
  });
});

describe('FR-LST-01 the listing screen shows the photo', () => {
  test('FR-LST-01 the listing details show the photo of the food, downloaded with the login token', async () => {
    await openMyListings();
    await showTab(/^Drafts/);
    await fireEvent.press(await screen.findByTestId('my-listing-l1'));

    const photo = await screen.findByTestId('listing-photo');
    expect(photo.props.source).toEqual({ uri: 'file:///cache/listing-photo-l1.jpg' });
    expect(photo.props.accessibilityLabel).toBe('Photo of the food');
    await waitFor(() => {
      expect(mocked.get).toHaveBeenCalledWith('vendor-token', 'l1');
    });
  });
});

describe('FR-LST-06 D-102 Active, Drafts and Past', () => {
  const ENDED = listing({
    id: 'l3',
    status: 'Closed',
    listingType: 'Discounted Surplus Bag',
    nameEn: 'Koshari',
    pickupStart: '2026-10-31T11:00:00.000Z',
    pickupEnd: '2026-10-31T13:00:00.000Z',
    reservations: { taken: 2, collected: 1, waiting: 0, notCollected: 1 },
  });
  const OLD_DRAFT = listing({
    id: 'l4',
    nameEn: 'Old draft',
    pickupStart: '2026-10-30T11:00:00.000Z',
    pickupEnd: '2026-10-30T13:00:00.000Z',
  });

  test('D-102 the tabs show how many listings each has; Active is open first', async () => {
    mocked.mine.mockResolvedValue({ kind: 'ok', listings: [QUICK, listing(), ENDED, OLD_DRAFT] });

    await openMyListings();

    expect(screen.getByRole('button', { name: 'Active · 1' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'Drafts · 1' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Past · 2' })).toBeOnTheScreen();
  });

  test('D-102 Past has the ended listings as Ended and the drafts whose pickup passed, newest pickup first', async () => {
    mocked.mine.mockResolvedValue({ kind: 'ok', listings: [QUICK, listing(), OLD_DRAFT, ENDED] });
    await openMyListings();

    await showTab(/^Past/);

    const rows = await screen.findAllByTestId(/^my-listing-l/);
    expect(rows.map((row) => row.props.testID)).toEqual(['my-listing-l3', 'my-listing-l4']);
    expect(within(rows[0]!).getByText('Ended')).toBeOnTheScreen();
    expect(
      within(rows[0]!).getByText('2 of 3 bags reserved · 1 collected · 1 not collected'),
    ).toBeOnTheScreen();
    expect(within(rows[1]!).getByText('Draft · not published')).toBeOnTheScreen();
  });

  // D-103 (Maryam, 2026-11-17): the count line names only the parts that are not zero.
  test('D-103 a published listing shows reserved, collected and waiting for pickup, without zeros', async () => {
    mocked.mine.mockResolvedValue({
      kind: 'ok',
      listings: [{ ...QUICK, reservations: { taken: 2, collected: 1, waiting: 1, notCollected: 0 } }],
    });

    await openMyListings();

    expect(
      within(screen.getByTestId('my-listing-l2')).getByText(
        '2 of 3 bags reserved · 1 collected · 1 waiting for pickup',
      ),
    ).toBeOnTheScreen();
  });

  test('D-103 a listing nobody reserved says "No bags reserved"', async () => {
    mocked.mine.mockResolvedValue({
      kind: 'ok',
      listings: [{ ...QUICK, reservations: { taken: 0, collected: 0, waiting: 0, notCollected: 0 } }],
    });

    await openMyListings();

    expect(within(screen.getByTestId('my-listing-l2')).getByText('No bags reserved')).toBeOnTheScreen();
  });

  test('D-103 a listing whose bags are all collected moves to Past as All collected', async () => {
    mocked.mine.mockResolvedValue({
      kind: 'ok',
      listings: [
        {
          ...QUICK,
          status: 'Fully reserved',
          bagsTotal: 2,
          bagsAvailable: 0,
          reservations: { taken: 2, collected: 2, waiting: 0, notCollected: 0 },
        },
      ],
    });
    await openMyListings();

    expect(screen.getByRole('button', { name: 'Active · 0' })).toBeOnTheScreen();
    await showTab(/^Past/);

    const card = within(await screen.findByTestId('my-listing-l2'));
    expect(card.getByText('All collected')).toBeOnTheScreen();
    expect(card.getByText('2 of 2 bags reserved · 2 collected')).toBeOnTheScreen();
  });

  test('D-103 a sold-out listing with customers still to come stays in Active', async () => {
    mocked.mine.mockResolvedValue({
      kind: 'ok',
      listings: [
        {
          ...QUICK,
          status: 'Fully reserved',
          bagsTotal: 2,
          bagsAvailable: 0,
          reservations: { taken: 2, collected: 1, waiting: 1, notCollected: 0 },
        },
      ],
    });

    await openMyListings();

    expect(screen.getByRole('button', { name: 'Active · 1' })).toBeOnTheScreen();
  });

  test('D-103 My listings loads again when the vendor comes back to it', async () => {
    await openMyListings();
    await showTab(/^Drafts/);
    await fireEvent.press(await screen.findByTestId('my-listing-l1'));
    await screen.findByTestId('listing-details');
    expect(mocked.mine).toHaveBeenCalledTimes(1);

    await act(() => {
      router.back();
    });

    await waitFor(() => {
      expect(mocked.mine).toHaveBeenCalledTimes(2);
    });
  });

  test('D-102 an empty tab says so', async () => {
    mocked.mine.mockResolvedValue({ kind: 'ok', listings: [QUICK] });
    await openMyListings();

    await showTab(/^Past/);

    expect(await screen.findByText('No listings here.')).toBeOnTheScreen();
  });
});
