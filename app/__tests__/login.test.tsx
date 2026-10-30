// US-04 Log in/out on the app (FR-ACC-04, FR-ACC-09, E-ACC-03, E-ACC-05, E-ACC-06, IF-COM-03, NFR-06). The API is
// mocked; the token is kept in expo-secure-store (an in-memory mock in jest.setup.ts).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { getMe, login, logout, updateMyLanguage, type SessionUser } from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { renderApp } from './helpers/renderApp';
import { headerDirections, headerSlotContents } from './helpers/headerDirection';

jest.mock('@/api/client', () => ({
  // The vendor home asks for the shop (US-10); these tests only check which home opens.
  getShop: jest.fn().mockResolvedValue({ kind: 'unexpected' }),
  isServerHealthy: jest.fn().mockResolvedValue(true),
  registerConsumer: jest.fn(),
  login: jest.fn(),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  listApplications: jest.fn().mockResolvedValue({ kind: 'ok', applications: [] }),
  decideApplication: jest.fn(),
}));

const mockedLogin = jest.mocked(login);
const mockedLogout = jest.mocked(logout);
const mockedGetMe = jest.mocked(getMe);
const mockedUpdateLanguage = jest.mocked(updateMyLanguage);
const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return { id: 'u1', role: 'consumer', status: 'Active', language: 'en', ...overrides };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  store.clear();
  mockedLogin.mockReset();
  mockedGetMe.mockReset();
  mockedLogout.mockClear();
  mockedUpdateLanguage.mockClear();
});

async function openLogin() {
  const app = await renderApp('/login');
  await screen.findByLabelText('Email address or mobile number');
  return app;
}

async function logInWith(emailOrPhone: string, password = 'abcd1234') {
  await fireEvent.changeText(screen.getByLabelText('Email address or mobile number'), emailOrPhone);
  await fireEvent.changeText(screen.getByLabelText('Password'), password);
  await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));
}

describe('FR-ACC-04 logging in on the app', () => {
  test('FR-ACC-04 a consumer logs in with email, the token is saved securely and the consumer home opens', async () => {
    mockedLogin.mockResolvedValue({ kind: 'ok', token: 'tok-1', user: user() });
    const app = await openLogin();

    await logInWith(' mona@example.com ');

    expect(await screen.findByTestId('home-consumer')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/home');
    expect(mockedLogin).toHaveBeenCalledWith('mona@example.com', 'abcd1234');
    expect(store.get(TOKEN_KEY)).toBe('tok-1');
    expect(await AsyncStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  test('FR-ACC-04 a mobile number is accepted in the same field', async () => {
    mockedLogin.mockResolvedValue({ kind: 'ok', token: 'tok-2', user: user() });
    await openLogin();

    await logInWith('01012345678');

    expect(await screen.findByTestId('home-consumer')).toBeOnTheScreen();
    expect(mockedLogin).toHaveBeenCalledWith('01012345678', 'abcd1234');
  });

  test.each([
    ['vendor', 'home-vendor'],
    ['charity', 'home-partner'],
    ['other', 'home-partner'],
    ['admin', 'home-admin'],
  ] as const)('FR-ACC-04 an approved %s gets the home screen of its role', async (role, testID) => {
    mockedLogin.mockResolvedValue({
      kind: 'ok',
      token: 't',
      user: user({ role, status: role === 'admin' ? 'Active' : 'Approved' }),
    });
    await openLogin();

    await logInWith('x@example.com');

    expect(await screen.findByTestId(testID)).toBeOnTheScreen();
  });

  // Decision D-39 (2026-10-28): logging in keeps the language the user is using and saves it on the account. This
  // replaces the earlier rule "after login the app switches to the language saved on the account".
  test('FR-ACC-09 logging in while the app is in Arabic keeps Arabic and saves it on an English account', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    mockedLogin.mockResolvedValue({ kind: 'ok', token: 't-ar', user: user({ language: 'en' }) });
    await renderApp('/login');
    await fireEvent.changeText(
      await screen.findByLabelText('البريد الإلكتروني أو رقم المحمول'),
      'mona@example.com',
    );
    await fireEvent.changeText(screen.getByLabelText('كلمة المرور'), 'abcd1234');
    await fireEvent.press(screen.getByRole('button', { name: 'تسجيل الدخول' }));

    expect(await screen.findByTestId('home-consumer')).toBeOnTheScreen();
    expect(await AsyncStorage.getItem('nowaste.language')).toBe('ar');
    expect(screen.getByRole('button', { name: 'العربية' })).toBeSelected();
    await waitFor(() => {
      expect(mockedUpdateLanguage).toHaveBeenCalledWith('t-ar', 'ar');
    });
  });

  test('FR-ACC-09 logging in while the app is in English keeps English and saves it on an Arabic account', async () => {
    mockedLogin.mockResolvedValue({ kind: 'ok', token: 't-en', user: user({ language: 'ar' }) });
    await openLogin();

    await logInWith('mona@example.com');

    expect(await screen.findByTestId('home-consumer')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'English' })).toBeSelected();
    expect(await AsyncStorage.getItem('nowaste.language')).not.toBe('ar');
    await waitFor(() => {
      expect(mockedUpdateLanguage).toHaveBeenCalledWith('t-en', 'en');
    });
  });

  test('FR-ACC-09 logging in when the account already has the same language sends no update', async () => {
    mockedLogin.mockResolvedValue({ kind: 'ok', token: 't-same', user: user({ language: 'en' }) });
    await openLogin();

    await logInWith('mona@example.com');

    expect(await screen.findByTestId('home-consumer')).toBeOnTheScreen();
    expect(mockedUpdateLanguage).not.toHaveBeenCalled();
  });

  test('FR-ACC-09 reopening the app with a saved session keeps the language of the phone', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    store.set(TOKEN_KEY, 'saved-ar');
    mockedGetMe.mockResolvedValue({ kind: 'ok', user: user({ language: 'en' }) });

    await renderApp('/');

    expect(await screen.findByTestId('home-consumer')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'العربية' })).toBeSelected();
    await waitFor(() => {
      expect(mockedUpdateLanguage).toHaveBeenCalledWith('saved-ar', 'ar');
    });
  });

  test('FR-ACC-09 switching the language while logged in saves it on the account', async () => {
    mockedLogin.mockResolvedValue({ kind: 'ok', token: 'tok-3', user: user({ language: 'en' }) });
    await openLogin();
    await logInWith('mona@example.com');
    await screen.findByTestId('home-consumer');

    await fireEvent.press(screen.getByRole('button', { name: 'العربية' }));

    await waitFor(() => {
      expect(mockedUpdateLanguage).toHaveBeenCalledWith('tok-3', 'ar');
    });
  });
});

describe('E-ACC-03 wrong credentials on the app', () => {
  test('E-ACC-03 a wrong login shows one message that does not say which credential was wrong', async () => {
    mockedLogin.mockResolvedValue({ kind: 'invalid' });
    const app = await openLogin();

    await logInWith('mona@example.com', 'wrong-pass1');

    expect(
      await screen.findByText(
        'The email address, mobile number or password is not correct. Several failed tries pause logging in to this account for a while.',
      ),
    ).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/login');
    expect(store.size).toBe(0);
  });

  test('E-ACC-03 empty fields are marked and nothing is sent', async () => {
    await openLogin();

    await fireEvent.press(screen.getByRole('button', { name: 'Log in' }));

    expect(screen.getByText('Enter your email address or mobile number.')).toBeOnTheScreen();
    expect(screen.getByText('Enter your password.')).toBeOnTheScreen();
    expect(mockedLogin).not.toHaveBeenCalled();
  });

  test('FR-ACC-04 an unreachable server is explained', async () => {
    mockedLogin.mockResolvedValue({ kind: 'unreachable' });
    await openLogin();

    await logInWith('mona@example.com');

    expect(await screen.findByText(/could not reach the server/)).toBeOnTheScreen();
  });
});

describe('FR-ACC-04 IF-COM-03 logging out', () => {
  test('FR-ACC-04 Log out in the header ends the session, deletes the token and shows Welcome', async () => {
    mockedLogin.mockResolvedValue({ kind: 'ok', token: 'tok-4', user: user() });
    const app = await openLogin();
    await logInWith('mona@example.com');
    await screen.findByTestId('home-consumer');

    await fireEvent.press(screen.getByRole('button', { name: 'Log out' }));

    expect(await screen.findByText('Welcome to NoWaste')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/');
    expect(mockedLogout).toHaveBeenCalledWith('tok-4');
    expect(store.size).toBe(0);
  });

  test('FR-ACC-04 a saved token opens the home screen straight away on the next start', async () => {
    store.set(TOKEN_KEY, 'saved');
    mockedGetMe.mockResolvedValue({ kind: 'ok', user: user({ role: 'vendor', status: 'Approved' }) });
    const app = await renderApp('/');

    expect(await screen.findByTestId('home-vendor')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/home');
    expect(mockedGetMe).toHaveBeenCalledWith('saved');
  });

  test('IF-COM-03 a saved token the server refuses is deleted and Welcome is shown', async () => {
    store.set(TOKEN_KEY, 'ended');
    mockedGetMe.mockResolvedValue({ kind: 'unauthorized' });
    await renderApp('/');

    expect(await screen.findByText('Welcome to NoWaste')).toBeOnTheScreen();
    await waitFor(() => {
      expect(store.size).toBe(0);
    });
  });

  test('FR-ACC-04 without a session the home screen sends the user to Welcome', async () => {
    const app = await renderApp('/home');

    expect(await screen.findByText('Welcome to NoWaste')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/');
  });
});

describe('E-ACC-05 E-ACC-06 account status after login', () => {
  test.each([
    ['Pending', 'Your application is Pending. An administrator is reviewing it.'],
    ['Rejected', 'Your application was Rejected.'],
  ] as const)(
    'E-ACC-05 a %s vendor sees the application status and no food functions',
    async (status, text) => {
      mockedLogin.mockResolvedValue({ kind: 'ok', token: 't', user: user({ role: 'vendor', status }) });
      await openLogin();

      await logInWith('shop@example.com');

      expect(await screen.findByTestId('home-application-status')).toBeOnTheScreen();
      expect(screen.getByText(text)).toBeOnTheScreen();
      expect(
        screen.getByText('You cannot post or receive food until your application is approved.'),
      ).toBeOnTheScreen();
      expect(screen.queryByTestId('home-vendor')).toBeNull();
    },
  );

  test('E-ACC-05 a Pending partner sees the application status', async () => {
    mockedLogin.mockResolvedValue({
      kind: 'ok',
      token: 't',
      user: user({ role: 'composting', status: 'Pending' }),
    });
    await openLogin();

    await logInWith('org@example.com');

    expect(await screen.findByTestId('home-application-status')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-partner')).toBeNull();
  });

  test('E-ACC-06 a Suspended account sees that it is suspended and nothing else', async () => {
    mockedLogin.mockResolvedValue({
      kind: 'ok',
      token: 't',
      user: user({ role: 'vendor', status: 'Suspended' }),
    });
    await openLogin();

    await logInWith('shop@example.com');

    expect(await screen.findByTestId('home-suspended')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-vendor')).toBeNull();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeOnTheScreen();
  });

  test('E-ACC-06 a saved token of a now Suspended account shows the suspended screen', async () => {
    store.set(TOKEN_KEY, 'saved');
    mockedGetMe.mockResolvedValue({ kind: 'suspended' });
    await renderApp('/');

    expect(await screen.findByTestId('home-suspended')).toBeOnTheScreen();
  });
});

describe('NFR-06 the Log in screen in Arabic', () => {
  test('NFR-06 the Log in screen and its header are right-to-left in Arabic', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    await renderApp('/login');

    expect(await screen.findByLabelText('البريد الإلكتروني أو رقم المحمول')).toBeOnTheScreen();
    expect(screen.getByTestId('login-screen')).toHaveStyle({ direction: 'rtl' });
    expect(headerDirections()).toContain('rtl');
  });

  test('NFR-07a the Log in fields and the Log out button have screen reader labels', async () => {
    mockedLogin.mockResolvedValue({ kind: 'ok', token: 't', user: user() });
    await openLogin();
    expect(screen.getByLabelText('Password')).toBeOnTheScreen();

    await logInWith('mona@example.com');
    await screen.findByTestId('home-consumer');

    expect(screen.getByRole('button', { name: 'Log out' })).toHaveProp(
      'accessibilityHint',
      'Ends your session on this phone',
    );
  });
});

// D-42 layout, drawn by the home screen itself since D-53: on the phone in Arabic the native header lost its start
// slot (logo and Log out) and cut off the switch, so the home screen no longer uses the native header.
describe('IF-UI-02 the home header after logging in (decisions D-42, D-53)', () => {
  test('IF-UI-02 the home header starts with the logo and Log out beside it, and ends with the language switch', async () => {
    mockedLogin.mockResolvedValue({ kind: 'ok', token: 't-header', user: user() });
    await openLogin();
    await logInWith('mona@example.com');
    await screen.findByTestId('home-consumer');

    const bar = screen.getByTestId('home-header');
    const [start, end] = bar.children as ReturnType<typeof screen.getByTestId>[];
    expect(start?.props.testID).toBe('home-header-start');
    expect(within(start!).getByLabelText('NoWaste logo')).toBeOnTheScreen();
    expect(within(start!).getByRole('button', { name: 'Log out' })).toBeOnTheScreen();
    expect(end?.props.testID).toBe('language-switch');
    // One language switch only: the native header is not shown on the home screen.
    expect(screen.getAllByTestId('language-switch')).toHaveLength(1);
    expect(headerSlotContents().flatMap((s) => s.items)).not.toContain('header-logout');
  });

  test.each([
    ['consumer', 'Active', 'home-consumer'],
    ['vendor', 'Approved', 'home-vendor'],
    ['charity', 'Rejected', 'home-application-status'],
    ['admin', 'Active', 'home-admin'],
  ] as const)(
    'NFR-06 IF-UI-02 in Arabic the %s home header shows the logo and Log out and reads right to left',
    async (role, status, home) => {
      await AsyncStorage.setItem('nowaste.language', 'ar');
      store.set(TOKEN_KEY, `saved-${role}`);
      mockedGetMe.mockResolvedValue({ kind: 'ok', user: user({ role, status, language: 'ar' }) });
      await renderApp('/');
      await screen.findByTestId(home);

      const bar = screen.getByTestId('home-header');
      expect(bar).toHaveStyle({ direction: 'rtl', flexDirection: 'row' });
      const start = within(bar).getByTestId('home-header-start');
      expect(within(start).getByLabelText('شعار NoWaste')).toBeOnTheScreen();
      expect(within(start).getByRole('button', { name: 'تسجيل الخروج' })).toBeOnTheScreen();
      expect(within(bar).getByTestId('language-switch')).toBeOnTheScreen();
    },
  );
});

// Phone testing (2026-10-31): in Arabic, Log out sometimes disappeared from the header, because the wider Arabic text
// "تسجيل الخروج" plus the language switch (and the title on other screens) did not fit, and Android cut it off.
// Log out is now an icon button of one fixed size in both languages (decision D-52).
describe('IF-UI-02 NFR-06 Log out always fits in the header (decision D-52)', () => {
  test('IF-UI-02 Log out in the header is an icon with no text, the same fixed size in English and in Arabic', async () => {
    mockedLogin.mockResolvedValue({ kind: 'ok', token: 't-icon', user: user() });
    await openLogin();
    await logInWith('mona@example.com');
    await screen.findByTestId('home-consumer');

    expect(screen.getByRole('button', { name: 'Log out' })).toHaveStyle({ width: 48, height: 48 });
    expect(screen.queryByText('Log out')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'العربية' }));

    const arabic = await screen.findByRole('button', { name: 'تسجيل الخروج' });
    expect(arabic).toHaveStyle({ width: 48, height: 48 });
    expect(arabic).toHaveProp('accessibilityHint', 'ينهي جلستك على هذا الهاتف');
    expect(screen.queryByText('تسجيل الخروج')).toBeNull();
  });

  test.each([
    ['vendor', 'Approved', 'home-vendor'],
    ['admin', 'Active', 'home-admin'],
  ] as const)(
    'FR-ACC-04 NFR-06 a %s who logs in in Arabic can log out from the header',
    async (role, status, home) => {
      await AsyncStorage.setItem('nowaste.language', 'ar');
      mockedLogin.mockResolvedValue({ kind: 'ok', token: `t-${role}`, user: user({ role, status }) });
      const app = await renderApp('/login');
      await fireEvent.changeText(
        await screen.findByLabelText('البريد الإلكتروني أو رقم المحمول'),
        'mona@example.com',
      );
      await fireEvent.changeText(screen.getByLabelText('كلمة المرور'), 'abcd1234');
      await fireEvent.press(screen.getByRole('button', { name: 'تسجيل الدخول' }));
      await screen.findByTestId(home);

      await fireEvent.press(screen.getByRole('button', { name: 'تسجيل الخروج' }));

      await waitFor(() => {
        expect(app.getPathname()).toBe('/');
      });
      expect(mockedLogout).toHaveBeenCalledWith(`t-${role}`);
      expect(store.size).toBe(0);
    },
  );
});
