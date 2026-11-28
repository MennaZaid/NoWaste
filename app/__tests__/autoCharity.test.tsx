// US-23 Automatic charity offers on the app (FR-RTE-11, NFR-06; decision D-112): the vendor home has a switch that turns
// automatic charity offers on and off. The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { getAutoCharity, getMe, getShop, setAutoCharity, type Shop } from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import en from '../src/i18n/en.json';
import ar from '../src/i18n/ar.json';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  getNotifications: jest.fn().mockResolvedValue({ kind: 'ok', notifications: [], unreadCount: 0 }),
  readNotifications: jest.fn().mockResolvedValue(true),
  getMyWaitlist: jest.fn().mockResolvedValue({ kind: 'ok', entries: [] }),
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getShop: jest.fn(),
  getAutoCharity: jest.fn(),
  setAutoCharity: jest.fn(),
}));

const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;
const mocked = {
  getMe: jest.mocked(getMe),
  getShop: jest.mocked(getShop),
  get: jest.mocked(getAutoCharity),
  set: jest.mocked(setAutoCharity),
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
  mocked.get.mockResolvedValue({ kind: 'ok', optIn: false });
  mocked.set.mockResolvedValue({ kind: 'ok', optIn: true });
});

describe('FR-RTE-11 the vendor turns automatic charity offers on and off', () => {
  test('FR-RTE-11 the vendor home shows the switch, off by default, with what it does', async () => {
    await renderApp('/home');

    const toggle = await screen.findByLabelText(en.autoCharity.label);
    expect(toggle.props.value).toBe(false);
    expect(screen.getByText(en.autoCharity.hint)).toBeOnTheScreen();
  });

  test('FR-RTE-11 turning it on saves the choice', async () => {
    await renderApp('/home');
    const toggle = await screen.findByLabelText(en.autoCharity.label);

    await fireEvent(toggle, 'valueChange', true);

    await waitFor(() => expect(mocked.set).toHaveBeenCalledWith('vendor-token', true));
    expect(screen.getByLabelText(en.autoCharity.label).props.value).toBe(true);
  });

  test('FR-RTE-11 when saving fails the switch goes back and says so', async () => {
    mocked.set.mockResolvedValue({ kind: 'unreachable' });
    await renderApp('/home');
    const toggle = await screen.findByLabelText(en.autoCharity.label);

    await fireEvent(toggle, 'valueChange', true);

    expect(await screen.findByText(en.autoCharity.failed)).toBeOnTheScreen();
    expect(screen.getByLabelText(en.autoCharity.label).props.value).toBe(false);
  });

  test('NFR-06 the switch is labelled in Arabic', async () => {
    mocked.getMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'v1', role: 'vendor', status: 'Approved', language: 'ar' },
    });
    await AsyncStorage.setItem('nowaste.language', 'ar');
    await renderApp('/home');

    expect(await screen.findByLabelText(ar.autoCharity.label)).toBeOnTheScreen();
  });
});
