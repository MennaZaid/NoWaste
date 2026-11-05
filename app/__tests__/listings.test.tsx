// US-10 Create listing, US-11 Quick Post and US-13 on the app (FR-LST-01, FR-LST-02, FR-LST-04, E-LST-02, E-LST-03,
// E-LST-04, E-LST-06, NFR-05a, NFR-06), as changed by D-63, D-64 and D-66: the name and description are written
// once in Arabic or English and shown exactly as written (no translation); the bags are a +/− counter; storage is a drop-down; the vendor picks
// one branch; the pick-by time is worked out by the server and shown as an Estimate; Create listing is for formal
// vendors and Quick Post for informal vendors. The API, the photo compression (tested in compressPhoto.test.ts), the
// camera and the date-time picker are mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import {
  chooseDestination,
  createListing,
  createQuickPost,
  getDestinations,
  getListing,
  getMe,
  getShop,
  previewPickBy,
  publishListing,
  uploadListingPhoto,
  type Branch,
  type Listing,
  type Shop,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { compressPhoto } from '@/listings/compressPhoto';
import { formatDateTime } from '@/listings/formatDateTime';
import en from '../src/i18n/en.json';
import ar from '../src/i18n/ar.json';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getShop: jest.fn(),
  uploadListingPhoto: jest.fn(),
  createListing: jest.fn(),
  createQuickPost: jest.fn(),
  previewPickBy: jest.fn(),
  getListing: jest.fn(),
  publishListing: jest.fn(),
  downloadListingPhoto: jest.fn().mockResolvedValue(null),
  // D-70: the BR-01 hours behind each category.
  getCategoryHours: jest.fn().mockResolvedValue({
    kind: 'ok',
    hours: { highlyPerishableMaxHours: 6, shortLifeMaxHours: 48 },
  }),
  getDestinations: jest.fn(),
  chooseDestination: jest.fn(),
  markUnfit: jest.fn(),
}));

jest.mock('@/listings/compressPhoto', () => ({ compressPhoto: jest.fn() }));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;
const mocked = {
  getMe: jest.mocked(getMe),
  getShop: jest.mocked(getShop),
  upload: jest.mocked(uploadListingPhoto),
  create: jest.mocked(createListing),
  quick: jest.mocked(createQuickPost),
  preview: jest.mocked(previewPickBy),
  get: jest.mocked(getListing),
  publish: jest.mocked(publishListing),
  compress: jest.mocked(compressPhoto),
  cameraPermission: jest.mocked(ImagePicker.requestCameraPermissionsAsync),
  camera: jest.mocked(ImagePicker.launchCameraAsync),
  gallery: jest.mocked(ImagePicker.launchImageLibraryAsync),
};

// Branch ids are UUIDs: the shared validator checks them.
const MAIN: Branch = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Fatma Bakery',
  address: '12 Tahrir Street, Dokki',
  latitude: 30.0381,
  longitude: 31.2122,
  opensAt: '00:00',
  closesAt: '23:59',
};
const MAADI: Branch = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Fatma Bakery',
  address: '9 Road 9, Maadi',
  latitude: 29.96,
  longitude: 31.25,
  opensAt: '09:00',
  closesAt: '22:00',
};

const SHOP: Shop = {
  shopName: 'Fatma Bakery',
  vendorType: 'formal',
  address: MAIN.address,
  latitude: MAIN.latitude,
  longitude: MAIN.longitude,
  // D-62: opening hours are required.
  opensAt: '00:00',
  closesAt: '23:59',
  branches: [MAIN],
};

const T = {
  start: '2026-11-01T11:00:00.000Z',
  end: '2026-11-01T13:00:00.000Z',
};

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'l1',
    status: 'Draft',
    listingType: null,
    isQuickPost: false,
    foodType: 'Koshari',
    foodCategory: 'cooked_meals',
    photoKey: 'k.jpg',
    // D-66: written in English only; nothing is translated.
    nameAr: null,
    nameEn: 'Koshari',
    descriptionAr: null,
    descriptionEn: 'Fresh koshari',
    sourceLanguage: 'en',
    branchId: MAIN.id,
    bagsTotal: 3,
    bagsAvailable: 3,
    originalValue: 100,
    price: 40,
    pickupStart: T.start,
    pickupEnd: T.end,
    storage: 'room_temperature',
    // D-70: set when the listing is saved.
    perishabilityCategory: 'Highly perishable',
    urgency: null,
    unfitForPeople: false,
    latitude: MAIN.latitude,
    longitude: MAIN.longitude,
    ...overrides,
  };
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
  mocked.getShop.mockResolvedValue({ kind: 'ok', shop: SHOP });
  mocked.compress.mockResolvedValue('file:///small.jpg');
  mocked.cameraPermission.mockResolvedValue({ granted: true } as ImagePicker.CameraPermissionResponse);
  mocked.camera.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///camera.jpg' }],
  } as ImagePicker.ImagePickerResult);
  mocked.gallery.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///gallery.jpg' }],
  } as ImagePicker.ImagePickerResult);
  mocked.upload.mockResolvedValue({ kind: 'ok', photoKey: 'k.jpg' });
  mocked.create.mockResolvedValue({ kind: 'ok', listing: listing() });
  mocked.preview.mockResolvedValue({
    kind: 'ok',
    preview: {
      pickupEnd: T.end,
      closesAt: '2026-11-01T21:59:00.000Z',
      cappedAtClosing: false,
      category: 'Highly perishable',
    },
  });
  mocked.get.mockResolvedValue({ kind: 'ok', listing: listing() });
  mocked.publish.mockResolvedValue({ kind: 'ok', listing: listing({ status: 'Active' }) });
  // D-70: a saved Draft already has its category, so its destinations load as soon as it opens.
  jest.mocked(getDestinations).mockResolvedValue({
    kind: 'ok',
    destinations: {
      options: [{ destination: 'consumers', partners: null, nearestPartnerMeters: null, available: true }],
      recommended: 'consumers',
      timeLeftMinutes: 120,
    },
  });
});

const field = (label: string) => screen.getByLabelText(label);
const type = (label: string, text: string) => fireEvent.changeText(field(label), text);
const bagsValue = () => screen.getByTestId('listing-bags');

// After the saved login is restored the app opens the vendor home, so the forms are reached through its buttons.
async function openForm() {
  const app = await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('home-create-listing'));
  await screen.findByTestId('listing-form');
  // The branches appear once the shop has arrived.
  await screen.findByRole('radio', { name: MAIN.address });
  return app;
}

async function chooseStorage(value: string) {
  await fireEvent.press(screen.getByTestId('listing-storage'));
  await fireEvent.press(await screen.findByTestId(`listing-storage-option-${value}`));
}

async function fillForm() {
  await fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));
  await screen.findByTestId('listing-photo-preview');
  await type('Name', 'Koshari');
  await type('Description', 'Fresh koshari');
  await fireEvent.press(screen.getByRole('button', { name: 'Add one to Number of bags' }));
  await fireEvent.press(screen.getByRole('button', { name: 'Add one to Number of bags' }));
  await type('Original value (EGP)', '100');
  await type('Discounted price (EGP)', '40');
  await type('Pickup starts', T.start);
  await fireEvent.press(screen.getByRole('radio', { name: 'Cooked meals' }));
  await chooseStorage('room_temperature');
}

const save = () => fireEvent.press(screen.getByRole('button', { name: 'Save listing' }));

const expectedBody = {
  photoKey: 'k.jpg',
  name: 'Koshari',
  description: 'Fresh koshari',
  language: 'en',
  foodCategory: 'cooked_meals',
  storage: 'room_temperature',
  bagsTotal: 3,
  originalValue: 100,
  price: 40,
  pickupStart: T.start,
  // D-69: no end chosen, so the server uses the worked-out limit.
  pickupEnd: undefined,
  branchId: MAIN.id,
};

describe('FR-LST-01 FR-LST-02 the vendor home', () => {
  test('FR-LST-01 an approved formal vendor sees Create listing and no Quick Post', async () => {
    await renderApp('/home');

    expect(await screen.findByTestId('home-create-listing')).toBeOnTheScreen();
    expect(await screen.findByText('Fatma Bakery')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-quick-post')).toBeNull();
  });

  test('FR-LST-02 D-64 an informal vendor sees Quick Post and no Create listing', async () => {
    mocked.getShop.mockResolvedValue({ kind: 'ok', shop: { ...SHOP, vendorType: 'informal' } });
    await renderApp('/home');

    expect(await screen.findByTestId('home-quick-post')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-create-listing')).toBeNull();
  });

  test('FR-LST-01 Create listing opens the listing form', async () => {
    const app = await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('home-create-listing'));

    expect(await screen.findByTestId('listing-form')).toBeOnTheScreen();
    expect(app.getPathname()).toBe('/listings/new');
  });
});

describe('FR-LST-01 FR-LST-04 create and publish a full listing', () => {
  test('FR-LST-01 the vendor fills the form, the photo is compressed and uploaded, the Draft is saved and published', async () => {
    const app = await openForm();
    await fillForm();
    await save();

    expect(await screen.findByTestId('listing-status')).toHaveTextContent('Draft: not published yet');
    expect(mocked.compress).toHaveBeenCalledWith('file:///camera.jpg', 500 * 1024);
    expect(mocked.upload).toHaveBeenCalledWith('vendor-token', 'file:///small.jpg');
    expect(mocked.create).toHaveBeenCalledWith('vendor-token', expectedBody);
    expect(app.getPathname()).toBe('/listings/l1');

    // Turn 5 (US-18, US-19): a destination is chosen before Publish is enabled (the category is set on saving, D-72).
    const ready = listing({
      perishabilityCategory: 'Highly perishable',
      urgency: { collectBy: T.end },
      listingType: 'Discounted Surplus Bag',
    });
    jest.mocked(getDestinations).mockResolvedValue({
      kind: 'ok',
      destinations: {
        options: [{ destination: 'consumers', partners: null, nearestPartnerMeters: null, available: true }],
        recommended: 'consumers',
        timeLeftMinutes: 120,
      },
    });
    jest.mocked(chooseDestination).mockResolvedValue({ kind: 'ok', listing: ready });
    mocked.publish.mockResolvedValue({ kind: 'ok', listing: { ...ready, status: 'Active' } });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Consumers (Discounted Surplus Bag)' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled();
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Your listing is published.')).toBeOnTheScreen();
    expect(screen.getByTestId('listing-status')).toHaveTextContent('Active: published');
    expect(mocked.publish).toHaveBeenCalledWith('vendor-token', 'l1');
  });

  test('FR-LST-01 D-66 English text is sent as written, marked English', async () => {
    await openForm();
    await fillForm();
    await save();

    await screen.findByTestId('listing-status');
    expect(mocked.create.mock.calls[0]?.[1]).toMatchObject({
      name: 'Koshari',
      description: 'Fresh koshari',
      language: 'en',
    });
  });

  test('FR-LST-01 D-66 Arabic text is sent as written, marked Arabic from its letters', async () => {
    await openForm();
    await fillForm();
    await type('Name', 'كشري');
    await type('Description', 'كشري طازج');
    await save();

    await screen.findByTestId('listing-status');
    expect(mocked.create.mock.calls[0]?.[1]).toMatchObject({
      name: 'كشري',
      description: 'كشري طازج',
      language: 'ar',
    });
  });

  test('FR-LST-01 the form no longer asks for preparation time, expiry or two descriptions (D-63, D-64)', async () => {
    await openForm();

    // D-66: and no writing-language choice: the language is read from the text.
    expect(screen.queryByRole('button', { name: /I am writing in/ })).toBeNull();

    for (const gone of ['Preparation time', 'Expiry date and time', 'Description in Arabic', 'Food type']) {
      expect(screen.queryByLabelText(gone)).toBeNull();
    }
  });

  test('FR-LST-01 a photo can also be chosen from the gallery (IF-HW-02)', async () => {
    await openForm();
    await fillForm();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));
    await save();

    await screen.findByTestId('listing-status');
    expect(mocked.compress).toHaveBeenCalledWith('file:///gallery.jpg', 500 * 1024);
  });

  test('IF-HW-07 when the camera is not allowed, the app says why and the gallery still works', async () => {
    mocked.cameraPermission.mockResolvedValue({ granted: false } as ImagePicker.CameraPermissionResponse);
    await openForm();
    await fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));

    expect(screen.getByText(/NoWaste needs the camera/)).toBeOnTheScreen();
    expect(mocked.camera).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Choose from gallery' }));
    expect(await screen.findByTestId('listing-photo-preview')).toBeOnTheScreen();
  });

  test.each([
    ['Room temperature', 'room_temperature'],
    ['Chilled', 'chilled'],
    ['Frozen', 'frozen'],
    ['Unknown', 'unknown'],
  ])('FR-LST-04 storage %s is chosen from the drop-down', async (label, storage) => {
    await openForm();
    await fillForm();
    await chooseStorage(storage);
    // The menu closes after a choice and the field shows it.
    expect(screen.queryByTestId('listing-storage-option-chilled')).toBeNull();
    expect(screen.getByTestId('listing-storage')).toHaveTextContent(new RegExp(`^${label}`));
    await save();

    await screen.findByTestId('listing-status');
    expect(mocked.create.mock.calls[0]?.[1]).toMatchObject({ storage });
  });

  test('FR-LST-04 the food category can be Unknown', async () => {
    await openForm();
    await fillForm();
    await fireEvent.press(screen.getByRole('radio', { name: 'Unknown' }));
    await save();

    await screen.findByTestId('listing-status');
    expect(mocked.create.mock.calls[0]?.[1]).toMatchObject({ foodCategory: 'unknown' });
  });
});

describe('D-64 the number of bags is a +/− counter', () => {
  test('D-64 the counter starts at 1, + adds one and − takes one away', async () => {
    await openForm();

    expect(bagsValue()).toHaveTextContent('1');
    await fireEvent.press(screen.getByRole('button', { name: 'Add one to Number of bags' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Add one to Number of bags' }));
    expect(bagsValue()).toHaveTextContent('3');
    await fireEvent.press(screen.getByRole('button', { name: 'Take one from Number of bags' }));
    expect(bagsValue()).toHaveTextContent('2');
  });

  test('E-LST-04 the counter cannot go below 1 bag', async () => {
    await openForm();

    const minus = screen.getByRole('button', { name: 'Take one from Number of bags' });
    expect(minus).toBeDisabled();
    await fireEvent.press(minus);
    expect(bagsValue()).toHaveTextContent('1');
  });
});

describe('D-64 the vendor picks one branch', () => {
  test('D-64 with one branch it is already chosen', async () => {
    await openForm();

    expect(screen.getByRole('radio', { name: MAIN.address })).toBeChecked();
  });

  test('D-64 with several branches the vendor chooses exactly one, which is sent', async () => {
    mocked.getShop.mockResolvedValue({ kind: 'ok', shop: { ...SHOP, branches: [MAIN, MAADI] } });
    await openForm();

    expect(screen.getByRole('radio', { name: MAIN.address })).not.toBeChecked();
    expect(screen.getByText('Shop hours: 09:00–22:00')).toBeOnTheScreen();
    await fillForm();
    await fireEvent.press(screen.getByRole('radio', { name: MAIN.address }));
    await fireEvent.press(screen.getByRole('radio', { name: MAADI.address }));
    expect(screen.getByRole('radio', { name: MAIN.address })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: MAADI.address })).toBeChecked();
    await save();

    await screen.findByTestId('listing-status');
    expect(mocked.create.mock.calls[0]?.[1]).toMatchObject({ branchId: MAADI.id });
  });

  test('E-LST-04 with several branches and none chosen, the branch is marked', async () => {
    mocked.getShop.mockResolvedValue({ kind: 'ok', shop: { ...SHOP, branches: [MAIN, MAADI] } });
    await openForm();
    await fillForm();
    await save();

    expect(screen.getByText('Choose the branch where the food is picked up.')).toBeOnTheScreen();
    expect(mocked.upload).not.toHaveBeenCalled();
  });
});

describe('D-64 D-74 NFR-05a the allowed pickup window is shown as an Estimate before saving', () => {
  test('D-64 D-74 the form asks the server once the start, category, storage and branch are chosen', async () => {
    await openForm();
    expect(screen.getByTestId('listing-pick-by')).toHaveTextContent(/Choose the pickup start/);
    await fillForm();

    const start = formatDateTime(T.start, 'en');
    const end = formatDateTime(T.end, 'en');
    await waitFor(() => {
      expect(screen.getByText(`Estimate: ${start} to ${end}`)).toBeOnTheScreen();
    });
    expect(screen.getByText('Pickup window allowed')).toBeOnTheScreen();
    expect(mocked.preview).toHaveBeenLastCalledWith('vendor-token', {
      foodCategory: 'cooked_meals',
      storage: 'room_temperature',
      pickupStart: T.start,
      branchId: MAIN.id,
    });
  });

  test('D-74 the category is shown, with its hours, as the reason for the window', async () => {
    await openForm();
    await fillForm();

    await waitFor(() => {
      expect(screen.getByTestId('listing-pick-by-reason')).toHaveTextContent(
        'Highly perishable (up to 6 hours left), worked out from the food category and how it is stored.',
      );
    });
  });

  test('D-64 a pick-by capped at the closing time says so', async () => {
    mocked.preview.mockResolvedValue({
      kind: 'ok',
      preview: { pickupEnd: T.end, closesAt: T.end, cappedAtClosing: true, category: 'Long-life' },
    });
    await openForm();
    await fillForm();

    expect(await screen.findByText(/This is your branch's closing time/)).toBeOnTheScreen();
  });

  test('E-LST-04 a pickup start when the branch is closed is marked with its hours', async () => {
    mocked.preview.mockResolvedValue({
      kind: 'invalid',
      fields: ['pickupStart'],
      hours: { opensAt: '09:00', closesAt: '22:00' },
    });
    await openForm();
    await fillForm();

    await waitFor(() => {
      expect(field('Pickup starts').props.accessibilityHint).toBe(
        'The shop is open 09:00–22:00. The pickup must be inside these hours.',
      );
    });
  });
});

describe('D-69 the vendor may choose an earlier pickup end, never a later one', () => {
  test('D-69 the end field shows the worked-out latest end until the vendor changes it', async () => {
    await openForm();
    await fillForm();

    await waitFor(() => {
      expect(field('Pickup ends').props.value).toBe(T.end);
    });
  });

  test('FR-LST-01 D-69 an earlier end is sent', async () => {
    await openForm();
    await fillForm();
    await waitFor(() => {
      expect(field('Pickup ends').props.value).toBe(T.end);
    });
    await type('Pickup ends', '2026-11-01T12:00:00.000Z');
    await save();

    await screen.findByTestId('listing-status');
    expect(mocked.create.mock.calls[0]?.[1]).toMatchObject({ pickupEnd: '2026-11-01T12:00:00.000Z' });
  });

  test('E-LST-03 D-69 a later end is refused with the latest time and nothing is sent', async () => {
    await openForm();
    await fillForm();
    await waitFor(() => {
      expect(field('Pickup ends').props.value).toBe(T.end);
    });
    await type('Pickup ends', '2026-11-01T13:01:00.000Z');
    await save();

    const time = formatDateTime(T.end, 'en');
    expect(field('Pickup ends').props.accessibilityHint).toBe(
      `Pickup must end by ${time}, the food's estimated limit. Choose an earlier end time.`,
    );
    expect(mocked.upload).not.toHaveBeenCalled();
    expect(mocked.create).not.toHaveBeenCalled();
  });

  test('E-LST-04 D-69 an end before the start is marked', async () => {
    await openForm();
    await fillForm();
    await type('Pickup ends', '2026-11-01T10:00:00.000Z');
    await save();

    expect(field('Pickup ends').props.accessibilityHint).toBe(
      'Choose when pickup ends. It must be after the start.',
    );
    expect(mocked.upload).not.toHaveBeenCalled();
  });

  test('E-LST-03 D-69 the server refusing a later end shows the latest time', async () => {
    mocked.create.mockResolvedValue({ kind: 'afterExpiry', latestPickupEnd: '2026-11-01T12:30:00.000Z' });
    await openForm();
    await fillForm();
    await save();

    const time = formatDateTime('2026-11-01T12:30:00.000Z', 'en');
    await waitFor(() => {
      expect(field('Pickup ends').props.accessibilityHint).toBe(
        `Pickup must end by ${time}, the food's estimated limit. Choose an earlier end time.`,
      );
    });
  });
});

describe('E-LST-02 the photo upload fails', () => {
  test('E-LST-02 every field keeps its value and Retry is shown; Retry then saves the listing', async () => {
    mocked.upload.mockResolvedValueOnce({ kind: 'failed' });
    await openForm();
    await fillForm();
    await save();

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeOnTheScreen();
    expect(
      screen.getByText(/The photo could not be uploaded. Everything you entered is kept/),
    ).toBeOnTheScreen();
    expect(mocked.create).not.toHaveBeenCalled();
    expect(field('Name').props.value).toBe('Koshari');
    expect(field('Description').props.value).toBe('Fresh koshari');
    expect(bagsValue()).toHaveTextContent('3');
    expect(field('Original value (EGP)').props.value).toBe('100');
    expect(field('Discounted price (EGP)').props.value).toBe('40');
    expect(field('Pickup starts').props.value).toBe(T.start);
    expect(screen.getByRole('radio', { name: 'Cooked meals' })).toBeChecked();
    expect(screen.getByTestId('listing-storage')).toHaveTextContent(/^Room temperature/);
    expect(screen.getByTestId('listing-photo-preview')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));

    expect(await screen.findByTestId('listing-status')).toBeOnTheScreen();
    expect(mocked.upload).toHaveBeenCalledTimes(2);
    expect(mocked.create).toHaveBeenCalledWith('vendor-token', expectedBody);
  });

  test('E-LST-02 after an upload that worked, a failed save does not upload the photo again', async () => {
    mocked.create.mockResolvedValueOnce({ kind: 'unreachable' });
    await openForm();
    await fillForm();
    await save();
    await screen.findByText(/We could not reach the server/);
    await save();

    await screen.findByTestId('listing-status');
    expect(mocked.upload).toHaveBeenCalledTimes(1);
  });

  test('NFR-08a a photo that cannot be made small enough is not uploaded', async () => {
    mocked.compress.mockResolvedValue(null);
    await openForm();
    await fillForm();
    await save();

    expect(await screen.findByText(/could not be made small enough/)).toBeOnTheScreen();
    expect(mocked.upload).not.toHaveBeenCalled();
  });
});

describe('E-LST-04 invalid fields are marked and nothing is sent', () => {
  test('E-LST-04 an empty form marks every required field and uploads nothing', async () => {
    await openForm();
    await save();

    expect(screen.getByTestId('listing-errors')).toBeOnTheScreen();
    for (const text of [
      'Add a photo of the food.',
      'Enter the name (up to 80 characters).',
      'Write a description (up to 300 characters).',
      'Choose a food category, or Unknown.',
      'Enter the original value in EGP, more than 0.',
      'Enter a price above 0 EGP and not higher than the original value.',
      'Choose how the food is stored, or Unknown.',
    ]) {
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
    expect(field('Pickup starts').props.accessibilityHint).toBe(
      'Choose when pickup starts. It must be while the branch is open.',
    );
    expect(mocked.upload).not.toHaveBeenCalled();
    expect(mocked.create).not.toHaveBeenCalled();
  });

  test.each([
    [
      'a price above the original value',
      'Discounted price (EGP)',
      '100.01',
      'Enter a price above 0 EGP and not higher than the original value.',
    ],
    [
      'a price of 0',
      'Discounted price (EGP)',
      '0',
      'Enter a price above 0 EGP and not higher than the original value.',
    ],
    ['a name longer than 80 characters', 'Name', 'x'.repeat(81), 'Enter the name (up to 80 characters).'],
  ])('E-LST-04 %s is marked', async (_case, label, value, message) => {
    await openForm();
    await fillForm();
    await type(label, value);
    await save();

    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(mocked.upload).not.toHaveBeenCalled();
  });

  test('E-LST-04 a price typed with Arabic-Indic digits is read as a number', async () => {
    await openForm();
    await fillForm();
    await type('Discounted price (EGP)', '٤٠');
    await save();

    await screen.findByTestId('listing-status');
    expect(mocked.create.mock.calls[0]?.[1]).toMatchObject({ price: 40 });
  });

  test('E-LST-04 a pickup start before opening time (server answer) is marked with the opening hours', async () => {
    mocked.create.mockResolvedValue({
      kind: 'invalid',
      fields: ['pickupStart'],
      hours: { opensAt: '09:00', closesAt: '22:00' },
    });
    await openForm();
    await fillForm();
    await save();

    await waitFor(() => {
      expect(field('Pickup starts').props.accessibilityHint).toBe(
        'The shop is open 09:00–22:00. The pickup must be inside these hours.',
      );
    });
  });

  test('FR-LST-01 a vendor whose hours are missing is told to set them (D-62)', async () => {
    mocked.create.mockResolvedValue({ kind: 'hoursRequired' });
    await openForm();
    await fillForm();
    await save();

    expect(await screen.findByText(/Set your shop's opening hours before you post food/)).toBeOnTheScreen();
  });

  test('FR-LST-01 D-64 an informal vendor who reaches the form is told to use Quick Post', async () => {
    mocked.create.mockResolvedValue({ kind: 'informalVendor' });
    await openForm();
    await fillForm();
    await save();

    expect(await screen.findByText(/Create listing is only for formal vendors/)).toBeOnTheScreen();
  });

  test('E-LST-06 a vendor who is no longer approved is told so', async () => {
    mocked.create.mockResolvedValue({ kind: 'notApproved' });
    await openForm();
    await fillForm();
    await save();

    expect(
      await screen.findByText('Your account is not approved, so you cannot post food.'),
    ).toBeOnTheScreen();
  });
});

describe('D-66 the listing text is shown exactly as the vendor wrote it', () => {
  // The details screen is reached by saving, as the vendor does.
  async function openDetails() {
    await openForm();
    await fillForm();
    await save();
    await screen.findByTestId('listing-details');
  }

  test('FR-LST-01 the details show the name and description in English', async () => {
    await openDetails();

    expect(await screen.findByText('Koshari')).toBeOnTheScreen();
    expect(screen.getByText('Fresh koshari')).toBeOnTheScreen();
  });

  test('FR-LST-01 text written in Arabic is shown in Arabic to an English reader, with no translation note', async () => {
    mocked.get.mockResolvedValue({
      kind: 'ok',
      listing: listing({
        nameAr: 'كشري',
        nameEn: null,
        descriptionAr: 'كشري طازج',
        descriptionEn: null,
        sourceLanguage: 'ar',
      }),
    });
    await openDetails();

    expect(await screen.findByText('كشري')).toBeOnTheScreen();
    expect(screen.getByText('كشري طازج')).toBeOnTheScreen();
    expect(screen.queryByText(/translated/i)).toBeNull();
  });
});

async function openQuickPost() {
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('home-quick-post'));
  await screen.findByTestId('quick-post-form');
}

async function fillQuickPost() {
  await fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));
  await screen.findByTestId('listing-photo-preview');
  await type('Name', 'Mixed pastries');
  await type('Description', 'Pastries from this morning');
  await fireEvent.press(screen.getByRole('button', { name: 'Add one to Number of bags' }));
  await type('Price per bag (EGP)', '25');
  await type('Pickup ends', '2099-01-01T12:00:00.000Z');
}

const postNow = () => fireEvent.press(screen.getByRole('button', { name: 'Post now' }));

const QUICK_ROUTES = {
  options: [
    { destination: 'consumers' as const, partners: null, nearestPartnerMeters: null, available: true },
    { destination: 'charity' as const, partners: 2, nearestPartnerMeters: 1500, available: true },
    { destination: 'landfill' as const, partners: null, nearestPartnerMeters: null, available: false },
  ],
  recommended: 'consumers' as const,
  timeLeftMinutes: 90,
};

describe('FR-LST-02 Quick Post', () => {
  beforeEach(() => {
    mocked.getShop.mockResolvedValue({ kind: 'ok', shop: { ...SHOP, vendorType: 'informal' } });
    jest.mocked(getDestinations).mockReset().mockResolvedValue({ kind: 'ok', destinations: QUICK_ROUTES });
    jest.mocked(chooseDestination).mockReset();
  });

  test('FR-LST-02 Quick Post asks for a photo, name, description, bags, price and pickup end, and is published at once', async () => {
    const quickListing = listing({
      id: 'q1',
      status: 'Active',
      isQuickPost: true,
      listingType: 'Discounted Surplus Bag',
      perishabilityCategory: 'Highly perishable',
      foodCategory: 'unknown',
      originalValue: null,
      storage: null,
    });
    mocked.quick.mockResolvedValue({ kind: 'ok', listing: quickListing });
    mocked.get.mockResolvedValue({ kind: 'ok', listing: quickListing });
    await openQuickPost();

    expect(screen.queryByLabelText('Original value (EGP)')).toBeNull();
    // D-75: the pickup start is optional and shows "Now" until a time is chosen.
    expect(field('Pickup starts').props.placeholder).toBe('Now');
    expect(field('Pickup starts').props.value).toBe('');

    await fillQuickPost();
    await postNow();

    expect(await screen.findByText('Your listing is published.')).toBeOnTheScreen();
    expect(screen.getByText(/treated as Highly perishable/)).toBeOnTheScreen();
    expect(mocked.quick).toHaveBeenCalledWith('vendor-token', {
      photoKey: 'k.jpg',
      name: 'Mixed pastries',
      description: 'Pastries from this morning',
      language: 'en',
      // D-68: optional, Unknown unless the vendor chooses one.
      foodCategory: 'unknown',
      bagsTotal: 2,
      price: 25,
      pickupStart: undefined,
      pickupEnd: '2099-01-01T12:00:00.000Z',
    });
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  });

  test('FR-LST-02 D-75 the vendor may choose a later pickup start, which is sent', async () => {
    const quickListing = listing({ id: 'q1', status: 'Active', isQuickPost: true });
    mocked.quick.mockResolvedValue({ kind: 'ok', listing: quickListing });
    mocked.get.mockResolvedValue({ kind: 'ok', listing: quickListing });
    await openQuickPost();
    await fillQuickPost();
    await type('Pickup starts', '2099-01-01T09:00:00.000Z');
    await postNow();

    await screen.findByTestId('listing-status');
    expect(mocked.quick.mock.calls[0]?.[1]).toMatchObject({
      pickupStart: '2099-01-01T09:00:00.000Z',
      pickupEnd: '2099-01-01T12:00:00.000Z',
    });
  });

  test('E-LST-04 D-75 a pickup end before the chosen start is marked and nothing is sent', async () => {
    await openQuickPost();
    await fillQuickPost();
    await type('Pickup starts', '2099-01-01T13:00:00.000Z');
    await postNow();

    expect(field('Pickup ends').props.accessibilityHint).toBe(
      'Choose when pickup ends. It must be later than the pickup start.',
    );
    expect(mocked.quick).not.toHaveBeenCalled();
  });

  test('E-LST-04 D-75 a pickup start while the shop is closed is marked on the start, with the hours', async () => {
    mocked.quick.mockResolvedValue({
      kind: 'invalid',
      fields: ['pickupStart'],
      hours: { opensAt: '09:00', closesAt: '23:00' },
    });
    await openQuickPost();
    await fillQuickPost();
    await postNow();

    await waitFor(() => {
      expect(field('Pickup starts').props.accessibilityHint).toBe(
        'The shop is open 09:00–23:00. The pickup must be inside these hours.',
      );
    });
    expect(field('Pickup ends').props.accessibilityHint).toBeUndefined();
  });

  test('FR-LST-02 D-68 the vendor may give the food category, which is sent', async () => {
    const quickListing = listing({
      id: 'q1',
      status: 'Active',
      isQuickPost: true,
      listingType: 'Discounted Surplus Bag',
    });
    mocked.quick.mockResolvedValue({ kind: 'ok', listing: quickListing });
    mocked.get.mockResolvedValue({ kind: 'ok', listing: quickListing });
    await openQuickPost();
    expect(screen.getByRole('radio', { name: 'Unknown' })).toBeChecked();
    await fillQuickPost();
    await fireEvent.press(screen.getByRole('radio', { name: 'Bread and baked goods' }));
    await postNow();

    await screen.findByTestId('listing-status');
    expect(mocked.quick.mock.calls[0]?.[1]).toMatchObject({ foodCategory: 'bread_and_baked_goods' });
  });

  async function postQuick(overrides: Partial<Listing> = {}) {
    const quickListing = listing({
      id: 'q1',
      status: 'Active',
      isQuickPost: true,
      listingType: 'Discounted Surplus Bag',
      perishabilityCategory: 'Highly perishable',
      foodCategory: 'bread_and_baked_goods',
      originalValue: null,
      storage: null,
      ...overrides,
    });
    mocked.quick.mockResolvedValue({ kind: 'ok', listing: quickListing });
    mocked.get.mockResolvedValue({ kind: 'ok', listing: quickListing });
    await openQuickPost();
    await fillQuickPost();
    await postNow();
    await screen.findByTestId('quick-post-destination');
    return quickListing;
  }

  test('FR-RTE-05 D-68 after posting, the destinations are shown with Consumers chosen and the recommendation marked', async () => {
    await postQuick();

    const consumers = await screen.findByRole('radio', { name: /Consumers \(Discounted Surplus Bag\)/ });
    expect(consumers).toBeChecked();
    expect(screen.getByText(/Recommended/)).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /Charity \(Donation\)/ })).not.toBeChecked();
    expect(getDestinations).toHaveBeenCalledWith('vendor-token', 'q1');
  });

  test('FR-RTE-06 D-68 the vendor can send the Quick Post to a charity instead', async () => {
    const posted = await postQuick();
    jest.mocked(chooseDestination).mockResolvedValue({
      kind: 'ok',
      listing: { ...posted, listingType: 'Donation' },
    });

    await fireEvent.press(await screen.findByRole('radio', { name: /Charity \(Donation\)/ }));

    expect(chooseDestination).toHaveBeenCalledWith('vendor-token', 'q1', 'charity');
    await waitFor(() => {
      expect(screen.getByRole('radio', { name: /Charity \(Donation\)/ })).toBeChecked();
    });
  });

  test('FR-RTE-05 D-68 a Quick Post without a food category says no partner can be matched', async () => {
    await postQuick({ foodCategory: 'unknown' });

    expect(screen.getByTestId('quick-post-no-category')).toHaveTextContent(
      'No food category was given, so no charity or composting partner can be matched.',
    );
  });

  test('FR-RTE-06 D-68 once the pickup has ended, the destination can no longer be changed', async () => {
    jest.mocked(getDestinations).mockResolvedValue({
      kind: 'ok',
      destinations: { ...QUICK_ROUTES, timeLeftMinutes: 0 },
    });
    await postQuick();

    expect(await screen.findByText(/The pickup has ended/)).toBeOnTheScreen();
    expect(screen.queryByTestId('quick-post-destinations')).toBeNull();
  });

  test('FR-RTE-06 D-68 the server saying the pickup has ended is shown', async () => {
    await postQuick();
    jest.mocked(chooseDestination).mockResolvedValue({ kind: 'pickupEnded' });

    await fireEvent.press(await screen.findByRole('radio', { name: /Charity \(Donation\)/ }));

    expect(await screen.findByText(/The pickup has ended/)).toBeOnTheScreen();
  });

  test('E-LST-04 a Quick Post without a name, description or pickup end is marked and nothing is sent', async () => {
    await openQuickPost();
    await fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));
    await type('Price per bag (EGP)', '25');
    await postNow();

    expect(screen.getByText('Enter the name (up to 80 characters).')).toBeOnTheScreen();
    expect(screen.getByText('Write a description (up to 300 characters).')).toBeOnTheScreen();
    expect(field('Pickup ends').props.accessibilityHint).toBe(
      'Choose when pickup ends. It must be later than the pickup start.',
    );
    expect(mocked.upload).not.toHaveBeenCalled();
    expect(mocked.quick).not.toHaveBeenCalled();
  });

  test('FR-LST-02 a Quick Post that ends too late says the latest end time (D-61)', async () => {
    mocked.quick.mockResolvedValue({ kind: 'afterExpiry', latestPickupEnd: '2026-11-01T16:00:00.000Z' });
    await openQuickPost();
    await fillQuickPost();
    await postNow();

    const time = formatDateTime('2026-11-01T16:00:00.000Z', 'en');
    await waitFor(() => {
      expect(field('Pickup ends').props.accessibilityHint).toBe(
        `Pickup must end by ${time}, the food's estimated limit. Choose an earlier end time.`,
      );
    });
  });

  test('E-LST-04 a Quick Post outside the opening hours is marked with the hours (D-62)', async () => {
    mocked.quick.mockResolvedValue({
      kind: 'invalid',
      fields: ['pickupEnd'],
      hours: { opensAt: '18:00', closesAt: '23:00' },
    });
    await openQuickPost();
    await fillQuickPost();
    await postNow();

    await waitFor(() => {
      expect(field('Pickup ends').props.accessibilityHint).toBe(
        'The shop is open 18:00–23:00. The pickup must be inside these hours.',
      );
    });
  });

  test('E-LST-02 a failed Quick Post upload keeps the values and offers Retry', async () => {
    mocked.upload.mockResolvedValueOnce({ kind: 'failed' });
    await openQuickPost();
    await fillQuickPost();
    await postNow();

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeOnTheScreen();
    expect(field('Name').props.value).toBe('Mixed pastries');
    expect(field('Description').props.value).toBe('Pastries from this morning');
    expect(screen.getByTestId('quick-bags')).toHaveTextContent('2');
    expect(field('Price per bag (EGP)').props.value).toBe('25');
    expect(field('Pickup ends').props.value).toBe('2099-01-01T12:00:00.000Z');
  });
});

describe('NFR-06 IF-UI-03 the listing screens in Arabic', () => {
  test('NFR-06 the listing form is in Arabic and right-to-left', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    mocked.getMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'v1', role: 'vendor', status: 'Approved', language: 'ar' },
    });
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('home-create-listing'));
    await screen.findByTestId('listing-form');

    for (const label of ['الاسم', 'الوصف', 'بداية الاستلام']) {
      expect(screen.getByLabelText(label)).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: 'زيادة واحد في عدد الأكياس' })).toBeOnTheScreen();
    // D-67: the counter shows its number with Arabic digits.
    expect(screen.getByTestId('listing-bags')).toHaveTextContent('١');
    expect(screen.getByRole('button', { name: 'التقاط صورة' })).toBeOnTheScreen();
    expect(screen.getByTestId('screen-root')).toHaveStyle({ direction: 'rtl' });
    expect(screen.getByTestId('listing-form')).toHaveStyle({ direction: 'rtl' });
  });

  test('NFR-05a no listing text says the food is safe', () => {
    const texts = JSON.stringify([en.listing, en.quickPost, en.vendorHome, en.branches]);

    expect(texts).not.toMatch(/\bsafe\b/i);
  });

  test('NFR-05a D-74 the allowed pickup window is labelled as an Estimate in both languages', () => {
    expect(en.listing.pickWindowValue).toMatch(/^Estimate/);
    expect(ar.listing.pickWindowValue).toMatch(/^تقدير/);
  });
});
