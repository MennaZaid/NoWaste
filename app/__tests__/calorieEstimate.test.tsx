// US-16 Estimated calorie range on the app (FR-LST-07, IF-UI-04, NFR-05a, NFR-06, decision D-119). The AI draft shows
// the estimated kcal per bag labelled Estimate with a Remove button; the listing is saved with keepCalorieEstimate;
// customers and the vendor see the range labelled Estimate. The API, the location and the photo are mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import {
  createListing,
  createQuickPost,
  getListing,
  getMe,
  getMyListings,
  getNearbyOffers,
  getOffer,
  getShop,
  previewPickBy,
  uploadListingPhoto,
  type AiDraft,
  type Branch,
  type Listing,
  type Offer,
  type Shop,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { compressPhoto } from '@/listings/compressPhoto';
import en from '../src/i18n/en.json';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  getAutoCharity: jest.fn().mockResolvedValue({ kind: 'ok', optIn: false }),
  setAutoCharity: jest.fn().mockResolvedValue({ kind: 'ok', optIn: true }),
  getListingAutoOffer: jest.fn().mockResolvedValue({ kind: 'ok', offer: null }),
  getListingPartnerPickup: jest.fn().mockResolvedValue({ kind: 'ok', pickup: null }),
  getListingReservations: jest.fn().mockResolvedValue({ kind: 'unexpected' }),
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
  getMyListings: jest.fn(),
  downloadListingPhoto: jest.fn().mockResolvedValue(null),
  getCategoryHours: jest.fn().mockResolvedValue({
    kind: 'ok',
    hours: { highlyPerishableMaxHours: 6, shortLifeMaxHours: 48 },
  }),
  getDestinations: jest.fn().mockResolvedValue({ kind: 'unexpected' }),
  getNearbyOffers: jest.fn(),
  getOffer: jest.fn(),
  getNoShowStanding: jest.fn().mockResolvedValue({ kind: 'unexpected' }),
}));

jest.mock('@/listings/compressPhoto', () => ({ compressPhoto: jest.fn() }));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
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
  mine: jest.mocked(getMyListings),
  nearby: jest.mocked(getNearbyOffers),
  offer: jest.mocked(getOffer),
  compress: jest.mocked(compressPhoto),
  camera: jest.mocked(ImagePicker.launchCameraAsync),
  cameraPermission: jest.mocked(ImagePicker.requestCameraPermissionsAsync),
  permission: jest.mocked(Location.requestForegroundPermissionsAsync),
  position: jest.mocked(Location.getCurrentPositionAsync),
};

const MAIN: Branch = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Fatma Bakery',
  address: '12 Tahrir Street, Dokki',
  latitude: 30.0381,
  longitude: 31.2122,
  opensAt: '00:00',
  closesAt: '23:59',
};

const SHOP: Shop = {
  shopName: 'Fatma Bakery',
  vendorType: 'formal',
  address: MAIN.address,
  latitude: MAIN.latitude,
  longitude: MAIN.longitude,
  opensAt: '00:00',
  closesAt: '23:59',
  branches: [MAIN],
  pickupStartRule: { maxDaysAhead: 7, pastGraceMinutes: 5 },
};

const DRAFT: AiDraft = {
  foodType: 'Koshari',
  foodCategory: 'cooked_meals',
  quantity: 4,
  calorieRange: { min: 600, max: 900 },
  nameAr: 'كشري',
  nameEn: 'Koshari',
  descriptionAr: 'كشري طازج',
  descriptionEn: 'Fresh koshari',
  confidence: 0.9,
};

const LISTING: Listing = {
  id: 'l1',
  status: 'Active',
  listingType: 'Discounted Surplus Bag',
  isQuickPost: false,
  foodType: 'Koshari',
  foodCategory: 'cooked_meals',
  photoKey: 'k.jpg',
  nameAr: null,
  nameEn: 'Koshari',
  descriptionAr: null,
  descriptionEn: 'Fresh koshari',
  sourceLanguage: 'en',
  branchId: null,
  bagsTotal: 4,
  bagsAvailable: 1,
  originalValue: 100,
  price: 40,
  pickupStart: '2099-11-01T11:00:00.000Z',
  pickupEnd: '2099-11-01T13:00:00.000Z',
  storage: 'room_temperature',
  perishabilityCategory: 'Highly perishable',
  urgency: null,
  unfitForPeople: false,
  latitude: SHOP.latitude,
  longitude: SHOP.longitude,
  calorieMin: 600,
  calorieMax: 900,
  landfill: null,
};

const OFFER: Offer = {
  id: 'o1',
  nameAr: null,
  nameEn: 'Koshari',
  descriptionAr: null,
  descriptionEn: 'Fresh koshari',
  sourceLanguage: 'en',
  foodType: 'Koshari',
  foodCategory: 'cooked_meals',
  isQuickPost: false,
  bagsAvailable: 3,
  originalValue: 100,
  price: 40,
  calorieMin: 600,
  calorieMax: 900,
  pickupStart: '2099-11-01T11:00:00.000Z',
  pickupEnd: '2099-11-01T13:00:00.000Z',
  distanceMeters: 800,
  place: {
    key: 'b1',
    branchId: 'b1',
    shopName: 'Fatma Bakery',
    branchName: 'Fatma Bakery',
    address: '12 Tahrir Street, Dokki',
    latitude: 30.04,
    longitude: 31.21,
  },
};

const ESTIMATE = 'Estimate: 600–900 kcal per bag';

function signIn(role: 'vendor' | 'consumer') {
  store.set(TOKEN_KEY, `${role}-token`);
  mocked.getMe.mockResolvedValue({
    kind: 'ok',
    user: { id: 'u1', role, status: role === 'vendor' ? 'Approved' : 'Active', language: 'en' },
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  store.clear();
  for (const fn of Object.values(mocked)) fn.mockReset();
  signIn('vendor');
  mocked.getShop.mockResolvedValue({ kind: 'ok', shop: SHOP });
  mocked.compress.mockResolvedValue('file:///small.jpg');
  mocked.cameraPermission.mockResolvedValue({ granted: true } as ImagePicker.CameraPermissionResponse);
  mocked.camera.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///camera.jpg' }],
  } as ImagePicker.ImagePickerResult);
  mocked.upload.mockResolvedValue({ kind: 'ok', photoKey: 'k.jpg', draft: DRAFT });
  mocked.create.mockResolvedValue({ kind: 'unexpected' });
  mocked.quick.mockResolvedValue({ kind: 'unexpected' });
  mocked.preview.mockResolvedValue({ kind: 'unexpected' });
  mocked.get.mockResolvedValue({ kind: 'ok', listing: LISTING });
  mocked.mine.mockResolvedValue({ kind: 'ok', listings: [LISTING] });
  mocked.permission.mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse);
  mocked.position.mockResolvedValue({
    coords: { latitude: 30.0381, longitude: 31.2122 },
  } as Location.LocationObject);
  mocked.nearby.mockResolvedValue({
    kind: 'ok',
    radius: { km: 10, defaultKm: 10, minKm: 1, maxKm: 50, stepKm: 1 },
    offers: [OFFER],
  });
  mocked.offer.mockResolvedValue({ kind: 'ok', offer: { ...OFFER, distanceMeters: null } });
});

const confirmButtons = () => screen.queryAllByRole('button', { name: en.aiDraft.confirm });

async function openFormWithDraft() {
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('home-create-listing'));
  await screen.findByTestId('listing-form');
  await screen.findByRole('radio', { name: MAIN.address });
  await fireEvent.press(screen.getByRole('button', { name: en.listing.takePhoto }));
  await screen.findByTestId('listing-photo-preview');
  await fireEvent.press(await screen.findByRole('button', { name: en.aiDraft.fill }));
  await waitFor(() => expect(confirmButtons()).toHaveLength(5));
}

async function fillConfirmAndSave() {
  await fireEvent.changeText(screen.getByLabelText('Original value (EGP)'), '100');
  await fireEvent.changeText(screen.getByLabelText('Discounted price (EGP)'), '40');
  await fireEvent.changeText(screen.getByLabelText('Pickup starts'), '2026-11-01T11:00:00.000Z');
  await fireEvent.press(screen.getByTestId('listing-storage'));
  await fireEvent.press(await screen.findByTestId('listing-storage-option-room_temperature'));
  for (const button of confirmButtons()) await fireEvent.press(button);
  await fireEvent.press(screen.getByRole('button', { name: en.listing.save }));
  await waitFor(() => expect(mocked.create).toHaveBeenCalledTimes(1));
}

describe('FR-LST-07 the vendor sees the AI calorie estimate and may remove it', () => {
  test('FR-LST-07 IF-UI-04 the draft shows the range labelled Estimate with a Remove button', async () => {
    await openFormWithDraft();

    expect(screen.getByTestId('calorie-estimate')).toHaveTextContent(new RegExp(ESTIMATE));
    expect(screen.getByRole('button', { name: en.calories.remove })).toBeOnTheScreen();
  });

  test('FR-LST-07 a kept estimate is saved with the listing', async () => {
    await openFormWithDraft();
    await fillConfirmAndSave();

    expect(mocked.create).toHaveBeenCalledWith(
      'vendor-token',
      expect.objectContaining({ keepCalorieEstimate: true }),
    );
  });

  test('FR-LST-07 Remove takes the estimate off; the listing is saved without it', async () => {
    await openFormWithDraft();

    await fireEvent.press(screen.getByRole('button', { name: en.calories.remove }));
    expect(screen.getByText(en.calories.removed)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: en.calories.keep })).toBeOnTheScreen();
    await fillConfirmAndSave();

    expect(mocked.create).toHaveBeenCalledWith(
      'vendor-token',
      expect.objectContaining({ keepCalorieEstimate: false }),
    );
  });

  test('FR-LST-07 a draft without a range shows no calorie estimate', async () => {
    mocked.upload.mockResolvedValue({
      kind: 'ok',
      photoKey: 'k.jpg',
      draft: { ...DRAFT, calorieRange: null },
    });
    await openFormWithDraft();

    expect(screen.queryByTestId('calorie-estimate')).toBeNull();
    await fillConfirmAndSave();
    expect(mocked.create.mock.calls[0]?.[1]).not.toHaveProperty('keepCalorieEstimate');
  });

  test('FR-LST-07 D-119 the Quick Post form shows the estimate and sends the choice too', async () => {
    mocked.getShop.mockResolvedValue({ kind: 'ok', shop: { ...SHOP, vendorType: 'informal' } });
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('home-quick-post'));
    await screen.findByTestId('quick-post-form');
    await fireEvent.press(screen.getByRole('button', { name: en.listing.takePhoto }));
    await screen.findByTestId('listing-photo-preview');
    await fireEvent.press(await screen.findByRole('button', { name: en.aiDraft.fill }));
    await waitFor(() => expect(confirmButtons()).toHaveLength(5));

    expect(screen.getByTestId('calorie-estimate')).toHaveTextContent(new RegExp(ESTIMATE));
    await fireEvent.press(screen.getByRole('button', { name: en.calories.remove }));
    await fireEvent.changeText(screen.getByLabelText('Price per bag (EGP)'), '25');
    await fireEvent.changeText(screen.getByLabelText('Pickup ends'), '2099-01-01T12:00:00.000Z');
    for (const button of confirmButtons()) await fireEvent.press(button);
    await fireEvent.press(screen.getByRole('button', { name: en.quickPost.submit }));

    await waitFor(() => expect(mocked.quick).toHaveBeenCalledTimes(1));
    expect(mocked.quick).toHaveBeenCalledWith(
      'vendor-token',
      expect.objectContaining({ keepCalorieEstimate: false }),
    );
  });
});

describe('FR-LST-07 the estimate is shown labelled Estimate', () => {
  test("FR-LST-07 the vendor's listing page shows the kept estimate", async () => {
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('home-my-listings'));
    await fireEvent.press(await screen.findByTestId('my-listing-l1'));

    expect(await screen.findByTestId('listing-calories')).toHaveTextContent(new RegExp(ESTIMATE));
  });

  test('FR-LST-07 IF-UI-04 the customer sees the range labelled Estimate on the product page', async () => {
    signIn('consumer');
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('offer-o1'));

    expect(await screen.findByTestId('offer-calories')).toHaveTextContent(`Calories${ESTIMATE}`);
  });

  test('FR-LST-07 an offer without an estimate shows no calories', async () => {
    mocked.offer.mockResolvedValue({
      kind: 'ok',
      offer: { ...OFFER, calorieMin: null, calorieMax: null, distanceMeters: null },
    });
    signIn('consumer');
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('offer-o1'));

    await screen.findByTestId('offer-name');
    expect(screen.queryByTestId('offer-calories')).toBeNull();
  });
});
