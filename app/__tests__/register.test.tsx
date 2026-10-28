// US-01 Register screen (FR-ACC-01, E-ACC-01, E-ACC-02, IF-UI-06, NFR-07a). The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { registerConsumer } from '@/api/client';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  registerConsumer: jest.fn(),
}));

const mockedRegister = jest.mocked(registerConsumer);

beforeEach(async () => {
  await AsyncStorage.clear();
  mockedRegister.mockReset();
});

async function openRegister() {
  const result = await renderApp('/register');
  await screen.findByText('Sign up with your email address or your mobile number.');
  return result;
}

async function submit() {
  await fireEvent.press(screen.getByRole('button', { name: 'Create account' }));
}

describe('FR-ACC-01 registering on the app', () => {
  test('FR-ACC-01 app registers with a valid email and shows the success screen', async () => {
    mockedRegister.mockResolvedValue({ kind: 'created', id: 'u1' });
    const app = await openRegister();

    await fireEvent.changeText(screen.getByLabelText('Email address'), 'mona@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'abcd1234');
    await submit();

    expect(await screen.findByTestId('registered-title')).toHaveTextContent('Account created');
    expect(mockedRegister).toHaveBeenCalledWith({
      email: 'mona@example.com',
      password: 'abcd1234',
      language: 'en',
    });
    expect(app.getPathname()).toBe('/registered');
  });

  test('FR-ACC-01 app registers with a mobile number and sends the chosen language', async () => {
    mockedRegister.mockResolvedValue({ kind: 'created', id: 'u2' });
    await openRegister();

    await fireEvent.press(screen.getByRole('button', { name: 'العربية' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'رقم الهاتف المحمول' }));
    await fireEvent.changeText(screen.getByTestId('register-phone'), '01012345678');
    await fireEvent.changeText(screen.getByLabelText('كلمة المرور'), 'abcd1234');
    await fireEvent.press(screen.getByRole('button', { name: 'إنشاء الحساب' }));

    expect(await screen.findByTestId('registered-title')).toHaveTextContent('تم إنشاء الحساب');
    expect(mockedRegister).toHaveBeenCalledWith({
      phone: '01012345678',
      password: 'abcd1234',
      language: 'ar',
    });
  });
});

describe('E-ACC-02 and IF-UI-06 invalid fields are marked', () => {
  test('E-ACC-02 app marks each invalid field and sends nothing to the server', async () => {
    await openRegister();

    await fireEvent.changeText(screen.getByLabelText('Email address'), 'userexample.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'short');
    await submit();

    expect(await screen.findByText('Please correct the highlighted fields.')).toBeOnTheScreen();
    expect(screen.getByText('Enter a valid email address, for example name@example.com.')).toBeOnTheScreen();
    expect(screen.getByText('The password does not meet the rules below.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Email address').props['aria-invalid']).toBe(true);
    expect(screen.getByLabelText('Password').props['aria-invalid']).toBe(true);
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  test('E-ACC-02 app asks for the email when the field is empty', async () => {
    await openRegister();

    await fireEvent.changeText(screen.getByLabelText('Password'), 'abcd1234');
    await submit();

    expect(await screen.findByText('Enter your email address.')).toBeOnTheScreen();
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  test('E-ACC-02 app marks the fields the server reports as invalid', async () => {
    mockedRegister.mockResolvedValue({ kind: 'invalid', fields: ['password'] });
    await openRegister();

    await fireEvent.changeText(screen.getByLabelText('Email address'), 'mona@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'abcd1234');
    await submit();

    expect(await screen.findByText('The password does not meet the rules below.')).toBeOnTheScreen();
  });
});

describe('E-ACC-01 email or phone already registered', () => {
  test('E-ACC-01 app offers Log in and Reset password when the email is already registered', async () => {
    mockedRegister.mockResolvedValue({ kind: 'duplicate', field: 'email' });
    await openRegister();

    await fireEvent.changeText(screen.getByLabelText('Email address'), 'mona@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'abcd1234');
    await submit();

    expect(await screen.findByText('This email is already registered')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Reset password' }));
    expect(
      await screen.findByText(
        'Password reset is not in the app yet. Please contact the NoWaste team and they will reset your password.',
      ),
    ).toBeOnTheScreen();
  });

  test('E-ACC-01 app names the mobile number when the phone is already registered', async () => {
    mockedRegister.mockResolvedValue({ kind: 'duplicate', field: 'phone' });
    await openRegister();

    await fireEvent.press(screen.getByRole('button', { name: 'Mobile number' }));
    await fireEvent.changeText(screen.getByTestId('register-phone'), '01012345678');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'abcd1234');
    await submit();

    expect(await screen.findByText('This mobile number is already registered')).toBeOnTheScreen();
  });
});

describe('NFR-07a accessibility labels', () => {
  function expectEveryControlLabelled(expectedInputs: number) {
    const unlabelledButtons = screen
      .getAllByRole('button')
      .filter(
        (button) =>
          !(typeof button.props.accessibilityLabel === 'string' && button.props.accessibilityLabel !== ''),
      );
    // Every text input on these screens has a testID starting with "register-" and is not a button.
    const unlabelledInputs = screen
      .queryAllByTestId(/^register-(email|phone|password)$/)
      .filter(
        (input) =>
          !(typeof input.props.accessibilityLabel === 'string' && input.props.accessibilityLabel !== ''),
      );
    expect(screen.queryAllByTestId(/^register-(email|phone|password)$/)).toHaveLength(expectedInputs);
    expect(unlabelledButtons).toHaveLength(0);
    expect(unlabelledInputs).toHaveLength(0);
  }

  test.each(['English', 'العربية'])(
    'NFR-07a every button and input on the Welcome and Register screens has a label (%s)',
    async (languageButton) => {
      await renderApp('/');
      await screen.findByText('Welcome to NoWaste');
      await fireEvent.press(screen.getByRole('button', { name: languageButton }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: languageButton })).toBeSelected();
      });
      expectEveryControlLabelled(0);

      // D-30: choose the consumer role (the first option) before Register appears.
      await fireEvent.press(screen.getAllByRole('radio')[0]!);
      expectEveryControlLabelled(0);
      await fireEvent.press(screen.getByTestId('welcome-register'));
      await screen.findAllByTestId('register-submit');
      expectEveryControlLabelled(2);
    },
  );
});

describe('Register screen details', () => {
  test('NFR-07a the password can be shown and hidden, and the control says what it does', async () => {
    await openRegister();
    const password = screen.getByTestId('register-password');
    expect(password.props.secureTextEntry).toBe(true);

    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByTestId('register-password').props.secureTextEntry).toBe(false);

    await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByTestId('register-password').props.secureTextEntry).toBe(true);
  });

  test('IF-UI-06 switching between Email and Mobile number clears the field and its error', async () => {
    await openRegister();
    await submit();
    expect(await screen.findByText('Enter your email address.')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Mobile number' }));
    expect(screen.queryByText('Enter your email address.')).not.toBeOnTheScreen();
    await fireEvent.changeText(screen.getByTestId('register-phone'), '0101');

    await fireEvent.press(screen.getByRole('button', { name: 'Email' }));
    expect(screen.getByTestId('register-email').props.value).toBe('');
  });

  test('FR-ACC-01 app tells the user when the server cannot be reached', async () => {
    mockedRegister.mockResolvedValue({ kind: 'unreachable' });
    await openRegister();

    await fireEvent.changeText(screen.getByLabelText('Email address'), 'mona@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'abcd1234');
    await submit();

    expect(
      await screen.findByText('We could not reach the server. Check your connection and try again.'),
    ).toBeOnTheScreen();
  });

  test('FR-ACC-01 app shows a general error when the server answer is unexpected', async () => {
    mockedRegister.mockResolvedValue({ kind: 'unexpected' });
    await openRegister();

    await fireEvent.changeText(screen.getByLabelText('Email address'), 'mona@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'abcd1234');
    await submit();

    expect(await screen.findByText('Something went wrong. Please try again.')).toBeOnTheScreen();
  });

  test('E-ACC-01 FR-ACC-04 Log in in the already-registered notice opens Log in with the email filled in', async () => {
    mockedRegister.mockResolvedValue({ kind: 'duplicate', field: 'email' });
    await openRegister();

    await fireEvent.changeText(screen.getByLabelText('Email address'), 'mona@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'abcd1234');
    await submit();
    await fireEvent.press(await screen.findByRole('button', { name: 'Log in' }));

    expect(await screen.findByLabelText('Email address or mobile number')).toHaveDisplayValue(
      'mona@example.com',
    );
  });
});

describe('Welcome and Account created screens', () => {
  test('FR-ACC-04 Log in on the Welcome screen opens the Log in screen', async () => {
    const app = await renderApp('/');
    // D-30: a role is chosen first; Log in then appears.
    await fireEvent.press(await screen.findByRole('radio', { name: 'Consumer' }));
    await fireEvent.press(screen.getByTestId('welcome-login'));

    expect(await screen.findByLabelText('Email address or mobile number')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/login');
  });

  test('FR-ACC-01 Back to start on the success screen returns to the Welcome screen', async () => {
    mockedRegister.mockResolvedValue({ kind: 'created', id: 'u3' });
    const app = await renderApp('/');
    await fireEvent.press(await screen.findByRole('radio', { name: 'Consumer' }));
    await fireEvent.press(screen.getByTestId('welcome-register'));
    await fireEvent.changeText(await screen.findByLabelText('Email address'), 'mona@example.com');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'abcd1234');
    await submit();
    await screen.findByTestId('registered-title');

    await fireEvent.press(screen.getByRole('button', { name: 'Back to start' }));

    expect(await screen.findByText('Welcome to NoWaste')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/');
  });

  test.each(['English', 'العربية'])(
    'NFR-07a every button on the Account created screen has a label and the success mark is announced (%s)',
    async (languageButton) => {
      await renderApp('/registered');
      await screen.findByTestId('registered-title');
      await fireEvent.press(screen.getByRole('button', { name: languageButton }));
      await waitFor(() => {
        expect(screen.getByRole('button', { name: languageButton })).toBeSelected();
      });

      const unlabelled = screen
        .getAllByRole('button')
        .filter(
          (button) =>
            !(typeof button.props.accessibilityLabel === 'string' && button.props.accessibilityLabel !== ''),
        );
      expect(unlabelled).toHaveLength(0);
      expect(
        screen.getByRole('image', { name: languageButton === 'English' ? 'Success' : 'تم بنجاح' }),
      ).toBeOnTheScreen();
    },
  );
});
