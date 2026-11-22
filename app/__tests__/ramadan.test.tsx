// US-45 Ramadan mode (FR-TGI-08, decision D-107, NFR-06): the consumer turns on Ramadan mode on the map of offers and
// the offers whose pickup window comes before iftar or suhoor are marked; the administrator sets the iftar and suhoor
// times. The API, the location and the map are mocked (see jest.setup.ts).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import {
  getMe,
  getNearbyOffers,
  getRamadan,
  listApplications,
  setRamadanTimes,
  type Offer,
  type RamadanView,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { RAMADAN_MODE_KEY } from '@/components/ConsumerHome';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getNearbyOffers: jest.fn(),
  downloadListingPhoto: jest.fn().mockResolvedValue(null),
  getRamadan: jest.fn(),
  setRamadanTimes: jest.fn(),
  listApplications: jest.fn(),
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
  ramadan: jest.mocked(getRamadan),
  setTimes: jest.mocked(setRamadanTimes),
  list: jest.mocked(listApplications),
  permission: jest.mocked(Location.requestForegroundPermissionsAsync),
  position: jest.mocked(Location.getCurrentPositionAsync),
};

const PLACE = {
  key: 'b1',
  branchId: 'b1',
  shopName: 'Fatma Bakery',
  branchName: 'Fatma Bakery',
  address: '12 Tahrir Street, Dokki',
  latitude: 30.04,
  longitude: 31.21,
};

function offer(id: string, nameEn: string, pickupStart: string, pickupEnd: string): Offer {
  return {
    id,
    nameAr: null,
    nameEn,
    descriptionAr: null,
    descriptionEn: null,
    sourceLanguage: 'en',
    foodType: null,
    foodCategory: 'cooked_meals',
    isQuickPost: false,
    bagsAvailable: 2,
    originalValue: 100,
    price: 40,
    pickupStart,
    pickupEnd,
    distanceMeters: 800,
    place: PLACE,
  };
}

// Iftar 17:05 and suhoor 03:30 Cairo time (UTC+2), 2 hours lead.
const TIMES: RamadanView = {
  set: true,
  iftar: '17:05',
  suhoor: '03:30',
  leadMinutes: 120,
  iftarAt: '2026-11-21T15:05:00.000Z',
  suhoorAt: '2026-11-22T01:30:00.000Z',
};

const OFFERS = [
  offer('o1', 'Koshari', '2026-11-21T13:00:00.000Z', '2026-11-21T14:30:00.000Z'), // before iftar
  offer('o2', 'Baladi bread', '2026-11-21T07:00:00.000Z', '2026-11-21T09:00:00.000Z'), // morning
  offer('o3', 'Feteer', '2026-11-21T23:45:00.000Z', '2026-11-22T00:45:00.000Z'), // before suhoor
];

function signIn(role: 'consumer' | 'admin', language: 'en' | 'ar' = 'en') {
  store.set(TOKEN_KEY, `${role}-token`);
  mocked.getMe.mockResolvedValue({ kind: 'ok', user: { id: 'u1', role, status: 'Active', language } });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  store.clear();
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
  mocked.position.mockResolvedValue({
    coords: { latitude: 30.0381, longitude: 31.2122 },
  } as Location.LocationObject);
  mocked.nearby.mockImplementation((_token, query) =>
    Promise.resolve({
      kind: 'ok',
      radius: { km: query.radiusKm ?? 10, defaultKm: 10, minKm: 1, maxKm: 50, stepKm: 1 },
      offers: OFFERS,
    }),
  );
  mocked.ramadan.mockResolvedValue({ kind: 'ok', ramadan: TIMES });
  mocked.list.mockResolvedValue({ kind: 'ok', applications: [] });
});

async function openConsumerHome() {
  signIn('consumer');
  await renderApp('/home');
  await screen.findByTestId('offer-o1');
}

describe('FR-TGI-08 Ramadan mode on the map of offers', () => {
  test('FR-TGI-08 Ramadan mode starts off and nothing is marked or loaded', async () => {
    await openConsumerHome();

    expect(screen.getByTestId('offers-chip-ramadan')).toBeOnTheScreen();
    expect(screen.queryByTestId('offer-ramadan-o1')).toBeNull();
    expect(mocked.ramadan).not.toHaveBeenCalled();
  });

  test('FR-TGI-08 turning it on marks offers before iftar and before suhoor, not the others', async () => {
    await openConsumerHome();

    await fireEvent.press(screen.getByTestId('offers-chip-ramadan'));

    expect(await screen.findByTestId('offer-ramadan-o1')).toHaveTextContent('☾ Before iftar');
    expect(screen.getByTestId('offer-ramadan-o3')).toHaveTextContent('☾ Before suhoor');
    expect(screen.queryByTestId('offer-ramadan-o2')).toBeNull();
    expect(mocked.ramadan).toHaveBeenCalledWith('consumer-token');
    // The order of the offers is not changed (FR-RTE-08 / FR-RTE-09).
    expect(mocked.nearby).toHaveBeenCalledTimes(1);
  });

  test('NFR-07a FR-TGI-08 a marked offer says why in its label, not only by colour', async () => {
    await openConsumerHome();
    await fireEvent.press(screen.getByTestId('offers-chip-ramadan'));
    await screen.findByTestId('offer-ramadan-o1');

    expect(screen.getByTestId('offer-o1')).toHaveAccessibleName('Koshari, 40 EGP, Before iftar');
  });

  test('FR-TGI-08 turning it off removes the marks', async () => {
    await openConsumerHome();
    await fireEvent.press(screen.getByTestId('offers-chip-ramadan'));
    await screen.findByTestId('offer-ramadan-o1');

    await fireEvent.press(screen.getByTestId('offers-chip-ramadan'));

    expect(screen.queryByTestId('offer-ramadan-o1')).toBeNull();
    expect(await AsyncStorage.getItem(RAMADAN_MODE_KEY)).toBe('off');
  });

  test('FR-TGI-08 Ramadan mode is remembered on the phone', async () => {
    await AsyncStorage.setItem(RAMADAN_MODE_KEY, 'on');
    await openConsumerHome();

    expect(await screen.findByTestId('offer-ramadan-o1')).toBeOnTheScreen();
  });

  test('FR-TGI-08 when the administrator has not set the times, the consumer is told and nothing is marked', async () => {
    mocked.ramadan.mockResolvedValue({ kind: 'ok', ramadan: { set: false, leadMinutes: 120 } });
    await openConsumerHome();

    await fireEvent.press(screen.getByTestId('offers-chip-ramadan'));

    expect(await screen.findByTestId('ramadan-not-set')).toHaveTextContent(
      'Ramadan mode is on, but the iftar and suhoor times have not been set yet. No offers are marked.',
    );
    expect(screen.queryByTestId('offer-ramadan-o1')).toBeNull();
  });

  test('NFR-12 FR-TGI-08 when the times cannot be loaded, the offers still show and the consumer is told', async () => {
    mocked.ramadan.mockResolvedValue({ kind: 'unreachable' });
    await openConsumerHome();

    await fireEvent.press(screen.getByTestId('offers-chip-ramadan'));

    expect(await screen.findByTestId('ramadan-failed')).toBeOnTheScreen();
    expect(screen.getByTestId('offer-o1')).toBeOnTheScreen();
  });

  test('NFR-06 FR-TGI-08 the marks are in Arabic', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    signIn('consumer', 'ar');
    await renderApp('/home');
    await screen.findByTestId('offer-o1');

    await fireEvent.press(screen.getByTestId('offers-chip-ramadan'));

    expect(await screen.findByTestId('offer-ramadan-o1')).toHaveTextContent('☾ قبل الإفطار');
    expect(screen.getByTestId('offer-ramadan-o3')).toHaveTextContent('☾ قبل السحور');
  });
});

describe('FR-TGI-08 the administrator sets the Ramadan times', () => {
  async function openRamadanTimes() {
    signIn('admin');
    mocked.ramadan.mockResolvedValue({ kind: 'ok', ramadan: { set: false, leadMinutes: 120 } });
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('admin-ramadan'));
    await screen.findByTestId('ramadan-iftar');
  }

  test('FR-TGI-08 the administrator saves iftar and suhoor times', async () => {
    mocked.setTimes.mockResolvedValue({ kind: 'ok', ramadan: TIMES });
    await openRamadanTimes();

    await fireEvent.changeText(screen.getByTestId('ramadan-iftar'), '17:05');
    await fireEvent.changeText(screen.getByTestId('ramadan-suhoor'), '03:30');
    await fireEvent.press(screen.getByTestId('ramadan-save'));

    expect(await screen.findByText('Ramadan times saved.')).toBeOnTheScreen();
    expect(mocked.setTimes).toHaveBeenCalledWith('admin-token', { iftar: '17:05', suhoor: '03:30' });
  });

  test('FR-TGI-08 the screen says the 2 hour lead from the settings row', async () => {
    await openRamadanTimes();

    expect(screen.getByText(/in the 2 hours before them/)).toBeOnTheScreen();
  });

  test('FR-TGI-08 saved times are shown when the screen opens again', async () => {
    signIn('admin');
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('admin-ramadan'));

    await waitFor(() => {
      expect(screen.getByTestId('ramadan-iftar')).toHaveDisplayValue('17:05');
    });
    expect(screen.getByTestId('ramadan-suhoor')).toHaveDisplayValue('03:30');
  });

  test('FR-TGI-08 a missing time or the same time twice is refused before sending', async () => {
    await openRamadanTimes();

    await fireEvent.press(screen.getByTestId('ramadan-save'));
    expect(screen.getByTestId('ramadan-iftar').props.accessibilityHint).toBe('Choose a time.');

    await fireEvent.changeText(screen.getByTestId('ramadan-iftar'), '17:05');
    await fireEvent.changeText(screen.getByTestId('ramadan-suhoor'), '17:05');
    await fireEvent.press(screen.getByTestId('ramadan-save'));
    expect(screen.getByTestId('ramadan-suhoor').props.accessibilityHint).toBe(
      'Suhoor and iftar must be different times.',
    );

    expect(mocked.setTimes).not.toHaveBeenCalled();
  });

  test('NFR-12 FR-TGI-08 a failed save says so', async () => {
    mocked.setTimes.mockResolvedValue({ kind: 'unreachable' });
    await openRamadanTimes();
    await fireEvent.changeText(screen.getByTestId('ramadan-iftar'), '17:05');
    await fireEvent.changeText(screen.getByTestId('ramadan-suhoor'), '03:30');

    await fireEvent.press(screen.getByTestId('ramadan-save'));

    expect(
      await screen.findByText('The times could not be saved. Check your connection and try again.'),
    ).toBeOnTheScreen();
  });

  test('NFR-06 FR-TGI-08 the Ramadan times screen is in Arabic', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    signIn('admin', 'ar');
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('admin-ramadan'));

    expect(await screen.findByLabelText('موعد الإفطار')).toBeOnTheScreen();
    expect(screen.getByLabelText('موعد السحور')).toBeOnTheScreen();
  });
});
