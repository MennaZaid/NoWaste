// US-26 map search on the consumer home (FR-RES-01, FR-RTE-08, IF-HW-03, IF-HW-04, NFR-05a, NFR-06), decision D-65:
// the location is read, the distance slider (default from the settings row FR-RES-01) zooms the map and loads the
// offers in range, branch pins open that branch's offers with a close button, and an offer opens its product page.
// The API, the location and the map (a view with a button per pin, see jest.setup.ts) are mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { getMe, getNearbyOffers, getOffer, type Offer, type SearchRadius } from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { formatDateTime } from '@/listings/formatDateTime';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getNearbyOffers: jest.fn(),
  getOffer: jest.fn(),
  downloadListingPhoto: jest.fn().mockResolvedValue(null),
  getCategoryHours: jest.fn().mockResolvedValue({
    kind: 'ok',
    hours: { highlyPerishableMaxHours: 6, shortLifeMaxHours: 48 },
  }),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;
const mocked = {
  getMe: jest.mocked(getMe),
  nearby: jest.mocked(getNearbyOffers),
  offer: jest.mocked(getOffer),
  permission: jest.mocked(Location.requestForegroundPermissionsAsync),
  position: jest.mocked(Location.getCurrentPositionAsync),
};

const HERE = { latitude: 30.0381, longitude: 31.2122 };
const CAIRO = { latitude: 30.0444, longitude: 31.2357 };
const RADIUS: SearchRadius = { km: 10, defaultKm: 10, minKm: 1, maxKm: 50, stepKm: 1 };

const DOKKI = {
  key: 'b1',
  branchId: 'b1',
  shopName: 'Fatma Bakery',
  branchName: 'Fatma Bakery',
  address: '12 Tahrir Street, Dokki',
  latitude: 30.04,
  longitude: 31.21,
};
const ZAMALEK = {
  key: 'b2',
  branchId: 'b2',
  shopName: 'Nile Kitchen',
  branchName: 'Zamalek branch',
  address: '5 26th of July Street, Zamalek',
  latitude: 30.06,
  longitude: 31.22,
};

function offer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: 'o1',
    // D-66: written in English only; nothing is translated.
    nameAr: null,
    nameEn: 'Koshari',
    descriptionAr: null,
    descriptionEn: 'Fresh koshari with crispy onions',
    sourceLanguage: 'en',
    foodType: 'Koshari',
    foodCategory: 'cooked_meals',
    isQuickPost: false,
    bagsAvailable: 3,
    originalValue: 100,
    price: 40,
    pickupStart: '2026-11-01T11:00:00.000Z',
    pickupEnd: '2026-11-01T13:00:00.000Z',
    distanceMeters: 800,
    place: DOKKI,
    ...overrides,
  };
}

const OFFERS = [
  offer(),
  offer({ id: 'o2', nameEn: 'Baladi bread', price: 15, place: DOKKI }),
  offer({ id: 'o3', nameEn: 'Molokhia', price: 55, place: ZAMALEK }),
];

beforeEach(async () => {
  await AsyncStorage.clear();
  store.clear();
  store.set(TOKEN_KEY, 'consumer-token');
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.getMe.mockResolvedValue({
    kind: 'ok',
    user: { id: 'c1', role: 'consumer', status: 'Active', language: 'en' },
  });
  mocked.permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
  mocked.position.mockResolvedValue({ coords: HERE } as Location.LocationObject);
  mocked.nearby.mockImplementation((_token, query) =>
    Promise.resolve({ kind: 'ok', radius: { ...RADIUS, km: query.radiusKm ?? 10 }, offers: OFFERS }),
  );
  mocked.offer.mockResolvedValue({ kind: 'ok', offer: { ...offer(), distanceMeters: null } });
});

const mapProps = () => screen.getByTestId('offers-map').props as { center: unknown; radiusKm: number };
const list = () => within(screen.getByTestId('offers-list'));

async function openHome() {
  const app = await renderApp('/home');
  await screen.findByTestId('home-consumer');
  await screen.findByTestId('offer-o1');
  return app;
}

describe('FR-RES-01 IF-HW-03 the map of offers near the consumer', () => {
  test('FR-RES-01 the location is read and the offers within the default 10 km are loaded', async () => {
    await openHome();

    expect(mocked.nearby).toHaveBeenCalledWith('consumer-token', { ...HERE, radiusKm: undefined });
    expect(mapProps()).toMatchObject({ center: HERE, radiusKm: 10 });
    expect(screen.getByText('Offers within 10 km')).toBeOnTheScreen();
    // D-88: the slider is in the pop-up sheet of the distance chip.
    await fireEvent.press(screen.getByTestId('offers-chip-distance'));
    expect(screen.getByTestId('offers-distance')).toHaveAccessibilityValue({
      min: 1,
      max: 50,
      now: 10,
      text: '10 km',
    });
  });

  test('FR-RES-01 every branch with offers is one pin on the map', async () => {
    await openHome();

    expect(screen.getByTestId('map-place-b1')).toHaveProp(
      'accessibilityLabel',
      'Fatma Bakery, 12 Tahrir Street, Dokki',
    );
    expect(screen.getByTestId('map-place-b2')).toBeOnTheScreen();
  });

  test('FR-RTE-08 the list keeps the order the server gives; each row shows the name and price', async () => {
    await openHome();

    const rows = list().getAllByRole('button');
    expect(rows.map((row) => row.props.accessibilityLabel as string)).toEqual([
      'Koshari, 40 EGP',
      'Baladi bread, 15 EGP',
      'Molokhia, 55 EGP',
    ]);
    expect(screen.getByTestId('offer-photo-o1-placeholder')).toBeOnTheScreen();
  });

  test('FR-RES-01 a distance with no offers says so', async () => {
    mocked.nearby.mockResolvedValue({ kind: 'ok', radius: RADIUS, offers: [] });
    await renderApp('/home');

    expect(await screen.findByTestId('offers-empty')).toHaveTextContent(
      'No offers within 10 km right now. Try a larger distance.',
    );
  });

  test('FR-RES-01 when the server cannot be reached, Try again loads the offers', async () => {
    mocked.nearby.mockResolvedValueOnce({ kind: 'unreachable' });
    await renderApp('/home');
    await fireEvent.press(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByTestId('offer-o1')).toBeOnTheScreen();
  });
});

describe('D-65 the distance slider zooms the map and loads the offers in range', () => {
  test('FR-RES-01 moving the slider up zooms out and loads that distance', async () => {
    await openHome();
    // D-88: the slider is in the pop-up sheet of the distance chip.
    await fireEvent.press(screen.getByTestId('offers-chip-distance'));

    await fireEvent(screen.getByTestId('offers-distance'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });

    await waitFor(() => {
      expect(mapProps().radiusKm).toBe(11);
    });
    expect(mocked.nearby).toHaveBeenLastCalledWith('consumer-token', { ...HERE, radiusKm: 11 });
    expect(await screen.findByText('Offers within 11 km')).toBeOnTheScreen();
  });

  test('FR-RES-01 the slider stops at 1 km', async () => {
    mocked.nearby.mockImplementation((_token, query) =>
      Promise.resolve({ kind: 'ok', radius: { ...RADIUS, km: query.radiusKm ?? 1 }, offers: OFFERS }),
    );
    await openHome();
    const calls = mocked.nearby.mock.calls.length;
    await fireEvent.press(screen.getByTestId('offers-chip-distance'));

    await fireEvent(screen.getByTestId('offers-distance'), 'accessibilityAction', {
      nativeEvent: { actionName: 'decrement' },
    });

    expect(mapProps().radiusKm).toBe(1);
    expect(mocked.nearby).toHaveBeenCalledTimes(calls);
  });
});

describe('D-65 a branch pin shows that branch only, with a close button', () => {
  test('FR-RES-01 tapping a pin shows the shop name, the branch address and only its offers', async () => {
    await openHome();

    await fireEvent.press(screen.getByTestId('map-place-b2'));

    const branch = within(screen.getByTestId('offers-branch'));
    expect(branch.getByText('Nile Kitchen')).toBeOnTheScreen();
    expect(branch.getByText('5 26th of July Street, Zamalek')).toBeOnTheScreen();
    expect(list().getAllByRole('button')).toHaveLength(1);
    expect(screen.getByTestId('offer-o3')).toBeOnTheScreen();
    expect(screen.queryByTestId('offer-o1')).toBeNull();
  });

  test('FR-RES-01 the close (×) button goes back to every offer in range', async () => {
    await openHome();
    await fireEvent.press(screen.getByTestId('map-place-b1'));
    expect(list().getAllByRole('button')).toHaveLength(2);

    await fireEvent.press(screen.getByRole('button', { name: 'Close, back to all offers in range' }));

    expect(screen.queryByTestId('offers-branch')).toBeNull();
    expect(list().getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('Offers within 10 km')).toBeOnTheScreen();
  });
});

describe('D-65 the panel can be pulled up', () => {
  test('NFR-07a the handle is a button that expands and collapses the panel', async () => {
    await openHome();

    const handle = screen.getByTestId('offers-sheet-handle');
    expect(handle).toHaveProp('accessibilityLabel', 'Show more offers');
    await fireEvent.press(handle);
    expect(screen.getByTestId('offers-sheet-handle')).toHaveProp('accessibilityLabel', 'Show the map');
    expect(screen.getByTestId('offers-sheet-handle')).toHaveProp('accessibilityState', { expanded: true });
  });
});

describe('IF-HW-04 the location is refused', () => {
  test('IF-HW-04 the app says nearby search needs the location and shows offers around central Cairo', async () => {
    mocked.permission.mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
    await renderApp('/home');

    expect(await screen.findByTestId('offers-location-needed')).toHaveTextContent(
      /Nearby search needs your location. Showing offers around central Cairo/,
    );
    await waitFor(() => {
      expect(mocked.nearby).toHaveBeenCalledWith('consumer-token', { ...CAIRO, radiusKm: undefined });
    });
    expect(mapProps().center).toEqual(CAIRO);
  });

  test('IF-HW-04 Use my location asks again and moves the search to the consumer', async () => {
    mocked.permission.mockResolvedValueOnce({ status: 'denied' } as Location.LocationPermissionResponse);
    await renderApp('/home');
    await fireEvent.press(await screen.findByRole('button', { name: 'Use my location' }));

    await waitFor(() => {
      expect(mocked.nearby).toHaveBeenLastCalledWith('consumer-token', { ...HERE, radiusKm: 10 });
    });
    expect(screen.queryByTestId('offers-location-needed')).toBeNull();
  });
});

describe('D-65 the product page', () => {
  async function openOffer() {
    const app = await openHome();
    await fireEvent.press(screen.getByTestId('offer-o1'));
    await screen.findByTestId('offer-name');
    return app;
  }

  test('FR-RES-01 tapping an offer opens its page with photo, name, category, description, pickup time and bags', async () => {
    const app = await openOffer();

    expect(app.getPathname()).toBe('/offers/o1');
    expect(mocked.offer).toHaveBeenCalledWith('consumer-token', 'o1');
    expect(screen.getByTestId('offer-photo-placeholder')).toBeOnTheScreen();
    expect(screen.getByTestId('offer-name')).toHaveTextContent('Koshari');
    expect(screen.getByText('Cooked meals')).toBeOnTheScreen();
    expect(screen.getByText('Fresh koshari with crispy onions')).toBeOnTheScreen();
    const start = formatDateTime('2026-11-01T11:00:00.000Z', 'en');
    const end = formatDateTime('2026-11-01T13:00:00.000Z', 'en');
    expect(screen.getByTestId('offer-pickup')).toHaveTextContent(`Pickup time${start} to ${end}`);
    expect(screen.getByTestId('offer-bags')).toHaveTextContent('Bags left3');
  });

  test('FR-RES-01 the original price is struck through next to the discounted price', async () => {
    await openOffer();

    expect(screen.getByTestId('offer-original-price')).toHaveTextContent('100 EGP');
    expect(screen.getByTestId('offer-original-price')).toHaveStyle({ textDecorationLine: 'line-through' });
    expect(screen.getByTestId('offer-discounted-price')).toHaveTextContent('40 EGP');
    expect(screen.getByTestId('offer-price')).toHaveProp('accessibilityLabel', 'Was 100 EGP, now 40 EGP');
  });

  test('FR-RTE-04 NFR-05a the page shows how soon to collect, never that the food is safe', async () => {
    await openOffer();

    // D-73: customers see the pickup window, not the perishability category.
    expect(screen.queryByTestId('offer-urgency')).toBeNull();
    expect(screen.queryByText(/perishable|Short-life|Long-life/)).toBeNull();
    expect(screen.queryByText(/\bsafe\b/i)).toBeNull();
  });

  test('D-65 Place order is shown but says ordering is not available yet', async () => {
    await openOffer();

    await fireEvent.press(screen.getByRole('button', { name: 'Place order' }));

    expect(screen.getByTestId('offer-order-note')).toHaveTextContent(/Ordering is not available yet/);
  });

  test('FR-RES-01 an offer that is no longer available says so', async () => {
    mocked.offer.mockResolvedValue({ kind: 'notFound' });
    await openHome();
    await fireEvent.press(screen.getByTestId('offer-o1'));

    expect(await screen.findByText('This offer is no longer available.')).toBeOnTheScreen();
  });
});

describe('NFR-06 the consumer home and product page in Arabic', () => {
  test('NFR-06 the texts are in Arabic, names are shown as the vendor wrote them and the layout is right-to-left', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    mocked.getMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'c1', role: 'consumer', status: 'Active', language: 'ar' },
    });
    await renderApp('/home');

    // D-67: numbers in Arabic texts use Arabic digits.
    expect(await screen.findByText('العروض في نطاق ١٠ كم')).toBeOnTheScreen();
    // D-66: an offer written in English stays in English for an Arabic reader.
    expect(screen.getByTestId('offer-o1')).toHaveProp('accessibilityLabel', 'Koshari، ٤٠ جنيه');
    expect(screen.getByTestId('consumer-home')).toHaveStyle({ direction: 'rtl' });
  });
});

// D-87 (Maryam, 2026-11-14): a maximum price and "I can pick up by" a time; they work together, keep the distance and
// can be cleared. The vendor rating filter waits for ratings (a later story).
// D-88 (Maryam, 2026-11-14, after the phone test): the distance and the filters are chips over the map; each chip opens
// a pop-up sheet with its control, and price and pickup time are applied with an Apply button.
describe('FR-RES-01 D-87 D-88 the offer filters', () => {
  const lastQuery = () => mocked.nearby.mock.calls.at(-1)?.[1] as Record<string, unknown>;
  const LATER = '2099-01-01T12:00:00.000Z';
  const apply = () => fireEvent.press(screen.getByRole('button', { name: 'Apply' }));

  async function setMaxPrice(text: string) {
    await fireEvent.press(screen.getByTestId('offers-chip-price'));
    await fireEvent.changeText(screen.getByLabelText('Max price per bag (EGP)'), text);
    await apply();
  }

  async function setPickupBy(iso: string) {
    await fireEvent.press(screen.getByTestId('offers-chip-pickup'));
    await fireEvent.changeText(screen.getByLabelText('I can pick up by'), iso);
    await apply();
  }

  test('D-88 the distance, price and pickup time are chips over the map, and their controls start hidden', async () => {
    await openHome();

    expect(screen.getByTestId('offers-chip-distance')).toHaveTextContent('10 km', { exact: false });
    expect(screen.getByTestId('offers-chip-price')).toHaveTextContent('Price', { exact: false });
    expect(screen.getByTestId('offers-chip-pickup')).toHaveTextContent('Pickup time', { exact: false });
    expect(screen.queryByTestId('offers-distance')).toBeNull();
    expect(screen.queryByLabelText('Max price per bag (EGP)')).toBeNull();
  });

  test('NFR-07a D-88 each chip is a button that says what it sets and its value', async () => {
    await openHome();

    expect(screen.getByRole('button', { name: 'Distance, 10 km' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Max price per bag (EGP), Any price' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'I can pick up by, Any time' })).toBeOnTheScreen();
  });

  test('FR-RES-01 D-87 a maximum price is applied with Apply and loads only the offers at or below it', async () => {
    await openHome();

    await setMaxPrice('40');

    await waitFor(() => expect(lastQuery()).toEqual({ ...HERE, radiusKm: 10, maxPrice: 40 }));
    expect(screen.getByTestId('offers-chip-price')).toHaveTextContent('Up to 40 EGP', { exact: false });
    // The sheet closes after Apply.
    expect(screen.queryByLabelText('Max price per bag (EGP)')).toBeNull();
  });

  test('FR-RES-01 D-88 typing a price without Apply loads nothing', async () => {
    await openHome();
    const calls = mocked.nearby.mock.calls.length;
    await fireEvent.press(screen.getByTestId('offers-chip-price'));

    await fireEvent.changeText(screen.getByLabelText('Max price per bag (EGP)'), '40');

    expect(mocked.nearby.mock.calls.length).toBe(calls);
  });

  test('FR-RES-01 D-87 a pickup time is applied with Apply and loads only the offers whose pickup starts by then', async () => {
    await openHome();

    await setPickupBy(LATER);

    await waitFor(() => expect(lastQuery()).toEqual({ ...HERE, radiusKm: 10, pickupBy: LATER }));
    expect(screen.getByTestId('offers-chip-pickup')).toHaveTextContent(`By ${formatDateTime(LATER, 'en')}`, { exact: false });
  });

  test('FR-RES-01 D-87 the filters work together and stay when the distance changes', async () => {
    await openHome();
    await setMaxPrice('40');
    await setPickupBy(LATER);

    await fireEvent.press(screen.getByTestId('offers-chip-distance'));
    await fireEvent(screen.getByTestId('offers-distance'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });

    await waitFor(() =>
      expect(lastQuery()).toEqual({ ...HERE, radiusKm: 11, maxPrice: 40, pickupBy: LATER }),
    );
    expect(screen.getByTestId('offers-chip-distance')).toHaveTextContent('11 km', { exact: false });
  });

  test('FR-RES-01 D-88 Clear in the price sheet removes only the price', async () => {
    await openHome();
    await setMaxPrice('40');
    await setPickupBy(LATER);
    await waitFor(() => expect(lastQuery()).toMatchObject({ maxPrice: 40, pickupBy: LATER }));

    await fireEvent.press(screen.getByTestId('offers-chip-price'));
    await fireEvent.press(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => expect(lastQuery()).toEqual({ ...HERE, radiusKm: 10, pickupBy: LATER }));
    expect(screen.getByTestId('offers-chip-price')).toHaveTextContent('Price', { exact: false });
  });

  test('FR-RES-01 D-87 filters with no results say so, and Clear filters loads every offer again', async () => {
    mocked.nearby.mockImplementation((_token, query) =>
      Promise.resolve({
        kind: 'ok',
        radius: { ...RADIUS, km: query.radiusKm ?? 10 },
        offers: query.maxPrice === undefined ? OFFERS : [],
      }),
    );
    await openHome();

    await setMaxPrice('5');

    expect(await screen.findByTestId('offers-empty')).toHaveTextContent(
      'No offers match your filters within 10 km.',
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(lastQuery()).toEqual({ ...HERE, radiusKm: 10 }));
    expect(await screen.findByTestId('offer-o1')).toBeOnTheScreen();
  });

  test.each(['0', '-3', 'cheap'])('FR-RES-01 D-87 a maximum price of "%s" is marked and not sent', async (text) => {
    await openHome();
    const calls = mocked.nearby.mock.calls.length;

    await setMaxPrice(text);

    expect(await screen.findByText('Enter a price above 0.')).toBeOnTheScreen();
    expect(mocked.nearby.mock.calls.length).toBe(calls);
  });

  test('FR-RES-01 D-87 a pickup time already passed is marked on Apply and not sent', async () => {
    await openHome();
    const calls = mocked.nearby.mock.calls.length;

    await setPickupBy('2000-01-01T12:00:00.000Z');

    expect(screen.getByLabelText('I can pick up by')).toHaveProp(
      'accessibilityHint',
      'Choose a time that has not passed.',
    );
    expect(mocked.nearby.mock.calls.length).toBe(calls);
  });

  test('D-88 choosing a pickup time is not marked as an error before Apply', async () => {
    await openHome();
    await fireEvent.press(screen.getByTestId('offers-chip-pickup'));

    await fireEvent.changeText(screen.getByLabelText('I can pick up by'), '2000-01-01T12:00:00.000Z');

    expect(screen.getByLabelText('I can pick up by')).not.toHaveProp(
      'accessibilityHint',
      'Choose a time that has not passed.',
    );
  });

  test('NFR-06 D-88 the chips and filters are in Arabic', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    mocked.getMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'c1', role: 'consumer', status: 'Active', language: 'ar' },
    });
    await renderApp('/home');
    await screen.findByTestId('offer-o1');

    expect(screen.getByTestId('offers-chip-distance')).toHaveTextContent('١٠ كم', { exact: false });
    expect(screen.getByTestId('offers-chip-price')).toHaveTextContent('السعر', { exact: false });
    await fireEvent.press(screen.getByTestId('offers-chip-price'));
    expect(screen.getByLabelText('أقصى سعر للحقيبة (جنيه)')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'تطبيق' })).toBeOnTheScreen();
  });
});
