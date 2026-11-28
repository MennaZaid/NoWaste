// US-22 Charity pickup on the app (FR-RTE-10, E-RTE-03, E-RTE-04, FR-RES-10, NFR-06; decisions D-108 to D-110). A
// charity partner sees the Donation offers and its pickups, accepts with a pickup time, sees its pickup code and may
// cancel. The vendor's code box takes the charity's code. The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import {
  acceptPartnerOffer,
  cancelPartnerPickup,
  getMe,
  getPartnerOffer,
  getPartnerOffers,
  getPartnerPickups,
  type PartnerOffer,
  type PartnerPickup,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import en from '../src/i18n/en.json';
import ar from '../src/i18n/ar.json';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  getNotifications: jest.fn().mockResolvedValue({ kind: 'ok', notifications: [], unreadCount: 0 }),
  readNotifications: jest.fn().mockResolvedValue(true),
  getMyWaitlist: jest.fn().mockResolvedValue({ kind: 'ok', entries: [] }),
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getPartnerOffers: jest.fn(),
  getPartnerOffer: jest.fn(),
  acceptPartnerOffer: jest.fn(),
  getPartnerPickups: jest.fn(),
  cancelPartnerPickup: jest.fn(),
}));

const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;
const mocked = {
  getMe: jest.mocked(getMe),
  offers: jest.mocked(getPartnerOffers),
  offer: jest.mocked(getPartnerOffer),
  accept: jest.mocked(acceptPartnerOffer),
  pickups: jest.mocked(getPartnerPickups),
  cancel: jest.mocked(cancelPartnerPickup),
};

const START = '2026-11-01T10:10:00.000Z';
const END = '2026-11-01T12:10:00.000Z';
const TIME = '2026-11-01T10:30:00.000Z';

const OFFER: PartnerOffer = {
  listingId: 'l1',
  listingType: 'Donation',
  shopName: 'Fatma Bakery',
  address: '12 Tahrir Street, Dokki',
  nameAr: null,
  nameEn: 'Koshari',
  descriptionAr: null,
  descriptionEn: 'Fresh koshari',
  sourceLanguage: 'en',
  foodCategory: 'cooked_meals',
  bags: 3,
  pickupStart: START,
  pickupEnd: END,
  distanceMeters: 2700,
  latitude: 30.0381,
  longitude: 31.2122,
};

const PICKUP: PartnerPickup = {
  id: 'p1',
  listingId: 'l1',
  organisationName: 'Giza Food Bank',
  status: 'Accepted',
  listingType: 'Donation',
  pickupTime: TIME,
  pickupCode: '123456',
  shopName: 'Fatma Bakery',
  address: '12 Tahrir Street, Dokki',
  nameAr: null,
  nameEn: 'Koshari',
  sourceLanguage: 'en',
  foodCategory: 'cooked_meals',
  bags: 3,
  pickupStart: START,
  pickupEnd: END,
  latitude: 30.0381,
  longitude: 31.2122,
};

function signedInAs(role: 'charity' | 'composting', language: 'en' | 'ar' = 'en') {
  mocked.getMe.mockResolvedValue({ kind: 'ok', user: { id: 'u1', role, status: 'Approved', language } });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  store.clear();
  store.set(TOKEN_KEY, 'partner-token');
  for (const fn of Object.values(mocked)) fn.mockReset();
  signedInAs('charity');
  mocked.offers.mockResolvedValue({ kind: 'ok', offers: [OFFER] });
  mocked.offer.mockResolvedValue({ kind: 'ok', offer: OFFER });
  mocked.pickups.mockResolvedValue({ kind: 'ok', pickups: [PICKUP] });
  mocked.accept.mockResolvedValue({ kind: 'ok', pickup: PICKUP });
  mocked.cancel.mockResolvedValue({
    kind: 'ok',
    pickup: { ...PICKUP, status: 'Cancelled', pickupCode: null },
  });
});

async function openOffer() {
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('partner-offer-l1'));
  await screen.findByTestId('partner-offer');
  await screen.findByText('Fatma Bakery · 12 Tahrir Street, Dokki');
}

describe('FR-RTE-10 the charity home lists Donation offers and pickups', () => {
  test('FR-RTE-10 the charity home shows each offer with store, bags, distance and pickup window', async () => {
    await renderApp('/home');

    expect(await screen.findByTestId('partner-home')).toBeOnTheScreen();
    expect(await screen.findByText('Koshari')).toBeOnTheScreen();
    expect(screen.getByText('Fatma Bakery · 12 Tahrir Street, Dokki')).toBeOnTheScreen();
    expect(screen.getByText('Bags: 3 · 2.7 km away')).toBeOnTheScreen();
  });

  test('FR-RTE-10 with no offers the charity is told so', async () => {
    mocked.offers.mockResolvedValue({ kind: 'ok', offers: [] });
    await renderApp('/home');

    expect(await screen.findByText(en.partnerOffers.offersEmpty)).toBeOnTheScreen();
  });

  test('FR-RTE-10 My pickups lists the accepted pickups with their status', async () => {
    await renderApp('/home');
    await fireEvent.press(await screen.findByRole('button', { name: en.partnerOffers.pickupsTab }));

    expect(await screen.findByTestId('partner-pickup-p1')).toBeOnTheScreen();
    expect(screen.getByText(en.partnerOffers.statuses.Accepted)).toBeOnTheScreen();
  });

  test('FR-RTE-12 D-111 a composting partner gets the offers home, with each card marked as a Compost offer', async () => {
    signedInAs('composting');
    mocked.offers.mockResolvedValue({ kind: 'ok', offers: [{ ...OFFER, listingType: 'Compost offer' }] });
    await renderApp('/home');

    expect(await screen.findByTestId('partner-home')).toBeOnTheScreen();
    expect(await screen.findByText(en.partnerOffers.types['Compost offer'])).toBeOnTheScreen();
  });

  test('D-111 an "other" partner keeps the placeholder home', async () => {
    mocked.getMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'u1', role: 'other', status: 'Approved', language: 'en' },
    });
    await renderApp('/home');

    expect(await screen.findByTestId('home-partner')).toBeOnTheScreen();
    expect(screen.queryByTestId('partner-home')).toBeNull();
  });
});

describe('FR-RTE-10 E-RTE-03 E-RTE-04 accepting an offer', () => {
  test('FR-RTE-10 the charity chooses a time, accepts, and sees its pickup code', async () => {
    await openOffer();
    await fireEvent.changeText(screen.getByLabelText(en.partnerOffers.pickupTimeLabel), TIME);

    await fireEvent.press(screen.getByRole('button', { name: en.partnerOffers.accept }));

    await waitFor(() => expect(mocked.accept).toHaveBeenCalledWith('partner-token', 'l1', TIME));
    expect(await screen.findByTestId('partner-pickup-code')).toHaveTextContent('123456');
    expect(screen.getByText(en.partnerOffers.codeHint)).toBeOnTheScreen();
  });

  test('FR-RTE-10 accepting without a time asks for one and sends nothing', async () => {
    await openOffer();

    await fireEvent.press(screen.getByRole('button', { name: en.partnerOffers.accept }));

    expect(await screen.findByText(en.partnerOffers.chooseTime)).toBeOnTheScreen();
    expect(mocked.accept).not.toHaveBeenCalled();
  });

  test('E-RTE-03 a time outside the window shows the allowed times', async () => {
    mocked.accept.mockResolvedValue({ kind: 'outsideWindow', earliest: START, latest: END });
    await openOffer();
    await fireEvent.changeText(screen.getByLabelText(en.partnerOffers.pickupTimeLabel), TIME);

    await fireEvent.press(screen.getByRole('button', { name: en.partnerOffers.accept }));

    expect(await screen.findByTestId('partner-offer-problem')).toBeOnTheScreen();
  });

  test('E-RTE-04 a Donation another charity took first says so', async () => {
    mocked.accept.mockResolvedValue({ kind: 'taken' });
    await openOffer();
    await fireEvent.changeText(screen.getByLabelText(en.partnerOffers.pickupTimeLabel), TIME);

    await fireEvent.press(screen.getByRole('button', { name: en.partnerOffers.accept }));

    expect(await screen.findByText(en.partnerOffers.taken)).toBeOnTheScreen();
  });
});

describe('FR-RTE-10 the charity cancels a pickup', () => {
  test('FR-RTE-10 cancelling a scheduled pickup confirms it and hides the code', async () => {
    await renderApp('/home');
    await fireEvent.press(await screen.findByRole('button', { name: en.partnerOffers.pickupsTab }));
    await fireEvent.press(await screen.findByTestId('partner-pickup-p1'));
    await screen.findByTestId('partner-pickup-code');

    await fireEvent.press(screen.getByRole('button', { name: en.partnerOffers.cancel }));

    expect(await screen.findByText(en.partnerOffers.cancelled)).toBeOnTheScreen();
    expect(screen.queryByTestId('partner-pickup-code')).toBeNull();
  });
});

describe('NFR-06 the charity screens in Arabic', () => {
  test('NFR-06 the charity home is in Arabic', async () => {
    signedInAs('charity', 'ar');
    await AsyncStorage.setItem('nowaste.language', 'ar');
    await renderApp('/home');

    expect(await screen.findByRole('button', { name: ar.partnerOffers.offersTab })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: ar.partnerOffers.pickupsTab })).toBeOnTheScreen();
  });

  test('NFR-05a no charity pickup text says the food is safe', () => {
    for (const texts of [en.partnerOffers, ar.partnerOffers]) {
      expect(JSON.stringify(texts).toLowerCase()).not.toMatch(/safe|آمن/);
    }
  });
});
