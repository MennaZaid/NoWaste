// US-07 Approve/reject on the app (FR-ACC-07, NFR-06). The administrator sees the Pending applications, opens one
// (details and a map with the pin) and approves or rejects it. The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { decideApplication, getMe, listApplications, type Application } from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  login: jest.fn(),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  listApplications: jest.fn(),
  decideApplication: jest.fn(),
}));

const mockedGetMe = jest.mocked(getMe);
const mockedList = jest.mocked(listApplications);
const mockedDecide = jest.mocked(decideApplication);
const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;

const vendorApplication: Application = {
  userId: 'v1',
  role: 'vendor',
  status: 'Pending',
  email: 'shop@example.com',
  phone: null,
  createdAt: '2026-10-27T09:00:00.000Z',
  vendorProfile: {
    shopName: 'Fatma Bakery',
    vendorType: 'informal',
    contact: '+201012345678',
    description: 'Fresh bread baked daily',
    address: '12 Tahrir Street, Dokki',
    latitude: 30.0381,
    longitude: 31.2122,
  },
  partnerProfile: null,
};

const partnerApplication: Application = {
  userId: 'p1',
  role: 'other',
  status: 'Pending',
  email: null,
  phone: '+201112345678',
  createdAt: '2026-10-27T10:00:00.000Z',
  vendorProfile: null,
  partnerProfile: {
    organisationName: 'Giza Food Bank',
    otherPartnerType: 'Mosque food committee',
    acceptedFoodTypes: ['cooked_meals'],
    otherFoodType: 'Animal feed',
    address: '5 Nile Corniche, Giza',
    latitude: 30.0131,
    longitude: 31.2089,
  },
};

beforeEach(async () => {
  await AsyncStorage.clear();
  store.clear();
  store.set(TOKEN_KEY, 'admin-token');
  mockedGetMe.mockResolvedValue({
    kind: 'ok',
    user: { id: 'a1', role: 'admin', status: 'Active', language: 'en' },
  });
  mockedList
    .mockReset()
    .mockResolvedValue({ kind: 'ok', applications: [vendorApplication, partnerApplication] });
  mockedDecide.mockReset();
});

async function openAdminHome() {
  const app = await renderApp('/');
  await screen.findByTestId('home-admin');
  return app;
}

describe('FR-ACC-07 pending applications on the app', () => {
  test('FR-ACC-07 the administrator home lists the Pending applications', async () => {
    await openAdminHome();

    const list = await screen.findByTestId('applications-list');
    expect(within(list).getByText('Fatma Bakery')).toBeOnTheScreen();
    expect(within(list).getByText('Giza Food Bank')).toBeOnTheScreen();
    expect(within(list).getByText('Vendor · Informal')).toBeOnTheScreen();
    expect(within(list).getByText('Other partner: Mosque food committee')).toBeOnTheScreen();
    expect(mockedList).toHaveBeenCalledWith('admin-token', 'Pending');
  });

  test('FR-ACC-07 no Pending applications is said plainly', async () => {
    mockedList.mockResolvedValue({ kind: 'ok', applications: [] });
    await openAdminHome();

    expect(await screen.findByText('No applications are waiting.')).toBeOnTheScreen();
  });

  test('FR-ACC-07 opening a vendor application shows its details and a map with its pin', async () => {
    const app = await openAdminHome();

    await fireEvent.press(await screen.findByRole('button', { name: /Fatma Bakery/ }));

    expect(await screen.findByTestId('application-details')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/admin/v1');
    expect(screen.getByText('shop@example.com')).toBeOnTheScreen();
    expect(screen.getByText('+201012345678')).toBeOnTheScreen();
    expect(screen.getByText('Fresh bread baked daily')).toBeOnTheScreen();
    expect(screen.getByText('12 Tahrir Street, Dokki')).toBeOnTheScreen();
    expect(screen.getByText('Pin: 30.03810, 31.21220')).toBeOnTheScreen();
    expect(screen.getByTestId('application-map')).toBeOnTheScreen();
  });

  test('FR-ACC-07 a partner application shows the partner type and the food types, with Other written out', async () => {
    await openAdminHome();

    await fireEvent.press(await screen.findByRole('button', { name: /Giza Food Bank/ }));

    expect(await screen.findByText('Mosque food committee')).toBeOnTheScreen();
    expect(screen.getByText('Cooked meals, Other: Animal feed')).toBeOnTheScreen();
    expect(screen.getByText('+201112345678')).toBeOnTheScreen();
  });

  test('FR-ACC-07 Approve asks to confirm, approves, and the list no longer shows the application', async () => {
    mockedDecide.mockResolvedValue({ kind: 'ok', status: 'Approved' });
    const app = await openAdminHome();
    await fireEvent.press(await screen.findByRole('button', { name: /Fatma Bakery/ }));
    await screen.findByTestId('application-details');

    await fireEvent.press(screen.getByRole('button', { name: 'Approve' }));
    expect(mockedDecide).not.toHaveBeenCalled();
    mockedList.mockResolvedValue({ kind: 'ok', applications: [partnerApplication] });
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, approve' }));

    await waitFor(() => {
      expect(app.getPathname()).toBe('/home');
    });
    expect(mockedDecide).toHaveBeenCalledWith('admin-token', 'v1', 'approve');
    expect(await screen.findByText('Application approved.')).toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.queryByText('Fatma Bakery')).toBeNull();
    });
  });

  test('FR-ACC-07 Reject, then Cancel, sends nothing; Reject, then Yes, rejects', async () => {
    mockedDecide.mockResolvedValue({ kind: 'ok', status: 'Rejected' });
    await openAdminHome();
    await fireEvent.press(await screen.findByRole('button', { name: /Giza Food Bank/ }));
    await screen.findByTestId('application-details');

    await fireEvent.press(screen.getByRole('button', { name: 'Reject' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockedDecide).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Reject' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, reject' }));

    expect(await screen.findByText('Application rejected.')).toBeOnTheScreen();
    expect(mockedDecide).toHaveBeenCalledWith('admin-token', 'p1', 'reject');
  });

  test('FR-ACC-07 an application already decided by someone else is explained (409)', async () => {
    mockedDecide.mockResolvedValue({ kind: 'conflict', status: 'Approved' });
    await openAdminHome();
    await fireEvent.press(await screen.findByRole('button', { name: /Fatma Bakery/ }));
    await screen.findByTestId('application-details');

    await fireEvent.press(screen.getByRole('button', { name: 'Reject' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, reject' }));

    expect(
      await screen.findByText('This application was already decided. Its status is now Approved.'),
    ).toBeOnTheScreen();
  });
});

describe('NFR-06 pending applications in Arabic', () => {
  test('NFR-06 the applications list and the details are in Arabic and right-to-left', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    mockedGetMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'a1', role: 'admin', status: 'Active', language: 'ar' },
    });
    await renderApp('/');

    expect(await screen.findByText('الطلبات المعلّقة')).toBeOnTheScreen();
    expect(screen.getByTestId('home-admin')).toHaveStyle({ direction: 'rtl' });
    await fireEvent.press(await screen.findByRole('button', { name: /Fatma Bakery/ }));
    expect(await screen.findByRole('button', { name: 'قبول' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'رفض' })).toBeOnTheScreen();
    expect(screen.getByTestId('application-details')).toHaveStyle({ direction: 'rtl' });
  });
});
