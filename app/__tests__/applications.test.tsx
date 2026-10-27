// US-02 Vendor application and US-03 Partner application on the Register screen (FR-ACC-02, FR-ACC-03,
// E-ACC-01, E-ACC-02, IF-HW-03, IF-HW-04, IF-UI-03, IF-UI-06). The API and the device location are mocked;
// the C-24 map wrapper is replaced in jest.setup.ts by a button that places the pin at 30.05, 31.25.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { registerConsumer, submitApplication } from '@/api/client';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  registerConsumer: jest.fn(),
  submitApplication: jest.fn(),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  geocodeAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

const mockedSubmit = jest.mocked(submitApplication);
const mockedConsumer = jest.mocked(registerConsumer);
const mockedPermission = jest.mocked(Location.requestForegroundPermissionsAsync);
const mockedPosition = jest.mocked(Location.getCurrentPositionAsync);
const mockedGeocode = jest.mocked(Location.geocodeAsync);
const mockedReverse = jest.mocked(Location.reverseGeocodeAsync);

function grantLocation(latitude = 30.0381, longitude = 31.2122) {
  mockedPermission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
  mockedPosition.mockResolvedValue({ coords: { latitude, longitude } } as Location.LocationObject);
}

function denyLocation() {
  mockedPermission.mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  mockedSubmit.mockReset();
  mockedConsumer.mockReset();
  mockedPermission.mockReset();
  mockedPosition.mockReset();
  mockedGeocode.mockReset().mockResolvedValue([]);
  mockedReverse.mockReset().mockResolvedValue([]);
});

// The role is chosen on the Welcome screen (D-30, tested in welcome.test.tsx) and passed to Register as ?role=.
// Partners then choose Charity or Composting on the Register screen.
async function openRegisterAs(
  accountType: 'Vendor' | 'Charity partner' | 'Composting partner' | 'Other partner',
) {
  const result = await renderApp(
    accountType === 'Vendor' ? '/register?role=vendor' : '/register?role=partner',
  );
  await screen.findByText('Location');
  if (accountType !== 'Vendor') {
    await fireEvent.press(screen.getByRole('radio', { name: accountType }));
  }
  return result;
}

async function fillAccount() {
  await fireEvent.changeText(screen.getByLabelText('Email address'), 'shop@example.com');
  await fireEvent.changeText(screen.getByLabelText('Password'), 'abcd1234');
}

async function submit() {
  await fireEvent.press(screen.getByRole('button', { name: 'Send application' }));
}

describe('FR-ACC-02 FR-ACC-03 the account type choice shows the right form', () => {
  test('FR-ACC-02 the Register screen shows only the form of the role chosen on Welcome, with no type list', async () => {
    grantLocation();
    await openRegisterAs('Vendor');

    expect(screen.queryByText('I am signing up as')).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Consumer' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Send application' })).toBeTruthy();
  });

  test('FR-ACC-03 a partner must choose Charity or Composting before sending', async () => {
    grantLocation();
    await renderApp('/register?role=partner');
    await screen.findByText('Pin: 30.03810, 31.21220');

    expect(screen.getByRole('radio', { name: 'Charity partner' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Composting partner' })).not.toBeChecked();
    await fireEvent.changeText(screen.getByLabelText('Organisation name'), 'Giza Food Bank');
    await fireEvent.changeText(screen.getByLabelText('Written address'), 'Giza');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Cooked meals' }));
    await fillAccount();
    await submit();

    expect(screen.getByText('Choose Charity partner, Composting partner or Other partner.')).toBeTruthy();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  test('FR-ACC-02 choosing Vendor shows the shop form with the map and no food types', async () => {
    grantLocation();
    await openRegisterAs('Vendor');

    expect(screen.getByLabelText('Shop name')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Formal' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Informal' })).toBeTruthy();
    expect(screen.getByLabelText('Contact number')).toBeTruthy();
    expect(screen.getByLabelText('Written address')).toBeTruthy();
    expect(screen.getByTestId('map-view')).toBeTruthy();
    expect(screen.queryByLabelText('Organisation name')).toBeNull();
    expect(screen.queryByText('Food types you accept')).toBeNull();
    expect(screen.getByLabelText('Email address')).toBeTruthy();
    expect(screen.getByLabelText('Password')).toBeTruthy();
  });

  test.each(['Charity partner', 'Composting partner'] as const)(
    'FR-ACC-03 choosing %s shows the organisation form with the six food categories',
    async (accountType) => {
      grantLocation();
      await openRegisterAs(accountType);

      expect(screen.getByLabelText('Organisation name')).toBeTruthy();
      expect(screen.getByLabelText('Written address')).toBeTruthy();
      expect(screen.getByTestId('map-view')).toBeTruthy();
      const list = screen.getByTestId('food-types');
      for (const name of [
        'Bread and baked goods',
        'Cooked meals',
        'Fruit and vegetables',
        'Dairy and eggs',
        'Meat, poultry and fish',
        'Packaged and dry food',
      ]) {
        expect(within(list).getByRole('checkbox', { name })).not.toBeChecked();
      }
      expect(screen.queryByLabelText('Shop name')).toBeNull();
    },
  );
});

describe('FR-ACC-02 vendor application on the app', () => {
  test('FR-ACC-02 IF-HW-03 the pin starts at the GPS location and the application is sent and shown as Pending', async () => {
    grantLocation(30.0381, 31.2122);
    mockedSubmit.mockResolvedValue({ kind: 'created', id: 'v1', status: 'Pending' });
    const app = await openRegisterAs('Vendor');

    expect(await screen.findByText('Pin: 30.03810, 31.21220')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Shop name'), 'Fatma Bakery');
    await fireEvent.press(screen.getByRole('button', { name: 'Informal' }));
    await fireEvent.changeText(screen.getByLabelText('Contact number'), '01012345678');
    await fireEvent.changeText(
      screen.getByLabelText('Shop description (optional)'),
      'Fresh bread baked daily',
    );
    await fireEvent.changeText(screen.getByLabelText('Written address'), '12 Tahrir Street, Dokki');
    await fillAccount();
    await submit();

    expect(await screen.findByTestId('applied-title')).toHaveTextContent('Application sent');
    expect(screen.getByText(/Pending until an administrator reviews it/)).toBeTruthy();
    expect(app.getPathname()).toBe('/applied');
    expect(mockedSubmit).toHaveBeenCalledWith({
      email: 'shop@example.com',
      password: 'abcd1234',
      language: 'en',
      role: 'vendor',
      vendorProfile: {
        shopName: 'Fatma Bakery',
        vendorType: 'informal',
        address: '12 Tahrir Street, Dokki',
        latitude: 30.0381,
        longitude: 31.2122,
        contact: '01012345678',
        description: 'Fresh bread baked daily',
      },
    });
    expect(mockedConsumer).not.toHaveBeenCalled();
  });

  test('FR-ACC-02 dragging the pin moves it to the exact spot that is sent', async () => {
    grantLocation();
    mockedSubmit.mockResolvedValue({ kind: 'created', id: 'v2', status: 'Pending' });
    await openRegisterAs('Vendor');
    await screen.findByText('Pin: 30.03810, 31.21220');

    await fireEvent.press(screen.getByTestId('map-view'));
    expect(screen.getByText('Pin: 30.05000, 31.25000')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Shop name'), 'Fatma Bakery');
    await fireEvent.changeText(screen.getByLabelText('Contact number'), '01012345678');
    await fireEvent.changeText(screen.getByLabelText('Written address'), 'Dokki');
    await fillAccount();
    await submit();

    await screen.findByTestId('applied-title');
    expect(mockedSubmit.mock.calls[0]?.[0]).toMatchObject({
      vendorProfile: { latitude: 30.05, longitude: 31.25, vendorType: 'formal' },
    });
  });

  test('E-ACC-02 an empty vendor form marks every vendor field and sends nothing', async () => {
    denyLocation();
    await openRegisterAs('Vendor');
    await screen.findByText(/needs your location/);
    await submit();

    expect(screen.getByTestId('register-errors')).toBeTruthy();
    expect(screen.getByText('Enter the shop name.')).toBeTruthy();
    expect(screen.getByText('Enter a contact number for the shop.')).toBeTruthy();
    expect(screen.getByText('Type the written address.')).toBeTruthy();
    expect(screen.getByText('Place the pin on the map.')).toBeTruthy();
    expect(screen.getByText('Enter your email address.')).toBeTruthy();
    expect(screen.queryByText(/description to 300/)).toBeNull();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  describe('D-26 vendor information format', () => {
    async function fillValidVendor() {
      await screen.findByText('Pin: 30.03810, 31.21220');
      await fireEvent.changeText(screen.getByLabelText('Shop name'), 'Fatma Bakery');
      await fireEvent.changeText(screen.getByLabelText('Contact number'), '0223456789');
      await fireEvent.changeText(screen.getByLabelText('Written address'), 'Dokki');
      await fillAccount();
    }

    test('E-ACC-02 a landline contact number is accepted and an empty description is not required', async () => {
      grantLocation();
      mockedSubmit.mockResolvedValue({ kind: 'created', id: 'v4', status: 'Pending' });
      await openRegisterAs('Vendor');
      expect(
        screen.getByText('An Egyptian mobile or landline number, for example 01012345678 or 0223456789'),
      ).toBeTruthy();
      await fillValidVendor();
      await submit();

      await screen.findByTestId('applied-title');
      expect(mockedSubmit.mock.calls[0]?.[0]).toMatchObject({
        vendorProfile: { contact: '0223456789', description: '' },
      });
    });

    test.each(['12345', '01312345678', 'call the shop'])(
      'E-ACC-02 contact %j is marked and nothing is sent',
      async (contact) => {
        grantLocation();
        await openRegisterAs('Vendor');
        await fillValidVendor();
        await fireEvent.changeText(screen.getByLabelText('Contact number'), contact);
        await submit();

        expect(
          screen.getByText(
            'Enter an Egyptian mobile or landline number, for example 01012345678 or 0223456789.',
          ),
        ).toBeTruthy();
        expect(mockedSubmit).not.toHaveBeenCalled();
      },
    );

    test('E-ACC-02 a shop name of 81 characters is marked as too long; 80 is sent', async () => {
      grantLocation();
      mockedSubmit.mockResolvedValue({ kind: 'created', id: 'v5', status: 'Pending' });
      await openRegisterAs('Vendor');
      await fillValidVendor();
      await fireEvent.changeText(screen.getByLabelText('Shop name'), 'a'.repeat(81));
      await submit();

      expect(screen.getByText('Keep the shop name to 80 characters or fewer.')).toBeTruthy();
      expect(mockedSubmit).not.toHaveBeenCalled();

      await fireEvent.changeText(screen.getByLabelText('Shop name'), 'a'.repeat(80));
      await submit();
      await screen.findByTestId('applied-title');
    });

    test('E-ACC-02 a description of 301 characters is marked; the field shows how many are used', async () => {
      grantLocation();
      await openRegisterAs('Vendor');
      await fillValidVendor();
      await fireEvent.changeText(screen.getByLabelText('Shop description (optional)'), 'x'.repeat(301));

      expect(screen.getByText('301 / 300')).toBeTruthy();
      await submit();
      expect(screen.getByText('Keep the description to 300 characters or fewer.')).toBeTruthy();
      expect(mockedSubmit).not.toHaveBeenCalled();
    });

    test('E-ACC-02 an address of 201 characters is marked as too long', async () => {
      grantLocation();
      await openRegisterAs('Charity partner');
      await screen.findByText('Pin: 30.03810, 31.21220');
      await fireEvent.changeText(screen.getByLabelText('Organisation name'), 'Giza Food Bank');
      await fireEvent.changeText(screen.getByLabelText('Written address'), 'a'.repeat(201));
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Cooked meals' }));
      await fillAccount();
      await submit();

      expect(screen.getByText('Keep the address to 200 characters or fewer.')).toBeTruthy();
      expect(mockedSubmit).not.toHaveBeenCalled();
    });

    test('FR-ACC-02 the vendor form does not ask for a rating (ratings come from consumers, US-40)', async () => {
      grantLocation();
      await openRegisterAs('Vendor');

      expect(screen.queryByText(/rating/i)).toBeNull();
    });
  });

  test('E-ACC-02 app marks the location when the server rejects the latitude', async () => {
    grantLocation();
    mockedSubmit.mockResolvedValue({ kind: 'invalid', fields: ['latitude'] });
    await openRegisterAs('Vendor');
    await screen.findByText('Pin: 30.03810, 31.21220');
    await fireEvent.changeText(screen.getByLabelText('Shop name'), 'Fatma Bakery');
    await fireEvent.changeText(screen.getByLabelText('Contact number'), '01012345678');
    await fireEvent.changeText(screen.getByLabelText('Written address'), 'Dokki');
    await fillAccount();
    await submit();

    expect(await screen.findByText('Place the pin on the map.')).toBeTruthy();
    expect(screen.queryByTestId('applied-title')).toBeNull();
  });

  test('E-ACC-01 app offers Log in and Reset password when the vendor email is already registered', async () => {
    grantLocation();
    mockedSubmit.mockResolvedValue({ kind: 'duplicate', field: 'email' });
    await openRegisterAs('Vendor');
    await screen.findByText('Pin: 30.03810, 31.21220');
    await fireEvent.changeText(screen.getByLabelText('Shop name'), 'Fatma Bakery');
    await fireEvent.changeText(screen.getByLabelText('Contact number'), '01012345678');
    await fireEvent.changeText(screen.getByLabelText('Written address'), 'Dokki');
    await fillAccount();
    await submit();

    const notice = await screen.findByTestId('register-duplicate');
    expect(within(notice).getByText('This email is already registered')).toBeTruthy();
    expect(within(notice).getByRole('button', { name: 'Reset password' })).toBeTruthy();
  });
});

describe('IF-HW-04 location permission denied', () => {
  test('IF-HW-04 the app explains that the location is needed and lets the user place the pin by hand', async () => {
    denyLocation();
    mockedSubmit.mockResolvedValue({ kind: 'created', id: 'v3', status: 'Pending' });
    await openRegisterAs('Vendor');

    expect(
      await screen.findByText(
        'NoWaste needs your location to place the pin. You can still place it by hand: tap the map, then drag the pin to the exact spot.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('No pin placed yet')).toBeTruthy();
    expect(mockedPosition).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('map-view'));
    expect(screen.getByText('Pin: 30.05000, 31.25000')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Shop name'), 'Fatma Bakery');
    await fireEvent.changeText(screen.getByLabelText('Contact number'), '01012345678');
    await fireEvent.changeText(screen.getByLabelText('Written address'), 'Dokki');
    await fillAccount();
    await submit();

    await screen.findByTestId('applied-title');
    expect(mockedSubmit.mock.calls[0]?.[0]).toMatchObject({
      vendorProfile: { latitude: 30.05, longitude: 31.25 },
    });
  });

  test('IF-HW-04 a failed GPS reading is handled like a denied permission', async () => {
    mockedPermission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
    mockedPosition.mockRejectedValue(new Error('no fix'));
    await openRegisterAs('Charity partner');

    expect(await screen.findByText(/needs your location/)).toBeTruthy();
    expect(screen.getByText('No pin placed yet')).toBeTruthy();
  });
});

describe('FR-ACC-02 IF-HW-03 written address and pin stay in step', () => {
  function geocoded(fields: Partial<Location.LocationGeocodedAddress>) {
    return [fields as Location.LocationGeocodedAddress];
  }

  test('FR-ACC-02 IF-HW-03 the address of the GPS position is written into the address field', async () => {
    grantLocation(30.0381, 31.2122);
    mockedReverse.mockResolvedValue(
      geocoded({ streetNumber: '12', street: 'Tahrir Street', district: 'Dokki', city: 'Giza' }),
    );
    await openRegisterAs('Vendor');

    await waitFor(() => {
      expect(screen.getByLabelText('Written address')).toHaveDisplayValue('12 Tahrir Street, Dokki, Giza');
    });
    expect(mockedReverse).toHaveBeenCalledWith({ latitude: 30.0381, longitude: 31.2122 });
    expect(screen.getByText(/filled in from the pin/)).toBeTruthy();
  });

  test('FR-ACC-02 IF-HW-03 a typed address moves the pin to that place', async () => {
    denyLocation();
    mockedGeocode.mockResolvedValue([{ latitude: 30.0626, longitude: 31.2497 }]);
    await openRegisterAs('Vendor');
    await screen.findByText('No pin placed yet');

    const field = screen.getByLabelText('Written address');
    await fireEvent.changeText(field, '5 Talaat Harb, Downtown Cairo');
    await fireEvent(field, 'submitEditing');

    expect(await screen.findByText('Pin: 30.06260, 31.24970')).toBeTruthy();
    expect(mockedGeocode).toHaveBeenCalledWith('5 Talaat Harb, Downtown Cairo');
    expect(field).toHaveDisplayValue('5 Talaat Harb, Downtown Cairo');
  });

  test('FR-ACC-02 an address that cannot be found keeps the pin and says so', async () => {
    grantLocation(30.0381, 31.2122);
    await openRegisterAs('Vendor');
    await screen.findByText('Pin: 30.03810, 31.21220');

    const field = screen.getByLabelText('Written address');
    await fireEvent.changeText(field, 'nowhere at all');
    await fireEvent(field, 'blur');

    expect(await screen.findByText(/could not find this address on the map/)).toBeTruthy();
    expect(screen.getByText('Pin: 30.03810, 31.21220')).toBeTruthy();
  });

  test('FR-ACC-02 moving the pin by hand writes the address of the new spot', async () => {
    denyLocation();
    mockedReverse.mockResolvedValue(geocoded({ formattedAddress: '26 July Street, Zamalek, Cairo' }));
    await openRegisterAs('Charity partner');
    await screen.findByText(/needs your location/);

    await fireEvent.press(screen.getByTestId('map-view'));

    await waitFor(() => {
      expect(screen.getByLabelText('Written address')).toHaveDisplayValue('26 July Street, Zamalek, Cairo');
    });
    expect(mockedReverse).toHaveBeenCalledWith({ latitude: 30.05, longitude: 31.25 });
  });
});

describe('FR-ACC-03 partner application on the app', () => {
  async function fillPartner() {
    await screen.findByText('Pin: 30.03810, 31.21220');
    await fireEvent.changeText(screen.getByLabelText('Organisation name'), 'Giza Food Bank');
    await fireEvent.changeText(screen.getByLabelText('Written address'), 'Nile Corniche, Giza');
    await fillAccount();
  }

  test.each([
    ['Charity partner', 'charity'],
    ['Composting partner', 'composting'],
  ] as const)(
    'FR-ACC-03 a %s application is sent with the chosen food types and shown as Pending',
    async (label, role) => {
      grantLocation();
      mockedSubmit.mockResolvedValue({ kind: 'created', id: 'p1', status: 'Pending' });
      await openRegisterAs(label);
      await fillPartner();
      // Chosen out of order; sent in the order of SRS Appendix A.
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Cooked meals' }));
      await fireEvent.press(screen.getByRole('checkbox', { name: 'Bread and baked goods' }));
      expect(screen.getByRole('checkbox', { name: 'Cooked meals' })).toBeChecked();
      await submit();

      expect(await screen.findByTestId('applied-title')).toBeTruthy();
      expect(mockedSubmit).toHaveBeenCalledWith({
        email: 'shop@example.com',
        password: 'abcd1234',
        language: 'en',
        role,
        partnerProfile: {
          organisationName: 'Giza Food Bank',
          address: 'Nile Corniche, Giza',
          latitude: 30.0381,
          longitude: 31.2122,
          acceptedFoodTypes: ['bread_and_baked_goods', 'cooked_meals'],
        },
      });
    },
  );

  test('E-ACC-02 zero food types is marked and nothing is sent', async () => {
    grantLocation();
    await openRegisterAs('Charity partner');
    await fillPartner();
    await submit();

    expect(screen.getByText('Choose at least one food type.')).toBeTruthy();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  test('E-ACC-02 a food type can be unticked again', async () => {
    grantLocation();
    await openRegisterAs('Composting partner');
    await fillPartner();
    const dairy = screen.getByRole('checkbox', { name: 'Dairy and eggs' });
    await fireEvent.press(dairy);
    await fireEvent.press(dairy);
    await submit();

    expect(screen.getByRole('checkbox', { name: 'Dairy and eggs' })).not.toBeChecked();
    expect(screen.getByText('Choose at least one food type.')).toBeTruthy();
  });
});

describe('FR-ACC-03 D-31 Other partner type and Other food type on the app', () => {
  async function fillPartner() {
    await screen.findByText('Pin: 30.03810, 31.21220');
    await fireEvent.changeText(screen.getByLabelText('Organisation name'), 'Giza Food Bank');
    await fireEvent.changeText(screen.getByLabelText('Written address'), 'Nile Corniche, Giza');
    await fillAccount();
  }

  test('FR-ACC-03 the written type and food fields appear only when Other is chosen', async () => {
    grantLocation();
    await openRegisterAs('Charity partner');

    expect(screen.queryByLabelText('Your type of partner')).toBeNull();
    expect(screen.queryByLabelText('Other food type')).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: 'Other partner' }));
    expect(screen.getByLabelText('Your type of partner')).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Other' }));
    expect(screen.getByLabelText('Other food type')).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Other' }));
    expect(screen.queryByLabelText('Other food type')).toBeNull();
  });

  test('FR-ACC-03 an Other partner with an Other food type is sent with both written texts', async () => {
    grantLocation();
    mockedSubmit.mockResolvedValue({ kind: 'created', id: 'p9', status: 'Pending' });
    await openRegisterAs('Other partner');
    await fillPartner();
    await fireEvent.changeText(screen.getByLabelText('Your type of partner'), 'Mosque food committee');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Cooked meals' }));
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Other' }));
    await fireEvent.changeText(screen.getByLabelText('Other food type'), 'Animal feed');
    await submit();

    expect(await screen.findByTestId('applied-title')).toBeTruthy();
    expect(mockedSubmit.mock.calls[0]?.[0]).toMatchObject({
      role: 'other',
      partnerProfile: {
        otherPartnerType: 'Mosque food committee',
        acceptedFoodTypes: ['cooked_meals', 'other'],
        otherFoodType: 'Animal feed',
      },
    });
  });

  test('E-ACC-02 an empty Other partner type is marked and nothing is sent', async () => {
    grantLocation();
    await openRegisterAs('Other partner');
    await fillPartner();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Cooked meals' }));
    await submit();

    expect(screen.getByText('Write what type of partner you are.')).toBeTruthy();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  test('E-ACC-02 an empty or too long Other food type is marked and nothing is sent', async () => {
    grantLocation();
    await openRegisterAs('Charity partner');
    await fillPartner();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Other' }));
    await submit();
    expect(screen.getByText('Write the other food type you accept.')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('Other food type'), 'a'.repeat(81));
    await submit();
    expect(screen.getByText('Keep the other food type to 80 characters or fewer.')).toBeTruthy();
    expect(mockedSubmit).not.toHaveBeenCalled();
  });

  test('NFR-06 the Other options are in Arabic', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    grantLocation();
    await renderApp('/register?role=partner');
    await screen.findByText('الموقع');

    await fireEvent.press(screen.getByRole('radio', { name: 'شريك آخر' }));
    expect(screen.getByLabelText('نوع الشريك لديكم')).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'أخرى' }));
    expect(screen.getByLabelText('نوع طعام آخر')).toBeTruthy();
  });
});

describe('IF-HW-03 detect my location again', () => {
  test('IF-HW-03 after moving the pin, Use my current location puts it back at the device position', async () => {
    grantLocation(30.0381, 31.2122);
    mockedReverse.mockResolvedValue([
      { formattedAddress: '12 Tahrir Street, Dokki, Giza' } as Location.LocationGeocodedAddress,
    ]);
    await openRegisterAs('Vendor');
    await screen.findByText('Pin: 30.03810, 31.21220');
    await fireEvent.press(screen.getByTestId('map-view'));
    expect(screen.getByText('Pin: 30.05000, 31.25000')).toBeTruthy();

    mockedPosition.mockResolvedValue({
      coords: { latitude: 30.04, longitude: 31.22 },
    } as Location.LocationObject);
    mockedReverse.mockResolvedValue([
      { formattedAddress: 'New spot, Giza' } as Location.LocationGeocodedAddress,
    ]);
    await fireEvent.press(screen.getByRole('button', { name: 'Use my current location' }));

    expect(await screen.findByText('Pin: 30.04000, 31.22000')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByLabelText('Written address')).toHaveDisplayValue('New spot, Giza');
    });
    expect(mockedPermission).toHaveBeenCalledTimes(2);
  });

  test('IF-HW-04 Use my current location explains the problem when permission is denied', async () => {
    denyLocation();
    await openRegisterAs('Vendor');
    await screen.findByText(/needs your location/);
    await fireEvent.press(screen.getByTestId('map-view'));

    await fireEvent.press(screen.getByRole('button', { name: 'Use my current location' }));

    await waitFor(() => {
      expect(mockedPermission).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText(/needs your location/)).toBeTruthy();
    expect(screen.getByText('Pin: 30.05000, 31.25000')).toBeTruthy();
  });
});

describe('NFR-06 IF-UI-03 applications in Arabic', () => {
  test('NFR-06 the vendor form and the map screen are right-to-left in Arabic', async () => {
    grantLocation();
    await renderApp('/register?role=vendor');
    await screen.findByText('Location');
    await fireEvent.press(screen.getByRole('button', { name: 'العربية' }));

    expect(await screen.findByLabelText('اسم المحل')).toBeTruthy();
    expect(screen.getByLabelText('العنوان المكتوب')).toBeTruthy();
    expect(screen.getByTestId('map-view')).toBeTruthy();
    expect(screen.getByTestId('screen-root')).toHaveStyle({ direction: 'rtl' });
    expect(screen.getByTestId('location-picker')).toHaveStyle({ direction: 'rtl' });
  });

  test('NFR-06 the six food categories and the Pending screen are in Arabic', async () => {
    grantLocation();
    mockedSubmit.mockResolvedValue({ kind: 'created', id: 'p2', status: 'Pending' });
    await renderApp('/register?role=partner');
    await screen.findByText('Location');
    await fireEvent.press(screen.getByRole('button', { name: 'العربية' }));
    await fireEvent.press(await screen.findByRole('radio', { name: 'شريك خيري' }));

    for (const name of [
      'خبز ومخبوزات',
      'وجبات مطبوخة',
      'فواكه وخضروات',
      'ألبان وبيض',
      'لحوم ودواجن وأسماك',
      'أطعمة معلبة وجافة',
    ]) {
      expect(screen.getByRole('checkbox', { name })).toBeTruthy();
    }

    await screen.findByText(/30.03810/);
    await fireEvent.changeText(screen.getByLabelText('اسم الجهة'), 'بنك الطعام');
    await fireEvent.changeText(screen.getByLabelText('العنوان المكتوب'), 'كورنيش النيل');
    await fireEvent.press(screen.getByRole('checkbox', { name: 'وجبات مطبوخة' }));
    // "البريد الإلكتروني" is both the Email method button and the field label, so the field is found by its test ID.
    await fireEvent.changeText(screen.getByTestId('register-email'), 'org@example.com');
    await fireEvent.changeText(screen.getByLabelText('كلمة المرور'), 'abcd1234');
    await fireEvent.press(screen.getByRole('button', { name: 'إرسال الطلب' }));

    await waitFor(() => {
      expect(screen.getByTestId('applied-title')).toHaveTextContent('تم إرسال الطلب');
    });
    expect(mockedSubmit.mock.calls[0]?.[0].language).toBe('ar');
    expect(screen.getByTestId('screen-root')).toHaveStyle({ direction: 'rtl' });
  });

  test('NFR-07a the account types, food types and map have screen reader labels', async () => {
    grantLocation();
    await openRegisterAs('Charity partner');

    // The group itself is not focusable (that would hide its options from screen readers), so its props are checked.
    const group = screen.getByTestId('partner-types');
    expect(group).toHaveProp('accessibilityRole', 'radiogroup');
    expect(group).toHaveProp('accessibilityLabel', 'Type of partner');
    expect(screen.getByTestId('food-types')).toHaveProp('accessibilityLabel', 'Food types you accept');
    expect(screen.getByLabelText('Map: drag the pin to the exact location')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Fruit and vegetables' })).toBeTruthy();
  });
});
