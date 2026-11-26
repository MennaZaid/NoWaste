// US-44 Impact numbers on the app (FR-TGI-07, NFR-05a, NFR-06, decision D-118): every user opens the impact screen
// and sees the platform-wide numbers and their own; CO2 avoided is labelled Estimate; Arabic shows Arabic digits
// right-to-left. The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, within } from 'expo-router/testing-library';
import * as Location from 'expo-location';
import { getImpact, getMe, getNearbyOffers, listApplications, type ImpactView } from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import en from '../src/i18n/en.json';
import ar from '../src/i18n/ar.json';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getImpact: jest.fn(),
  listApplications: jest.fn(),
  getNearbyOffers: jest.fn(),
  downloadListingPhoto: jest.fn().mockResolvedValue(null),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;
const mocked = {
  getMe: jest.mocked(getMe),
  impact: jest.mocked(getImpact),
  list: jest.mocked(listApplications),
  nearby: jest.mocked(getNearbyOffers),
  permission: jest.mocked(Location.requestForegroundPermissionsAsync),
  position: jest.mocked(Location.getCurrentPositionAsync),
};

const IMPACT: ImpactView = {
  platform: { mealsRescued: 6, moneySaved: 180, co2AvoidedKg: 15, bagsComposted: 3, bagsLandfill: 1 },
  mine: { mealsRescued: 3, moneySaved: 72.5, co2AvoidedKg: 7.5, bagsComposted: 0, bagsLandfill: 0 },
  co2KgPerBag: 2.5,
};

type Role = 'consumer' | 'admin' | 'other';

function signIn(role: Role, language: 'en' | 'ar' = 'en') {
  store.set(TOKEN_KEY, `${role}-token`);
  mocked.getMe.mockResolvedValue({
    kind: 'ok',
    user: { id: 'u1', role, status: role === 'other' ? 'Approved' : 'Active', language },
  });
}

/** A partner ("other", no food functions) or the administrator opens the impact screen from their home. */
async function openImpact(role: Exclude<Role, 'consumer'> = 'other', language: 'en' | 'ar' = 'en') {
  signIn(role, language);
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('home-impact'));
  await screen.findByTestId('impact-screen');
}

beforeEach(async () => {
  await AsyncStorage.clear();
  store.clear();
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.impact.mockResolvedValue({ kind: 'ok', impact: IMPACT });
  mocked.list.mockResolvedValue({ kind: 'ok', applications: [] });
  mocked.permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
  mocked.position.mockResolvedValue({
    coords: { latitude: 30.0381, longitude: 31.2122 },
  } as Location.LocationObject);
  mocked.nearby.mockResolvedValue({
    kind: 'ok',
    radius: { km: 10, defaultKm: 10, minKm: 1, maxKm: 50, stepKm: 1 },
    offers: [],
  });
});

describe('FR-TGI-07 the impact screen', () => {
  test('FR-TGI-07 shows the platform-wide numbers and the user own numbers', async () => {
    await openImpact();

    const platform = within(await screen.findByTestId('impact-platform'));
    expect(platform.getByText(en.impact.platform)).toBeOnTheScreen();
    expect(within(screen.getByTestId('impact-platform-meals')).getByText('6')).toBeOnTheScreen();
    expect(within(screen.getByTestId('impact-platform-money')).getByText('180 EGP')).toBeOnTheScreen();
    expect(within(screen.getByTestId('impact-platform-composted')).getByText('3')).toBeOnTheScreen();
    expect(within(screen.getByTestId('impact-platform-landfill')).getByText('1')).toBeOnTheScreen();

    const mine = within(screen.getByTestId('impact-mine'));
    expect(mine.getByText(en.impact.mine)).toBeOnTheScreen();
    expect(within(screen.getByTestId('impact-mine-meals')).getByText('3')).toBeOnTheScreen();
    expect(within(screen.getByTestId('impact-mine-money')).getByText('72.5 EGP')).toBeOnTheScreen();
    expect(mocked.impact).toHaveBeenCalledWith('other-token');
  });

  test('NFR-05a FR-TGI-07 CO2 avoided is labelled Estimate, with the factor it comes from', async () => {
    await openImpact();

    expect(
      within(await screen.findByTestId('impact-platform-co2')).getByText('Estimate: 15 kg'),
    ).toBeOnTheScreen();
    expect(within(screen.getByTestId('impact-mine-co2')).getByText('Estimate: 7.5 kg')).toBeOnTheScreen();
    expect(screen.getByText('CO2 avoided is an estimate: 2.5 kg for each rescued bag.')).toBeOnTheScreen();
  });

  test('FR-TGI-07 D-118 the administrator sees only the platform-wide numbers', async () => {
    await openImpact('admin');

    await screen.findByTestId('impact-platform');
    expect(screen.queryByTestId('impact-mine')).toBeNull();
  });

  test('FR-TGI-07 a failed load says so', async () => {
    mocked.impact.mockResolvedValue({ kind: 'unreachable' });
    await openImpact();

    expect(await screen.findByText(en.impact.loadFailed)).toBeOnTheScreen();
  });

  test('NFR-06 FR-TGI-07 in Arabic the numbers use Arabic digits and the screen is right-to-left', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    await openImpact('other', 'ar');

    expect(await screen.findByText(ar.impact.platform)).toBeOnTheScreen();
    expect(within(screen.getByTestId('impact-platform-money')).getByText('١٨٠ جنيه')).toBeOnTheScreen();
    expect(within(screen.getByTestId('impact-mine-co2')).getByText('تقدير: ٧٫٥ كجم')).toBeOnTheScreen();
    expect(screen.getByTestId('impact-screen')).toHaveStyle({ direction: 'rtl' });
  });

  test('FR-TGI-07 a customer opens the impact numbers from the profile menu', async () => {
    signIn('consumer');
    await renderApp('/home');

    await fireEvent.press(await screen.findByTestId('header-profile'));
    await fireEvent.press(await screen.findByTestId('profile-menu-impact'));

    expect(await screen.findByTestId('impact-mine')).toBeOnTheScreen();
    expect(mocked.impact).toHaveBeenCalledWith('consumer-token');
  });

  test('NFR-05a no impact text says the food is safe', () => {
    for (const texts of [en.impact, ar.impact, en.landfill, ar.landfill, en.calories, ar.calories]) {
      expect(JSON.stringify(texts).toLowerCase()).not.toMatch(/safe|آمن/);
    }
  });
});
