// US-10 Create listing, US-11 Quick Post and US-13 Preparation/storage/expiry on the app (FR-LST-01, FR-LST-02,
// FR-LST-04, E-LST-02, E-LST-03, E-LST-04, E-LST-06, NFR-05c, NFR-06). The API, the photo compression (tested in
// compressPhoto.test.ts), the camera, the C-24 map and the date-time picker are mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import {
  createListing,
  createQuickPost,
  getListing,
  getMe,
  getShop,
  publishListing,
  uploadListingPhoto,
  type Listing,
  type Shop,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { compressPhoto } from '@/listings/compressPhoto';
import en from '../src/i18n/en.json';
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
  getListing: jest.fn(),
  publishListing: jest.fn(),
  downloadListingPhoto: jest.fn().mockResolvedValue(null),
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
  get: jest.mocked(getListing),
  publish: jest.mocked(publishListing),
  compress: jest.mocked(compressPhoto),
  cameraPermission: jest.mocked(ImagePicker.requestCameraPermissionsAsync),
  camera: jest.mocked(ImagePicker.launchCameraAsync),
  gallery: jest.mocked(ImagePicker.launchImageLibraryAsync),
};

const SHOP: Shop = {
  shopName: 'Fatma Bakery',
  vendorType: 'formal',
  address: '12 Tahrir Street, Dokki',
  latitude: 30.0381,
  longitude: 31.2122,
};

const T = {
  start: '2026-11-01T11:00:00.000Z',
  end: '2026-11-01T13:00:00.000Z',
  prep: '2026-11-01T08:00:00.000Z',
  expiry: '2026-11-01T18:00:00.000Z',
};

function listing(overrides: Partial<Listing> = {}): Listing {
  return {
    id: 'l1',
    status: 'Draft',
    listingType: null,
    isQuickPost: false,
    foodType: 'Baladi bread',
    foodCategory: 'bread_and_baked_goods',
    photoKey: 'k.jpg',
    descriptionAr: 'خبز بلدي طازج',
    descriptionEn: 'Fresh baladi bread',
    bagsTotal: 3,
    bagsAvailable: 3,
    originalValue: 100,
    price: 40,
    pickupStart: T.start,
    pickupEnd: T.end,
    prepTime: T.prep,
    storage: 'room_temperature',
    expiryAt: T.expiry,
    perishabilityCategory: null,
    latitude: SHOP.latitude,
    longitude: SHOP.longitude,
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
  mocked.get.mockResolvedValue({ kind: 'ok', listing: listing() });
  mocked.publish.mockResolvedValue({ kind: 'ok', listing: listing({ status: 'Active' }) });
});

const field = (label: string) => screen.getByLabelText(label);
const type = (label: string, text: string) => fireEvent.changeText(field(label), text);

// After the saved login is restored the app opens the vendor home, so the forms are reached through its buttons.
async function openForm() {
  const app = await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('home-create-listing'));
  await screen.findByTestId('listing-form');
  // The map appears once the shop pin has arrived.
  await screen.findByTestId('listing-map');
  return app;
}

async function fillForm() {
  await fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));
  await screen.findByTestId('listing-photo-preview');
  await type('Food type', 'Baladi bread');
  await fireEvent.press(screen.getByRole('radio', { name: 'Bread and baked goods' }));
  await type('Description in Arabic', 'خبز بلدي طازج');
  await type('Description in English', 'Fresh baladi bread');
  await type('Number of bags', '3');
  await type('Original value (EGP)', '100');
  await type('Discounted price (EGP)', '40');
  await type('Pickup starts', T.start);
  await type('Pickup ends', T.end);
  await type('Preparation time', T.prep);
  await fireEvent.press(screen.getByRole('radio', { name: 'Room temperature' }));
  await type('Expiry date and time', T.expiry);
}

const save = () => fireEvent.press(screen.getByRole('button', { name: 'Save listing' }));

const expectedBody = {
  photoKey: 'k.jpg',
  foodType: 'Baladi bread',
  foodCategory: 'bread_and_baked_goods',
  descriptionAr: 'خبز بلدي طازج',
  descriptionEn: 'Fresh baladi bread',
  bagsTotal: 3,
  originalValue: 100,
  price: 40,
  pickupStart: T.start,
  pickupEnd: T.end,
  prepTime: T.prep,
  storage: 'room_temperature',
  expiryAt: T.expiry,
  location: undefined,
};

describe('FR-LST-01 FR-LST-02 the vendor home', () => {
  test('FR-LST-01 an approved formal vendor sees Create listing and no Quick Post', async () => {
    await renderApp('/home');

    expect(await screen.findByTestId('home-create-listing')).toBeOnTheScreen();
    expect(await screen.findByText('Fatma Bakery')).toBeOnTheScreen();
    expect(screen.queryByTestId('home-quick-post')).toBeNull();
  });

  test('FR-LST-02 an informal vendor also sees Quick Post', async () => {
    mocked.getShop.mockResolvedValue({ kind: 'ok', shop: { ...SHOP, vendorType: 'informal' } });
    await renderApp('/home');

    expect(await screen.findByTestId('home-quick-post')).toBeOnTheScreen();
    expect(screen.getByTestId('home-create-listing')).toBeOnTheScreen();
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

    await fireEvent.press(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('Your listing is published.')).toBeOnTheScreen();
    expect(screen.getByTestId('listing-status')).toHaveTextContent('Active: published');
    expect(mocked.publish).toHaveBeenCalledWith('vendor-token', 'l1');
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

  test('FR-LST-04 preparation time, storage and expiry can each be marked Unknown', async () => {
    await openForm();
    await fillForm();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Preparation time unknown' }));
    // The second "Unknown" radio is the storage one (the first is the food category).
    await fireEvent.press(screen.getAllByRole('radio', { name: 'Unknown' })[1]!);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Expiry unknown' }));
    // A time can no longer be chosen once it is marked Unknown.
    expect(field('Preparation time').props.editable).toBe(false);
    expect(field('Expiry date and time').props.editable).toBe(false);
    await save();

    await screen.findByTestId('listing-status');
    expect(mocked.create.mock.calls[0]?.[1]).toMatchObject({
      prepTime: 'unknown',
      storage: 'unknown',
      expiryAt: 'unknown',
    });
  });

  test('FR-LST-04 the storage condition can be Unknown', async () => {
    await openForm();
    await fillForm();
    const [, storageUnknown] = screen.getAllByRole('radio', { name: 'Unknown' });
    await fireEvent.press(storageUnknown!);
    await save();

    await screen.findByTestId('listing-status');
    expect(mocked.create.mock.calls[0]?.[1]).toMatchObject({ storage: 'unknown' });
  });

  test('FR-LST-01 a moved pickup pin is sent as the listing location (feedback change)', async () => {
    await openForm();
    await fillForm();
    await fireEvent.press(screen.getByTestId('listing-map'));
    await save();

    await screen.findByTestId('listing-status');
    expect(mocked.create.mock.calls[0]?.[1]).toMatchObject({
      location: { latitude: 30.05, longitude: 31.25 },
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
    expect(field('Food type').props.value).toBe('Baladi bread');
    expect(field('Description in Arabic').props.value).toBe('خبز بلدي طازج');
    expect(field('Description in English').props.value).toBe('Fresh baladi bread');
    expect(field('Number of bags').props.value).toBe('3');
    expect(field('Original value (EGP)').props.value).toBe('100');
    expect(field('Discounted price (EGP)').props.value).toBe('40');
    expect(field('Pickup starts').props.value).toBe(T.start);
    expect(field('Pickup ends').props.value).toBe(T.end);
    expect(field('Preparation time').props.value).toBe(T.prep);
    expect(field('Expiry date and time').props.value).toBe(T.expiry);
    expect(screen.getByRole('radio', { name: 'Bread and baked goods' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Room temperature' })).toBeChecked();
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

describe('E-LST-04 E-LST-03 invalid fields are marked and nothing is sent', () => {
  test('E-LST-04 an empty form marks every required field and uploads nothing', async () => {
    await openForm();
    await save();

    expect(screen.getByTestId('listing-errors')).toBeOnTheScreen();
    for (const text of [
      'Add a photo of the food.',
      'Enter the food type (up to 80 characters).',
      'Choose a food category, or Unknown.',
      'Write a description in Arabic (up to 300 characters).',
      'Write a description in English (up to 300 characters).',
      'Enter a whole number of bags, at least 1.',
      'Enter the original value in EGP, more than 0.',
      'Enter a price above 0 EGP and not higher than the original value.',
      'Choose how the food is stored, or Unknown.',
    ]) {
      expect(screen.getByText(text)).toBeOnTheScreen();
    }
    expect(field('Pickup starts').props.accessibilityHint).toBe('Choose when pickup starts.');
    expect(mocked.upload).not.toHaveBeenCalled();
    expect(mocked.create).not.toHaveBeenCalled();
  });

  test.each([
    ['bags 0', 'Number of bags', '0', 'Enter a whole number of bags, at least 1.'],
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
  ])('E-LST-04 %s is marked', async (_case, label, value, message) => {
    await openForm();
    await fillForm();
    await type(label, value);
    await save();

    expect(screen.getByText(message)).toBeOnTheScreen();
    expect(mocked.upload).not.toHaveBeenCalled();
  });

  test('E-LST-04 bags typed with Arabic-Indic digits are read as a number', async () => {
    await openForm();
    await fillForm();
    await type('Number of bags', '٣');
    await save();

    await screen.findByTestId('listing-status');
    expect(mocked.create.mock.calls[0]?.[1]).toMatchObject({ bagsTotal: 3 });
  });

  test('E-LST-04 a pickup end equal to the start is marked', async () => {
    await openForm();
    await fillForm();
    await type('Pickup ends', T.start);
    await save();

    expect(field('Pickup ends').props.accessibilityHint).toBe(
      'Choose when pickup ends. It must be after the start.',
    );
    expect(mocked.upload).not.toHaveBeenCalled();
  });

  test('E-LST-03 NFR-05c a pickup end after the expiry asks for an earlier end time', async () => {
    await openForm();
    await fillForm();
    await type('Expiry date and time', '2026-11-01T12:59:00.000Z');
    await save();

    expect(field('Pickup ends').props.accessibilityHint).toBe(
      'Pickup must end no later than the expiry. Choose an earlier end time.',
    );
    expect(mocked.upload).not.toHaveBeenCalled();
  });

  test('NFR-05c a pickup end equal to the expiry is accepted', async () => {
    await openForm();
    await fillForm();
    await type('Expiry date and time', T.end);
    await save();

    await screen.findByTestId('listing-status');
  });

  test('E-LST-03 the server answer E-LST-03 is shown on the pickup end', async () => {
    mocked.create.mockResolvedValue({ kind: 'afterExpiry' });
    await openForm();
    await fillForm();
    await save();

    await waitFor(() => {
      expect(field('Pickup ends').props.accessibilityHint).toBe(
        'Pickup must end no later than the expiry. Choose an earlier end time.',
      );
    });
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

async function openQuickPost() {
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('home-quick-post'));
  await screen.findByTestId('quick-post-form');
}

describe('FR-LST-02 Quick Post', () => {
  beforeEach(() => {
    mocked.getShop.mockResolvedValue({ kind: 'ok', shop: { ...SHOP, vendorType: 'informal' } });
  });

  test('FR-LST-02 Quick Post asks only for a photo, bags, price and pickup end, and is published at once', async () => {
    const quickListing = listing({
      id: 'q1',
      status: 'Active',
      isQuickPost: true,
      listingType: 'Discounted Surplus Bag',
      perishabilityCategory: 'Highly perishable',
      foodType: null,
      foodCategory: 'unknown',
      descriptionAr: null,
      descriptionEn: null,
      originalValue: null,
      prepTime: null,
      storage: null,
      expiryAt: null,
    });
    mocked.quick.mockResolvedValue({ kind: 'ok', listing: quickListing });
    mocked.get.mockResolvedValue({ kind: 'ok', listing: quickListing });
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('home-quick-post'));
    await screen.findByTestId('quick-post-form');

    expect(screen.queryByLabelText('Food type')).toBeNull();
    expect(screen.queryByLabelText('Original value (EGP)')).toBeNull();
    expect(screen.queryByLabelText('Preparation time')).toBeNull();
    expect(screen.queryByLabelText('Expiry date and time')).toBeNull();

    await fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));
    await screen.findByTestId('listing-photo-preview');
    await type('Number of bags', '2');
    await type('Price per bag (EGP)', '25');
    await type('Pickup ends', '2099-01-01T12:00:00.000Z');
    await fireEvent.press(screen.getByRole('button', { name: 'Post now' }));

    expect(await screen.findByText('Your listing is published.')).toBeOnTheScreen();
    expect(screen.getByText(/treated as Highly perishable/)).toBeOnTheScreen();
    expect(mocked.quick).toHaveBeenCalledWith('vendor-token', {
      photoKey: 'k.jpg',
      bagsTotal: 2,
      price: 25,
      pickupEnd: '2099-01-01T12:00:00.000Z',
    });
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  });

  test('E-LST-04 a Quick Post without a pickup end time is marked and nothing is sent', async () => {
    await openQuickPost();
    await fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));
    await type('Number of bags', '2');
    await type('Price per bag (EGP)', '25');
    await fireEvent.press(screen.getByRole('button', { name: 'Post now' }));

    expect(field('Pickup ends').props.accessibilityHint).toBe(
      'Choose when pickup ends. It must be later than now.',
    );
    expect(mocked.upload).not.toHaveBeenCalled();
    expect(mocked.quick).not.toHaveBeenCalled();
  });

  test('E-LST-02 a failed Quick Post upload keeps the values and offers Retry', async () => {
    mocked.upload.mockResolvedValueOnce({ kind: 'failed' });
    await openQuickPost();
    await fireEvent.press(screen.getByRole('button', { name: 'Take a photo' }));
    await type('Number of bags', '2');
    await type('Price per bag (EGP)', '25');
    await type('Pickup ends', '2099-01-01T12:00:00.000Z');
    await fireEvent.press(screen.getByRole('button', { name: 'Post now' }));

    expect(await screen.findByRole('button', { name: 'Retry' })).toBeOnTheScreen();
    expect(field('Number of bags').props.value).toBe('2');
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

    for (const label of [
      'نوع الطعام',
      'الوصف بالعربية',
      'الوصف بالإنجليزية',
      'عدد الأكياس',
      'وقت التحضير',
      'تاريخ ووقت انتهاء الصلاحية',
    ]) {
      expect(screen.getByLabelText(label)).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: 'التقاط صورة' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'مبرد' })).toBeOnTheScreen();
    expect(screen.getByTestId('screen-root')).toHaveStyle({ direction: 'rtl' });
    expect(screen.getByTestId('listing-form')).toHaveStyle({ direction: 'rtl' });
  });

  test('NFR-05a no listing text says the food is safe', () => {
    const texts = JSON.stringify([en.listing, en.quickPost, en.vendorHome]);

    expect(texts).not.toMatch(/\bsafe\b/i);
  });
});
