// US-27 pay by card (FR-RES-02, E-RES-01, E-RES-02, NFR-10), decision D-99: "Pay by card" on the offer page opens a
// card form (8-digit number, MM/YY, CVV). The card goes only to the pretend bank, which answers with a one-time token;
// the reservation is made with that token. An approved payment opens the reservation at once with the pickup code
// (no timer, no "I'm on my way"); a failure says why and nothing is reserved. Arabic and English, RTL (NFR-06).
// The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen } from 'expo-router/testing-library';
import {
  createCardToken,
  getMe,
  getNearbyOffers,
  getOffer,
  getReservation,
  reserveByCard,
  type Offer,
  type Reservation,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  getNotifications: jest.fn().mockResolvedValue({ kind: 'ok', notifications: [], unreadCount: 0 }),
  readNotifications: jest.fn().mockResolvedValue(true),
  getMyWaitlist: jest.fn().mockResolvedValue({ kind: 'ok', entries: [] }),
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getNearbyOffers: jest.fn(),
  getOffer: jest.fn(),
  getCategoryHours: jest.fn().mockResolvedValue({
    kind: 'ok',
    hours: { highlyPerishableMaxHours: 6, shortLifeMaxHours: 48 },
  }),
  downloadListingPhoto: jest.fn().mockResolvedValue(null),
  getNoShowStanding: jest.fn().mockResolvedValue({ kind: 'unexpected' }),
  createCardToken: jest.fn(),
  reserveByCard: jest.fn(),
  getReservation: jest.fn(),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 30.0381, longitude: 31.2122 } }),
  Accuracy: { Balanced: 3 },
}));

const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;
const mocked = {
  getMe: jest.mocked(getMe),
  nearby: jest.mocked(getNearbyOffers),
  offer: jest.mocked(getOffer),
  token: jest.mocked(createCardToken),
  pay: jest.mocked(reserveByCard),
  reservation: jest.mocked(getReservation),
};

const OFFER: Offer = {
  id: 'l1',
  nameAr: null,
  nameEn: 'Koshari',
  descriptionAr: null,
  descriptionEn: 'Fresh koshari',
  sourceLanguage: 'en',
  foodType: 'Koshari',
  foodCategory: 'cooked_meals',
  isQuickPost: false,
  bagsAvailable: 2,
  originalValue: 100,
  price: 40,
  pickupStart: '2026-11-01T11:00:00.000Z',
  pickupEnd: '2026-11-01T13:00:00.000Z',
  distanceMeters: null,
  pickupSlots: ['2026-11-01T11:00:00.000Z'],
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

const CONFIRMED: Reservation = {
  id: 'r9',
  method: 'card',
  status: 'Confirmed',
  holdExpiresAt: null,
  slotStart: null,
  checkedIn: false,
  pickupCode: '731904',
  createdAt: '2026-11-01T10:00:00.000Z',
  listing: {
    id: 'l1',
    nameAr: null,
    nameEn: 'Koshari',
    sourceLanguage: 'en',
    price: 40,
    pickupStart: OFFER.pickupStart,
    pickupEnd: OFFER.pickupEnd,
    shopName: 'Fatma Bakery',
    address: '12 Tahrir Street, Dokki',
  },
};

let nowSpy: jest.SpyInstance<number, []>;

beforeEach(async () => {
  nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-01T10:00:00.000Z'));
  await AsyncStorage.clear();
  store.clear();
  store.set(TOKEN_KEY, 'consumer-token');
  for (const fn of Object.values(mocked)) fn.mockReset();
  mocked.getMe.mockResolvedValue({
    kind: 'ok',
    user: { id: 'c1', role: 'consumer', status: 'Active', language: 'en' },
  });
  mocked.nearby.mockResolvedValue({
    kind: 'ok',
    radius: { km: 10, defaultKm: 10, minKm: 1, maxKm: 50, stepKm: 1 },
    offers: [{ ...OFFER, distanceMeters: 800 }],
  });
  mocked.offer.mockResolvedValue({ kind: 'ok', offer: OFFER });
  mocked.token.mockResolvedValue({ kind: 'ok', token: 'tok-1' });
  mocked.pay.mockResolvedValue({ kind: 'ok', reservation: CONFIRMED });
  mocked.reservation.mockResolvedValue({ kind: 'ok', reservation: CONFIRMED });
});

afterEach(() => {
  nowSpy.mockRestore();
});

async function openCardForm() {
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('offer-l1'));
  await fireEvent.press(await screen.findByTestId('offer-pay-card'));
  return screen.findByTestId('card-form');
}

async function typeCard(card = { number: '40000000', expiry: '12/30', cvv: '123' }) {
  await fireEvent.changeText(screen.getByTestId('card-number'), card.number);
  await fireEvent.changeText(screen.getByTestId('card-expiry'), card.expiry);
  await fireEvent.changeText(screen.getByTestId('card-cvv'), card.cvv);
}

describe('FR-RES-02 D-99 pay by card', () => {
  test('FR-RES-02 the offer page has "Pay by card", which opens the card form with the price', async () => {
    await openCardForm();

    expect(screen.getByText('Card number (8 digits)')).toBeOnTheScreen();
    expect(screen.getByText('Expiry (MM/YY)')).toBeOnTheScreen();
    expect(screen.getByText('CVV')).toBeOnTheScreen();
    expect(screen.getByTestId('card-pay')).toHaveTextContent(/Pay 40/);
    expect(screen.getByText('Paying by card holds your bag for the whole pickup time.')).toBeOnTheScreen();
  });

  test('NFR-10 IF-SW-02 the card goes to the bank, and only the bank token is sent with the reservation', async () => {
    await openCardForm();
    await typeCard();

    await fireEvent.press(screen.getByTestId('card-pay'));

    expect(mocked.token).toHaveBeenCalledWith('consumer-token', {
      number: '40000000',
      expiry: '12/30',
      cvv: '123',
    });
    expect(mocked.pay).toHaveBeenCalledWith('consumer-token', 'l1', 'tok-1', expect.any(String));
    expect(JSON.stringify(mocked.pay.mock.calls)).not.toContain('40000000');
  });

  test('FR-RES-02 an approved payment opens the reservation with the pickup code, without a timer or check-in', async () => {
    await openCardForm();
    await typeCard();

    await fireEvent.press(screen.getByTestId('card-pay'));

    expect(await screen.findByTestId('reservation-details')).toBeOnTheScreen();
    expect(screen.getByTestId('reservation-code')).toHaveTextContent('731904');
    expect(screen.getByText('Confirmed')).toBeOnTheScreen();
    expect(screen.getByText('Paid by card. Your bag is held for the whole pickup time.')).toBeOnTheScreen();
    expect(screen.queryByText(/Time left to collect/)).toBeNull();
    expect(screen.queryByTestId('reservation-checkin')).toBeNull();
  });

  test('E-RES-01 a badly typed card is marked field by field and nothing is sent', async () => {
    await openCardForm();
    await typeCard({ number: '1234', expiry: '13/30', cvv: '1' });

    await fireEvent.press(screen.getByTestId('card-pay'));

    expect(screen.getByText('Enter the 8-digit card number.')).toBeOnTheScreen();
    expect(screen.getByText('Enter the expiry as MM/YY.')).toBeOnTheScreen();
    expect(screen.getByText('Enter the 3-digit CVV.')).toBeOnTheScreen();
    expect(mocked.token).not.toHaveBeenCalled();
    expect(mocked.pay).not.toHaveBeenCalled();
  });

  test.each([
    ['unknown_card', 'This card was not found. Check the number.'],
    ['wrong_details', 'The expiry date or CVV is not correct.'],
    ['expired_card', 'This card has expired.'],
    ['declined', 'Your bank declined this card.'],
    ['insufficient_funds', 'There is not enough money on this card.'],
    ['timeout', 'The bank did not answer in time, so the payment did not go through. Please try again.'],
    ['invalid_token', 'The payment could not be completed. Please enter the card again.'],
  ] as const)('E-RES-01 a failed payment (%s) says why and stays on the form', async (reason, message) => {
    mocked.pay.mockResolvedValue({ kind: 'paymentFailed', reason });
    await openCardForm();
    await typeCard();

    await fireEvent.press(screen.getByTestId('card-pay'));

    expect(await screen.findByText(message)).toBeOnTheScreen();
    expect(screen.getByTestId('card-form')).toBeOnTheScreen();
  });

  test('E-RES-02 when the last bag was taken while paying, the customer is told so', async () => {
    mocked.pay.mockResolvedValue({ kind: 'soldOut' });
    await openCardForm();
    await typeCard();

    await fireEvent.press(screen.getByTestId('card-pay'));

    expect(
      await screen.findByText('Sorry, the last bag was just reserved by someone else.'),
    ).toBeOnTheScreen();
  });

  test('NFR-06 the card form is in Arabic, right-to-left', async () => {
    await AsyncStorage.setItem('nowaste.language', 'ar');
    mocked.getMe.mockResolvedValue({
      kind: 'ok',
      user: { id: 'c1', role: 'consumer', status: 'Active', language: 'ar' },
    });

    const form = await openCardForm();

    expect(form).toHaveStyle({ direction: 'rtl' });
    expect(screen.getByText('رقم البطاقة (٨ أرقام)')).toBeOnTheScreen();
  });
});
