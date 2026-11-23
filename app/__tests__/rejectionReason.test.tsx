// D-105 (2026-11-17) on the app: the administrator picks a reason (and an optional note, required for Other) when
// rejecting; a reapplication is marked "Reapplied" with the last reason. The rejected vendor or partner sees the
// reason, the note and the support contact, and may fix the whole application (without the login details) and send it
// again, after which it is Pending. The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import {
  decideApplication,
  getMe,
  getMyApplication,
  listApplications,
  sendApplicationAgain,
  type Application,
  type MyApplication,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  getAutoCharity: jest.fn().mockResolvedValue({ kind: 'ok', optIn: false }),
  setAutoCharity: jest.fn().mockResolvedValue({ kind: 'ok', optIn: true }),
  getListingAutoOffer: jest.fn().mockResolvedValue({ kind: 'ok', offer: null }),
  getListingPartnerPickup: jest.fn().mockResolvedValue({ kind: 'ok', pickup: null }),
  isServerHealthy: jest.fn().mockResolvedValue(true),
  login: jest.fn(),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  listApplications: jest.fn(),
  decideApplication: jest.fn(),
  getMyApplication: jest.fn(),
  sendApplicationAgain: jest.fn(),
  submitApplication: jest.fn(),
  registerConsumer: jest.fn(),
}));

const mocked = {
  getMe: jest.mocked(getMe),
  list: jest.mocked(listApplications),
  decide: jest.mocked(decideApplication),
  mine: jest.mocked(getMyApplication),
  resend: jest.mocked(sendApplicationAgain),
};
const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;

const partnerApplication: Application = {
  userId: 'p1',
  role: 'charity',
  status: 'Pending',
  email: 'org@example.com',
  phone: null,
  createdAt: '2026-11-10T10:00:00.000Z',
  vendorProfile: null,
  partnerProfile: {
    organisationName: 'Giza Food Bank',
    otherPartnerType: null,
    acceptedFoodTypes: ['cooked_meals'],
    otherFoodType: null,
    address: '5 Nile Corniche, Giza',
    latitude: 30.0131,
    longitude: 31.2089,
  },
  lastRejection: null,
};

const reapplied: Application = {
  ...partnerApplication,
  userId: 'p2',
  partnerProfile: { ...partnerApplication.partnerProfile!, organisationName: 'Dokki Kitchen' },
  lastRejection: {
    reason: 'wrong_contact',
    note: 'The phone does not answer.',
    rejectedAt: '2026-11-12T09:00:00.000Z',
  },
};

const rejectedVendor: MyApplication = {
  role: 'vendor',
  status: 'Rejected',
  vendorProfile: {
    shopName: 'Fatma Bakery',
    vendorType: 'formal',
    contact: '+201012345678',
    description: null,
    address: '12 Tahrir Street, Dokki',
    latitude: 30.0381,
    longitude: 31.2122,
    opensAt: '08:00',
    closesAt: '20:00',
    branches: [],
  },
  partnerProfile: null,
  rejection: {
    reason: 'wrong_location',
    note: 'The pin is in the Nile.',
    rejectedAt: '2026-11-12T09:00:00.000Z',
  },
  supportContact: { email: 'support@nowaste.example' },
};

function signedInAs(role: 'admin' | 'vendor', status: 'Active' | 'Rejected', language: 'en' | 'ar' = 'en') {
  store.set(TOKEN_KEY, `${role}-token`);
  mocked.getMe.mockResolvedValue({ kind: 'ok', user: { id: 'u1', role, status, language } });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  store.clear();
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.list.mockResolvedValue({ kind: 'ok', applications: [partnerApplication, reapplied] });
  mocked.mine.mockResolvedValue({ kind: 'ok', application: rejectedVendor });
});

async function openApplication(name: RegExp) {
  signedInAs('admin', 'Active');
  await renderApp('/');
  await screen.findByTestId('home-admin');
  await fireEvent.press(await screen.findByRole('button', { name }));
  await screen.findByTestId('application-details');
}

describe('FR-ACC-07 D-105 the administrator gives a reason when rejecting', () => {
  test('FR-ACC-07 D-105 Reject asks for a reason; Yes, reject sends the reason and the note', async () => {
    mocked.decide.mockResolvedValue({ kind: 'ok', status: 'Rejected' });
    await openApplication(/Giza Food Bank/);

    await fireEvent.press(screen.getByRole('button', { name: 'Reject' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, reject' }));
    expect(await screen.findByText('Choose a reason.')).toBeOnTheScreen();
    expect(mocked.decide).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('radio', { name: 'Wrong or unclear location' }));
    await fireEvent.changeText(screen.getByLabelText('Note to the applicant (optional)'), 'Move the pin.');
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, reject' }));

    expect(await screen.findByText('Application rejected.')).toBeOnTheScreen();
    expect(mocked.decide).toHaveBeenCalledWith('admin-token', 'p1', 'reject', {
      reason: 'wrong_location',
      note: 'Move the pin.',
    });
  });

  test('FR-ACC-07 D-105 Other needs a note before rejecting', async () => {
    await openApplication(/Giza Food Bank/);
    await fireEvent.press(screen.getByRole('button', { name: 'Reject' }));

    await fireEvent.press(screen.getByRole('radio', { name: 'Other' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, reject' }));

    expect(await screen.findByText('Write a note when the reason is Other.')).toBeOnTheScreen();
    expect(mocked.decide).not.toHaveBeenCalled();
  });

  test('FR-ACC-07 D-105 a reapplication is marked Reapplied with the last reason, in the list and the details', async () => {
    signedInAs('admin', 'Active');
    await renderApp('/');

    const list = await screen.findByTestId('applications-list');
    expect(within(list).getByText('Reapplied')).toBeOnTheScreen();
    await fireEvent.press(await screen.findByRole('button', { name: /Dokki Kitchen/ }));

    expect(await screen.findByTestId('application-reapplied')).toHaveTextContent(
      'Reapplied. Last rejected for: Missing or wrong contact details. Note: The phone does not answer.',
    );
  });
});

describe('FR-ACC-02 D-105 the rejected applicant sees why and may send the application again', () => {
  test('FR-ACC-02 D-105 a rejected vendor sees the reason, the note and the support contact', async () => {
    signedInAs('vendor', 'Rejected');
    await renderApp('/');

    await screen.findByTestId('home-application-status');
    expect(await screen.findByText('Reason: Wrong or unclear location')).toBeOnTheScreen();
    expect(screen.getByText('Note from the team: The pin is in the Nile.')).toBeOnTheScreen();
    expect(screen.getByText('Questions? Contact support@nowaste.example')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Fix and send again' })).toBeOnTheScreen();
  });

  test('FR-ACC-02 D-105 Fix and send again opens the filled form without login details, sends it, and shows Pending', async () => {
    signedInAs('vendor', 'Rejected');
    mocked.resend.mockResolvedValue({
      kind: 'ok',
      user: { id: 'u1', role: 'vendor', status: 'Pending', language: 'en' },
    });
    const app = await renderApp('/');
    await fireEvent.press(await screen.findByRole('button', { name: 'Fix and send again' }));

    const shopName = await screen.findByLabelText('Shop name');
    await waitFor(() => {
      expect(shopName.props.value).toBe('Fatma Bakery');
    });
    expect(screen.queryByTestId('register-password')).toBeNull();
    expect(screen.queryByTestId('register-email')).toBeNull();
    await fireEvent.changeText(shopName, 'Fatma Bakery Dokki');
    await fireEvent.press(screen.getByRole('button', { name: 'Send again' }));

    await waitFor(() => {
      expect(app.getPathname()).toBe('/home');
    });
    expect(
      await screen.findByText('Your application is Pending. An administrator is reviewing it.'),
    ).toBeOnTheScreen();
    expect(mocked.resend).toHaveBeenCalledWith('vendor-token', {
      role: 'vendor',
      vendorProfile: {
        shopName: 'Fatma Bakery Dokki',
        vendorType: 'formal',
        contact: '01012345678',
        description: '',
        address: '12 Tahrir Street, Dokki',
        latitude: 30.0381,
        longitude: 31.2122,
        opensAt: '08:00',
        closesAt: '20:00',
        branches: [],
      },
    });
  });

  test('E-ACC-02 D-105 an empty field is marked and nothing is sent again', async () => {
    signedInAs('vendor', 'Rejected');
    await renderApp('/');
    await fireEvent.press(await screen.findByRole('button', { name: 'Fix and send again' }));
    const shopName = await screen.findByLabelText('Shop name');
    await waitFor(() => {
      expect(shopName.props.value).toBe('Fatma Bakery');
    });

    await fireEvent.changeText(shopName, '');
    await fireEvent.press(screen.getByRole('button', { name: 'Send again' }));

    expect(await screen.findByText('Enter the shop name.')).toBeOnTheScreen();
    expect(mocked.resend).not.toHaveBeenCalled();
  });

  test('NFR-06 D-105 the reason is shown in Arabic, right-to-left', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    signedInAs('vendor', 'Rejected', 'ar');
    await renderApp('/');

    expect(await screen.findByText('السبب: الموقع خاطئ أو غير واضح')).toBeOnTheScreen();
    expect(screen.getByTestId('application-rejection')).toHaveStyle({ direction: 'rtl' });
  });
});
