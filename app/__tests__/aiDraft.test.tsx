// US-12 AI draft listing on the app (FR-LST-03, E-LST-01, NFR-03, NFR-05a, NFR-05b, NFR-06; decisions D-80 to D-83).
// After choosing the photo the vendor taps "Fill in with AI draft" (D-84); the photo is uploaded and the draft fills the
// form; every AI-filled field is marked
// Draft and must be confirmed or edited before saving; the estimated quantity is shown only as an Estimate; without
// a draft the vendor fills the form by hand. The API and the photo compression are mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import {
  createListing,
  getMe,
  getShop,
  previewPickBy,
  uploadListingPhoto,
  type AiDraft,
  type Branch,
  type Shop,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { compressPhoto } from '@/listings/compressPhoto';
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
  previewPickBy: jest.fn(),
  getListing: jest.fn().mockResolvedValue({ kind: 'unexpected' }),
  downloadListingPhoto: jest.fn().mockResolvedValue(null),
  getCategoryHours: jest.fn().mockResolvedValue({
    kind: 'ok',
    hours: { highlyPerishableMaxHours: 6, shortLifeMaxHours: 48 },
  }),
  getDestinations: jest.fn().mockResolvedValue({ kind: 'unexpected' }),
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
  preview: jest.mocked(previewPickBy),
  compress: jest.mocked(compressPhoto),
  camera: jest.mocked(ImagePicker.launchCameraAsync),
  cameraPermission: jest.mocked(ImagePicker.requestCameraPermissionsAsync),
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
};

const DRAFT: AiDraft = {
  foodType: 'Koshari',
  foodCategory: 'cooked_meals',
  quantity: 4,
  nameAr: 'كشري',
  nameEn: 'Koshari',
  descriptionAr: 'كشري طازج',
  descriptionEn: 'Fresh koshari',
  confidence: 0.9,
};

const START = '2026-11-01T11:00:00.000Z';

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
  mocked.upload.mockResolvedValue({ kind: 'ok', photoKey: 'k.jpg', draft: DRAFT });
  mocked.create.mockResolvedValue({ kind: 'unexpected' });
  mocked.preview.mockResolvedValue({ kind: 'unexpected' });
});

async function openForm(path = '/home') {
  await renderApp(path);
  await fireEvent.press(await screen.findByTestId('home-create-listing'));
  await screen.findByTestId('listing-form');
  await screen.findByRole('radio', { name: MAIN.address });
}

async function takePhoto(fill = en.aiDraft.fill) {
  await fireEvent.press(screen.getByRole('button', { name: en.listing.takePhoto }));
  await screen.findByTestId('listing-photo-preview');
  await fireEvent.press(await screen.findByRole('button', { name: fill }));
}

async function fillTheRest() {
  await fireEvent.changeText(screen.getByLabelText('Original value (EGP)'), '100');
  await fireEvent.changeText(screen.getByLabelText('Discounted price (EGP)'), '40');
  await fireEvent.changeText(screen.getByLabelText('Pickup starts'), START);
  await fireEvent.press(screen.getByTestId('listing-storage'));
  await fireEvent.press(await screen.findByTestId('listing-storage-option-room_temperature'));
}

const confirmButtons = () => screen.queryAllByRole('button', { name: en.aiDraft.confirm });

describe('FR-LST-03 the AI draft fills the form', () => {
  test('FR-LST-03 D-84 no AI call until the vendor asks for the draft', async () => {
    await openForm();
    await fireEvent.press(screen.getByRole('button', { name: en.listing.takePhoto }));
    await screen.findByTestId('listing-photo-preview');

    expect(screen.getByRole('button', { name: en.aiDraft.fill })).toBeOnTheScreen();
    expect(mocked.upload).not.toHaveBeenCalled();
  });

  test('FR-LST-03 asking for the draft uploads the photo and fills name, description and category', async () => {
    await openForm();
    await takePhoto();

    await waitFor(() => expect(screen.getByLabelText(en.listing.nameLabel)).toHaveDisplayValue('Koshari'));
    expect(mocked.upload).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(en.listing.descriptionLabel)).toHaveDisplayValue('Fresh koshari');
    expect(screen.getByRole('radio', { name: 'Cooked meals' })).toBeChecked();
  });

  test('FR-LST-03 D-81 the other language is shown too, marked Draft', async () => {
    await openForm();
    await takePhoto();

    expect(await screen.findByLabelText(en.aiDraft.secondNameLabel)).toHaveDisplayValue('كشري');
    expect(screen.getByLabelText(en.aiDraft.secondDescriptionLabel)).toHaveDisplayValue('كشري طازج');
  });

  test('NFR-05a every AI value is labelled Draft or Estimate, and the quantity is only an Estimate (D-82)', async () => {
    await openForm();
    await takePhoto();

    expect(await screen.findByText(en.aiDraft.notice)).toBeOnTheScreen();
    expect(screen.getByText('Estimate: about 4 portions')).toBeOnTheScreen();
    expect(screen.getAllByText(en.aiDraft.draftTag).length).toBeGreaterThanOrEqual(5);
    // The number of bags is still the vendor's: it is not filled from the estimate.
    expect(screen.getByTestId('listing-bags')).toHaveTextContent('1');
  });

  test('NFR-05a no AI text says the food is safe', () => {
    for (const texts of [en.aiDraft, ar.aiDraft]) {
      expect(JSON.stringify(texts).toLowerCase()).not.toMatch(/safe|آمن/);
    }
  });
});

describe('NFR-05b every AI-filled field is confirmed or edited before saving', () => {
  test('NFR-05b saving with unconfirmed AI fields is stopped and the fields are marked', async () => {
    await openForm();
    await takePhoto();
    await fillTheRest();

    await fireEvent.press(screen.getByRole('button', { name: en.listing.save }));

    expect(mocked.create).not.toHaveBeenCalled();
    expect(await screen.findAllByText(en.aiDraft.confirmNeeded)).toHaveLength(5);
  });

  test('NFR-05b confirming each field, or editing it, lets the listing be saved with both languages', async () => {
    await openForm();
    await takePhoto();
    await fillTheRest();
    await waitFor(() => expect(confirmButtons()).toHaveLength(5));

    // Editing the name counts as confirming it; the other four are confirmed with the button.
    await fireEvent.changeText(screen.getByLabelText(en.listing.nameLabel), 'Koshari bowl');
    for (const button of confirmButtons()) await fireEvent.press(button);
    expect(confirmButtons()).toHaveLength(0);
    await fireEvent.press(screen.getByRole('button', { name: en.listing.save }));

    await waitFor(() => expect(mocked.create).toHaveBeenCalledTimes(1));
    expect(mocked.create).toHaveBeenCalledWith(
      'vendor-token',
      expect.objectContaining({
        photoKey: 'k.jpg',
        name: 'Koshari bowl',
        description: 'Fresh koshari',
        language: 'en',
        secondName: 'كشري',
        secondDescription: 'كشري طازج',
        foodCategory: 'cooked_meals',
        confirmedAiFields: expect.arrayContaining([
          'name',
          'description',
          'secondName',
          'secondDescription',
          'foodCategory',
        ]),
      }),
    );
    // The photo was uploaded once, when it was chosen.
    expect(mocked.upload).toHaveBeenCalledTimes(1);
  });

  test('NFR-05b the server refusing unconfirmed AI fields marks them again', async () => {
    mocked.create.mockResolvedValue({ kind: 'invalid', fields: ['foodCategory'], unconfirmedAi: true });
    await openForm();
    await takePhoto();
    await fillTheRest();
    await waitFor(() => expect(confirmButtons()).toHaveLength(5));
    for (const button of confirmButtons()) await fireEvent.press(button);

    await fireEvent.press(screen.getByRole('button', { name: en.listing.save }));

    expect(await screen.findByText(en.aiDraft.confirmNeeded)).toBeOnTheScreen();
  });
});

describe('E-LST-01 NFR-03 without a draft the vendor fills the form by hand', () => {
  test('E-LST-01 no draft: the app says so and the form stays empty', async () => {
    mocked.upload.mockResolvedValue({ kind: 'ok', photoKey: 'k.jpg', draft: null, draftError: 'E-LST-01' });
    await openForm();
    await takePhoto();

    expect(await screen.findByText(en.aiDraft.unavailable)).toBeOnTheScreen();
    expect(screen.getByLabelText(en.listing.nameLabel)).toHaveDisplayValue('');
    expect(screen.queryByLabelText(en.aiDraft.secondNameLabel)).toBeNull();
    expect(confirmButtons()).toHaveLength(0);
  });

  test('NFR-03 without a draft the listing is saved by hand with no AI fields', async () => {
    mocked.upload.mockResolvedValue({ kind: 'ok', photoKey: 'k.jpg', draft: null, draftError: 'E-LST-01' });
    await openForm();
    await takePhoto();
    await screen.findByText(en.aiDraft.unavailable);
    await fireEvent.changeText(screen.getByLabelText(en.listing.nameLabel), 'Koshari');
    await fireEvent.changeText(screen.getByLabelText(en.listing.descriptionLabel), 'Fresh koshari');
    await fireEvent.press(screen.getByRole('radio', { name: 'Cooked meals' }));
    await fillTheRest();

    await fireEvent.press(screen.getByRole('button', { name: en.listing.save }));

    await waitFor(() => expect(mocked.create).toHaveBeenCalledTimes(1));
    const body = mocked.create.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('secondName');
    expect(body).not.toHaveProperty('confirmedAiFields');
  });
});

describe('NFR-06 the AI draft in Arabic', () => {
  test('NFR-06 D-81 switching the language after the draft moves each text to its own language field', async () => {
    await openForm();
    await takePhoto();
    await screen.findByLabelText(en.aiDraft.secondNameLabel);
    await fireEvent.press(screen.getByTestId('ai-name-confirm'));

    await fireEvent.press(screen.getByRole('button', { name: 'العربية' }));

    await waitFor(() => expect(screen.getByLabelText(ar.listing.nameLabel)).toHaveDisplayValue('كشري'));
    expect(screen.getByLabelText(ar.listing.descriptionLabel)).toHaveDisplayValue('كشري طازج');
    expect(screen.getByLabelText(ar.aiDraft.secondNameLabel)).toHaveDisplayValue('Koshari');
    expect(screen.getByLabelText(ar.aiDraft.secondDescriptionLabel)).toHaveDisplayValue('Fresh koshari');
    // The English name was confirmed: it is now the second name and stays confirmed; the rest still need confirming.
    expect(screen.getAllByRole('button', { name: ar.aiDraft.confirm })).toHaveLength(4);
    expect(screen.getByTestId('ai-secondName')).toHaveTextContent(ar.aiDraft.confirmed, { exact: false });
  });

  test('NFR-06 in Arabic the main fields get the Arabic draft and the second fields the English one', async () => {
    mocked.getMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'v1', role: 'vendor', status: 'Approved', language: 'ar' },
    });
    await AsyncStorage.setItem('nowaste.language', 'ar');
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('home-create-listing'));
    await screen.findByTestId('listing-form');
    await fireEvent.press(await screen.findByRole('button', { name: ar.listing.takePhoto }));
    await fireEvent.press(await screen.findByRole('button', { name: ar.aiDraft.fill }));

    await waitFor(() => expect(screen.getByLabelText(ar.listing.nameLabel)).toHaveDisplayValue('كشري'));
    expect(screen.getByLabelText(ar.aiDraft.secondNameLabel)).toHaveDisplayValue('Koshari');
    expect(screen.getByText(ar.aiDraft.notice)).toBeOnTheScreen();
  });
});
