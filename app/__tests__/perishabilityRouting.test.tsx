// US-18 Perishability category and pickup urgency and US-19 Recommended destination on the app (FR-RTE-01,
// FR-RTE-03, FR-RTE-04, FR-RTE-05, FR-RTE-06, FR-RTE-07, E-RTE-02, IF-UI-05, NFR-05a, NFR-06). After saving a Draft,
// the vendor sees the estimated category with its hours (D-70; no category choice since D-72), chooses a destination
// (the top one marked Recommended), and only then publishes. The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import {
  chooseDestination,
  getDestinations,
  getListing,
  getMe,
  getMyListings,
  getShop,
  markUnfit,
  publishListing,
  type Destinations,
  type Listing,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { formatDateTime } from '@/listings/formatDateTime';
import { LANGUAGE_STORAGE_KEY } from '@/i18n/languageStorage';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getShop: jest.fn(),
  getListing: jest.fn(),
  getMyListings: jest.fn(),
  publishListing: jest.fn(),
  getDestinations: jest.fn(),
  chooseDestination: jest.fn(),
  markUnfit: jest.fn(),
  downloadListingPhoto: jest.fn().mockResolvedValue(null),
  // D-70: the BR-01 hours behind each category.
  getCategoryHours: jest.fn().mockResolvedValue({
    kind: 'ok',
    hours: { highlyPerishableMaxHours: 6, shortLifeMaxHours: 48 },
  }),
}));

const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;
const mocked = {
  getMe: jest.mocked(getMe),
  getShop: jest.mocked(getShop),
  get: jest.mocked(getListing),
  mine: jest.mocked(getMyListings),
  publish: jest.mocked(publishListing),
  destinations: jest.mocked(getDestinations),
  choose: jest.mocked(chooseDestination),
  unfit: jest.mocked(markUnfit),
};

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'l1',
    status: 'Draft',
    listingType: null,
    isQuickPost: false,
    foodType: 'Koshari',
    foodCategory: 'cooked_meals',
    photoKey: 'k.jpg',
    nameAr: 'كشري',
    nameEn: 'Koshari',
    descriptionAr: 'كشري طازج',
    descriptionEn: 'Fresh koshari',
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
    latitude: 30.0381,
    longitude: 31.2122,
    ...overrides,
  };
}

/** D-61: the urgency is the pickup end of the listing (13:00 UTC in these listings). D-69: only customers see it. */
const COLLECT_BY = `Collect by ${formatDateTime('2026-11-01T13:00:00.000Z', 'en')}`;

const CONFIRMED = listing({
  perishabilityCategory: 'Short-life',
  urgency: { collectBy: '2026-11-01T13:00:00.000Z' },
});

const ROUTES: Destinations = {
  options: [
    { destination: 'consumers', partners: null, nearestPartnerMeters: null, available: true },
    { destination: 'charity', partners: 2, nearestPartnerMeters: 2800, available: true },
    { destination: 'composting', partners: 1, nearestPartnerMeters: 5400, available: true },
    { destination: 'landfill', partners: null, nearestPartnerMeters: null, available: false },
  ],
  recommended: 'consumers',
  timeLeftMinutes: 120,
};

beforeEach(async () => {
  await AsyncStorage.clear();
  store.clear();
  store.set(TOKEN_KEY, 'vendor-token');
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.getMe.mockResolvedValue({
    kind: 'ok',
    user: { id: 'v1', role: 'vendor', status: 'Approved', language: 'en' },
  });
  mocked.getShop.mockResolvedValue({
    kind: 'ok',
    shop: {
      shopName: 'Fatma Bakery',
      vendorType: 'formal',
      address: 'Dokki',
      latitude: 30,
      longitude: 31,
      opensAt: '00:00',
      closesAt: '23:59',
      branches: [],
    },
  });
  mocked.mine.mockResolvedValue({ kind: 'ok', listings: [listing()] });
  // D-70: a Draft has its estimated category from the moment it is saved.
  mocked.get.mockResolvedValue({ kind: 'ok', listing: CONFIRMED });
  mocked.destinations.mockResolvedValue({ kind: 'ok', destinations: ROUTES });
  mocked.choose.mockResolvedValue({
    kind: 'ok',
    listing: { ...CONFIRMED, listingType: 'Discounted Surplus Bag' },
  });
  mocked.unfit.mockResolvedValue({ kind: 'ok', listing: { ...CONFIRMED, unfitForPeople: true } });
  mocked.publish.mockResolvedValue({
    kind: 'ok',
    listing: { ...CONFIRMED, listingType: 'Discounted Surplus Bag', status: 'Active' },
  });
});

/** Opens the Draft listing from My listings, as a vendor does after logging in again. */
async function openDraft() {
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('home-my-listings'));
  await fireEvent.press(await screen.findByTestId('my-listing-l1'));
  await screen.findByTestId('listing-status');
}

const SHORT = 'Short-life (6 to 48 hours left)';
const publishButton = () => screen.getByRole('button', { name: 'Publish' });

// D-72 (2026-11-05): the vendor no longer confirms or changes the category; an earlier pickup end is how to be quicker.
describe('FR-RTE-01 FR-RTE-03 D-72 the estimated category is shown; the vendor does not change it', () => {
  test('FR-RTE-01 D-72 a saved Draft shows its estimated category with its hours, with no way to change it', async () => {
    await openDraft();

    expect(await screen.findByText(`Estimate: ${SHORT}`)).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Make it more urgent' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Confirm category' })).toBeNull();
    expect(screen.queryByTestId('perishability-categories')).toBeNull();
    expect(screen.queryByText(COLLECT_BY)).toBeNull();
  });

  test('FR-RTE-03 D-72 D-73 the step explains that the category is for the vendor; customers see the pickup time', async () => {
    await openDraft();

    expect(await screen.findByText(/Customers see the pickup time, not the category/)).toBeOnTheScreen();
  });

  test('FR-RTE-05 D-72 a Draft saved before D-70 (no category yet) goes straight to the destinations', async () => {
    mocked.get.mockResolvedValue({ kind: 'ok', listing: listing() });
    await openDraft();

    expect(await screen.findByTestId('destination-options')).toBeOnTheScreen();
    expect(screen.queryByTestId('perishability-categories')).toBeNull();
    expect(mocked.destinations).toHaveBeenCalledWith('vendor-token', 'l1');
  });
});

describe('FR-RTE-05 FR-RTE-06 FR-RTE-07 the vendor chooses a destination', () => {
  // D-70: the category is set on saving, so the destinations show as soon as the Draft opens.
  async function confirmed() {
    await openDraft();
    await screen.findByTestId('destination-options');
  }

  test('FR-RTE-05 D-70 the destinations appear at once, in order, with the top one marked Recommended', async () => {
    await confirmed();

    const group = screen.getByTestId('destination-options');
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => r.props.accessibilityLabel)).toEqual([
      'Consumers (Discounted Surplus Bag)',
      'Charity (Donation)',
      'Composting (Compost offer)',
      'Landfill',
    ]);
    expect(radios[0]).toHaveProp('accessibilityHint', 'Recommended');
    expect(radios[1]).toHaveProp('accessibilityHint', 'Partners: 2, nearest 2.8 km');
    expect(mocked.destinations).toHaveBeenCalledWith('vendor-token', 'l1');
  });

  test('FR-RTE-13 landfill is shown last and cannot be chosen yet', async () => {
    await confirmed();

    const landfill = screen.getByRole('radio', { name: 'Landfill' });
    expect(landfill).toBeDisabled();
    expect(landfill).toHaveProp('accessibilityHint', 'Not available yet');
  });

  test('FR-RTE-06 choosing a destination saves it; Publish then publishes the listing', async () => {
    await confirmed();
    expect(publishButton()).toBeDisabled();

    await fireEvent.press(screen.getByRole('radio', { name: 'Consumers (Discounted Surplus Bag)' }));

    expect(mocked.choose).toHaveBeenCalledWith('vendor-token', 'l1', 'consumers');
    await waitFor(() => {
      expect(publishButton()).toBeEnabled();
    });
    await fireEvent.press(publishButton());
    expect(await screen.findByText('Your listing is published.')).toBeOnTheScreen();
    expect(mocked.publish).toHaveBeenCalledWith('vendor-token', 'l1');
  });

  test('FR-RTE-06 D-70 Publish stays disabled until a destination is chosen', async () => {
    await openDraft();
    await screen.findByText(`Estimate: ${SHORT}`);

    expect(publishButton()).toBeDisabled();
    expect(screen.getByText('Choose where the food should go before publishing.')).toBeOnTheScreen();
  });

  test('FR-RTE-07 marking the food unfit for people saves it and loads the destinations again', async () => {
    await confirmed();
    mocked.destinations.mockResolvedValue({
      kind: 'ok',
      destinations: { ...ROUTES, options: ROUTES.options.slice(2), recommended: 'composting' },
    });

    await fireEvent.press(
      screen.getByRole('checkbox', { name: 'The food is unfit for people (compost only)' }),
    );

    expect(mocked.unfit).toHaveBeenCalledWith('vendor-token', 'l1', true);
    await waitFor(() => {
      expect(screen.queryByRole('radio', { name: 'Consumers (Discounted Surplus Bag)' })).toBeNull();
    });
    expect(screen.getByRole('radio', { name: 'Composting (Compost offer)' })).toHaveProp(
      'accessibilityHint',
      expect.stringContaining('Recommended'),
    );
  });

  test('E-RTE-02 with no recommendation, the app says so and the vendor can still choose', async () => {
    mocked.destinations.mockResolvedValue({ kind: 'ok', destinations: { ...ROUTES, recommended: null } });
    await confirmed();

    expect(screen.getByText(/No recommendation is available/)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('radio', { name: 'Charity (Donation)' }));
    expect(mocked.choose).toHaveBeenCalledWith('vendor-token', 'l1', 'charity');
  });
});

describe('FR-RTE-04 IF-UI-05 the category and urgency are shown with the listing', () => {
  test('FR-RTE-04 D-69 a confirmed listing shows its category; the vendor sees the pickup end, not a collect-by line', async () => {
    mocked.get.mockResolvedValue({
      kind: 'ok',
      listing: { ...CONFIRMED, status: 'Active', listingType: 'Discounted Surplus Bag' },
    });
    await openDraft();

    expect(screen.getByText(SHORT)).toBeOnTheScreen();
    expect(screen.queryByText(COLLECT_BY)).toBeNull();
    expect(screen.getByText(formatDateTime('2026-11-01T13:00:00.000Z', 'en'))).toBeOnTheScreen();
    expect(screen.getByText('Discounted Surplus Bag')).toBeOnTheScreen();
    // A published listing has no steps left (D-72: there is no estimate call in the app any more).
    expect(screen.queryByTestId('publish-steps')).toBeNull();
  });

  test('FR-RTE-04 D-69 the listing card in My listings shows the category and the pickup end, no collect-by line', async () => {
    mocked.mine.mockResolvedValue({
      kind: 'ok',
      listings: [
        listing({
          perishabilityCategory: 'Highly perishable',
          urgency: { collectBy: '2026-11-01T13:00:00.000Z' },
        }),
      ],
    });
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('home-my-listings'));

    const card = await screen.findByTestId('my-listing-l1');
    expect(within(card).getByText('Highly perishable')).toBeOnTheScreen();
    expect(within(card).queryByText(COLLECT_BY)).toBeNull();
    expect(
      within(card).getByText(`Pickup ends ${formatDateTime('2026-11-01T13:00:00.000Z', 'en')}`),
    ).toBeOnTheScreen();
  });

  test('FR-RTE-04 D-69 a Long-life listing card shows its pickup end', async () => {
    mocked.mine.mockResolvedValue({
      kind: 'ok',
      listings: [
        listing({
          perishabilityCategory: 'Long-life',
          urgency: { collectBy: '2026-11-01T13:00:00.000Z' },
        }),
      ],
    });
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('home-my-listings'));

    expect(
      await screen.findByText(`Pickup ends ${formatDateTime('2026-11-01T13:00:00.000Z', 'en')}`),
    ).toBeOnTheScreen();
    expect(screen.queryByText(COLLECT_BY)).toBeNull();
  });
});

describe('NFR-06 the steps in Arabic', () => {
  test('NFR-06 the estimate and the destinations are shown in Arabic', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'ar');
    mocked.getMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'v1', role: 'vendor', status: 'Approved', language: 'ar' },
    });
    await openDraft();

    // D-67: Arabic digits; D-70: the category with its hours, and the destinations at once (no choice, D-72).
    expect(await screen.findByText('تقدير: قصير الصلاحية (متبقٍ من ٦ إلى ٤٨ ساعة)')).toBeOnTheScreen();
    expect(await screen.findByTestId('destination-options')).toBeOnTheScreen();
    expect(screen.getByText('الوجهة')).toBeOnTheScreen();
  });
});
