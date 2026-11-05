// Shop opening hours on the app (decision D-62; FR-ACC-02 vendor profile, NFR-06): the vendor home shows the hours
// and opens the Opening hours screen, where the vendor picks them on a clock (the time picker is replaced by a text
// box in jest.setup.ts). The hours are required: without them the vendor cannot post food. The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import * as Location from 'expo-location';
import {
  addBranch,
  getMe,
  getShop,
  updateBranchHours,
  updateOpeningHours,
  type Branch,
  type Shop,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { LANGUAGE_STORAGE_KEY } from '@/i18n/languageStorage';
import { clockTimeOf, dateAtClockTime } from '@/listings/clockTime';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getShop: jest.fn(),
  addBranch: jest.fn(),
  updateBranchHours: jest.fn(),
  updateOpeningHours: jest.fn(),
}));

// The location step of a new branch: no GPS unless a test grants it; the address lookup answers with an address.
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
  getCurrentPositionAsync: jest.fn(),
  geocodeAsync: jest.fn().mockResolvedValue([]),
  reverseGeocodeAsync: jest.fn().mockResolvedValue([]),
  Accuracy: { Balanced: 3 },
}));

const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;
const mocked = {
  getMe: jest.mocked(getMe),
  getShop: jest.mocked(getShop),
  update: jest.mocked(updateOpeningHours),
  addBranch: jest.mocked(addBranch),
  updateBranchHours: jest.mocked(updateBranchHours),
};

const MAIN_ID = '11111111-1111-4111-8111-111111111111';
const MAADI: Branch = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Fatma Bakery',
  address: '9 Road 9, Maadi',
  latitude: 29.96,
  longitude: 31.25,
  opensAt: '08:00',
  closesAt: '20:00',
};

/** The shop; its first branch (D-64) is the shop itself with the shop's hours. */
function shop(overrides: Partial<Shop> = {}, extraBranches: Branch[] = []): Shop {
  const base = {
    shopName: 'Fatma Bakery',
    vendorType: 'formal' as const,
    address: '12 Tahrir Street, Dokki',
    latitude: 30.0381,
    longitude: 31.2122,
    opensAt: '09:00',
    closesAt: '22:00',
    ...overrides,
  };
  const main: Branch = {
    id: MAIN_ID,
    name: base.shopName,
    address: base.address,
    latitude: base.latitude,
    longitude: base.longitude,
    opensAt: base.opensAt,
    closesAt: base.closesAt,
  };
  return { ...base, branches: [main, ...extraBranches] };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  store.clear();
  store.set(TOKEN_KEY, 'vendor-token');
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.getMe.mockResolvedValue({
    kind: 'ok',
    user: { id: 'v1', role: 'vendor', status: 'Approved', language: 'en' },
  });
  mocked.getShop.mockResolvedValue({ kind: 'ok', shop: shop() });
  mocked.update.mockImplementation((_token, hours) =>
    Promise.resolve({
      kind: 'ok',
      shop: shop({
        opensAt: hours.opensAt === '' ? null : hours.opensAt,
        closesAt: hours.closesAt === '' ? null : hours.closesAt,
      }),
    }),
  );
});

async function openHours() {
  const app = await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('home-opening-hours'));
  await screen.findByTestId('opening-hours-form');
  return app;
}

describe('FR-ACC-02 D-62 the clock picker gives HH:MM', () => {
  test('FR-ACC-02 a picked time becomes HH:MM on the 24-hour clock', () => {
    const date = new Date(2026, 10, 3, 7, 5);
    expect(clockTimeOf(date)).toBe('07:05');
    expect(clockTimeOf(new Date(2026, 10, 3, 23, 30))).toBe('23:30');
  });

  test('FR-ACC-02 the picker starts at the saved time, or 09:00 when there is none', () => {
    const saved = dateAtClockTime('22:15');
    const none = dateAtClockTime(null);
    expect([saved.getHours(), saved.getMinutes()]).toEqual([22, 15]);
    expect([none.getHours(), none.getMinutes()]).toEqual([9, 0]);
  });
});

describe('FR-ACC-02 D-62 the vendor sees and sets the opening hours', () => {
  test('FR-ACC-02 the vendor home shows the opening hours', async () => {
    await renderApp('/home');

    expect(await screen.findByText('Open 09:00–22:00')).toBeOnTheScreen();
  });

  test('FR-ACC-02 a vendor without hours must set them before posting food', async () => {
    mocked.getShop.mockResolvedValue({ kind: 'ok', shop: shop({ opensAt: null, closesAt: null }) });
    const app = await renderApp('/home');

    expect(await screen.findByText(/Set your shop's opening hours before you post food/)).toBeOnTheScreen();
    expect(screen.queryByTestId('home-create-listing')).toBeNull();
    expect(screen.queryByTestId('home-quick-post')).toBeNull();
    await fireEvent.press(screen.getByTestId('home-opening-hours'));
    await screen.findByTestId('opening-hours-form');
    expect(app.getPathname()).toBe('/vendor/hours');
  });

  test('FR-ACC-02 the Opening hours screen starts with the saved hours', async () => {
    const app = await openHours();

    expect(app.getPathname()).toBe('/vendor/hours');
    expect(await screen.findByDisplayValue('09:00')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('22:00')).toBeOnTheScreen();
  });

  test('FR-ACC-02 new hours, also after midnight, are saved', async () => {
    await openHours();
    await screen.findByDisplayValue('09:00');
    await fireEvent.changeText(screen.getByLabelText('Opens at'), '10:00');
    await fireEvent.changeText(screen.getByLabelText('Closes at'), '01:00');

    await fireEvent.press(screen.getByRole('button', { name: 'Save hours' }));

    expect(mocked.update).toHaveBeenCalledWith('vendor-token', { opensAt: '10:00', closesAt: '01:00' });
    expect(await screen.findByText('Opening hours saved.')).toBeOnTheScreen();
  });

  test('E-ACC-02 the hours cannot be left empty', async () => {
    await openHours();
    await screen.findByDisplayValue('09:00');
    await fireEvent.changeText(screen.getByLabelText('Opens at'), '');
    await fireEvent.changeText(screen.getByLabelText('Closes at'), '');

    await fireEvent.press(screen.getByRole('button', { name: 'Save hours' }));

    expect(screen.getByLabelText('Opens at')).toHaveProp('accessibilityHint', 'Choose the opening time.');
    expect(mocked.update).not.toHaveBeenCalled();
  });

  test('E-ACC-02 a closing time equal to the opening time is marked and nothing is sent', async () => {
    await openHours();
    await screen.findByDisplayValue('09:00');
    await fireEvent.changeText(screen.getByLabelText('Closes at'), '09:00');

    await fireEvent.press(screen.getByRole('button', { name: 'Save hours' }));

    expect(screen.getByLabelText('Closes at')).toHaveProp(
      'accessibilityHint',
      'Choose a closing time different from the opening time.',
    );
    expect(mocked.update).not.toHaveBeenCalled();
  });

  test('NFR-06 the Opening hours screen is shown in Arabic', async () => {
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, 'ar');
    mocked.getMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'v1', role: 'vendor', status: 'Approved', language: 'ar' },
    });
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('home-opening-hours'));

    expect(await screen.findByLabelText('يفتح في')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'حفظ المواعيد' })).toBeOnTheScreen();
  });
});

describe('D-64 the vendor adds branches, each with its own opening hours', () => {
  test('FR-ACC-02 D-69 every branch is listed by its address with its own hours', async () => {
    mocked.getShop.mockResolvedValue({ kind: 'ok', shop: shop({}, [MAADI]) });
    await openHours();

    expect(await screen.findByText(MAADI.address)).toBeOnTheScreen();
    expect(screen.getByTestId(`branch-${MAADI.id}-opens-at`)).toHaveDisplayValue('08:00');
    expect(screen.getByTestId(`branch-${MAADI.id}-closes-at`)).toHaveDisplayValue('20:00');
  });

  test("FR-ACC-02 a branch's hours are saved for that branch only", async () => {
    mocked.getShop.mockResolvedValue({ kind: 'ok', shop: shop({}, [MAADI]) });
    mocked.updateBranchHours.mockResolvedValue({ kind: 'ok', branch: { ...MAADI, closesAt: '23:00' } });
    await openHours();
    await fireEvent.changeText(await screen.findByTestId(`branch-${MAADI.id}-closes-at`), '23:00');

    await fireEvent.press(screen.getByTestId(`branch-${MAADI.id}-save`));

    expect(mocked.updateBranchHours).toHaveBeenCalledWith('vendor-token', MAADI.id, {
      opensAt: '08:00',
      closesAt: '23:00',
    });
    expect(mocked.update).not.toHaveBeenCalled();
  });

  test('FR-ACC-02 D-69 a new branch with an address, pin and hours (no name) is added to the list', async () => {
    mocked.addBranch.mockResolvedValue({ kind: 'ok', branch: MAADI });
    await openHours();
    await fireEvent.press(await screen.findByTestId('add-branch'));
    await fireEvent.changeText(screen.getByLabelText('Written address'), '9 Road 9, Maadi');
    await fireEvent.press(screen.getByTestId('map-view'));
    await fireEvent.changeText(screen.getByTestId('new-branch-opens-at'), '08:00');
    await fireEvent.changeText(screen.getByTestId('new-branch-closes-at'), '20:00');

    await fireEvent.press(screen.getByTestId('new-branch-save'));

    expect(mocked.addBranch).toHaveBeenCalledWith(
      'vendor-token',
      expect.objectContaining({
        address: '9 Road 9, Maadi',
        opensAt: '08:00',
        closesAt: '20:00',
      }),
    );
    // D-69: the branch carries the store name, so the app sends none.
    expect(mocked.addBranch.mock.calls[0]?.[1]).not.toHaveProperty('name');
    expect(await screen.findByText(MAADI.address)).toBeOnTheScreen();
  });

  test('E-ACC-02 a new branch without a pin or hours is marked and nothing is sent', async () => {
    await openHours();
    await fireEvent.press(await screen.findByTestId('add-branch'));

    await fireEvent.press(screen.getByTestId('new-branch-save'));

    expect(screen.getByTestId('new-branch-opens-at')).toHaveProp(
      'accessibilityHint',
      'Choose the opening time.',
    );
    expect(mocked.addBranch).not.toHaveBeenCalled();
  });

  // Found on the phone (2026-11-04): a dragged pin jumped back when its address arrived.
  test('FR-ACC-02 a new branch pin stays where it is placed when its address arrives', async () => {
    jest
      .mocked(Location.reverseGeocodeAsync)
      .mockResolvedValue([{ formattedAddress: '9 Road 9, Maadi' } as Location.LocationGeocodedAddress]);
    mocked.addBranch.mockResolvedValue({ kind: 'ok', branch: MAADI });
    await openHours();
    await fireEvent.press(await screen.findByTestId('add-branch'));

    await fireEvent.press(screen.getByTestId('map-view'));
    await waitFor(() => {
      expect(screen.getByLabelText('Written address')).toHaveDisplayValue('9 Road 9, Maadi');
    });
    expect(screen.getByText('Pin: 30.05000, 31.25000')).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('new-branch-opens-at'), '08:00');
    await fireEvent.changeText(screen.getByTestId('new-branch-closes-at'), '20:00');
    await fireEvent.press(screen.getByTestId('new-branch-save'));

    expect(mocked.addBranch).toHaveBeenCalledWith(
      'vendor-token',
      expect.objectContaining({ address: '9 Road 9, Maadi', latitude: 30.05, longitude: 31.25 }),
    );
  });
});
