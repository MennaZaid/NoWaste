// US-28 no-card reservation on the phone (FR-RES-03, FR-RES-04, FR-RES-05, E-RES-05) and US-30 (E-RES-02):
// "Reserve without a card" on the offer page, then the reservation screen with the hold end time, the pickup code
// (FR-RES-10, D-92) and "I'm on my way". The warning before the BR-07 block shows on the offer page and after an
// expired hold. In Arabic, right-to-left (NFR-06). D-97: the customer chooses a 30-minute pickup slot; before it
// starts the screen shows the slot and when it starts, and the countdown, code and "I'm on my way" come at the slot
// start. The API is mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import {
  checkInReservation,
  getMe,
  getNearbyOffers,
  getNoShowStanding,
  getOffer,
  getReservation,
  reserveWithoutCard,
  type NoShowStanding,
  type Offer,
  type Reservation,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { formatDateTime, formatTime } from '@/listings/formatDateTime';
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
  reserveWithoutCard: jest.fn(),
  getReservation: jest.fn(),
  checkInReservation: jest.fn(),
  getNoShowStanding: jest.fn(),
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
  reserve: jest.mocked(reserveWithoutCard),
  reservation: jest.mocked(getReservation),
  checkIn: jest.mocked(checkInReservation),
  standing: jest.mocked(getNoShowStanding),
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
  // D-97: the slots the customer can still choose (from 11:00 every 30 minutes, before 13:00).
  pickupSlots: [
    '2026-11-01T11:00:00.000Z',
    '2026-11-01T11:30:00.000Z',
    '2026-11-01T12:00:00.000Z',
    '2026-11-01T12:30:00.000Z',
  ],
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

function reservation(overrides: Partial<Reservation> = {}): Reservation {
  return {
    id: 'r1',
    method: 'no-card',
    status: 'Held',
    holdExpiresAt: '2026-11-01T11:15:00.000Z',
    slotStart: '2026-11-01T11:00:00.000Z',
    checkedIn: false,
    pickupCode: '042917',
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
    ...overrides,
  };
}

const standing = (overrides: Partial<NoShowStanding> = {}): NoShowStanding => ({
  level: 'none',
  count: 0,
  leftBeforeBlock: 3,
  limit: 3,
  withinDays: 30,
  blockDays: 14,
  ...overrides,
});

async function useArabic() {
  await AsyncStorage.setItem('nowaste.language', 'ar');
  mocked.getMe.mockResolvedValue({
    kind: 'ok',
    user: { id: 'c1', role: 'consumer', status: 'Active', language: 'ar' },
  });
}

// The countdown (D-96) reads the clock: the tests run at 11:00 on the day of the offer, before the holds end.
let nowSpy: jest.SpyInstance<number, []>;

beforeEach(async () => {
  nowSpy = jest.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-11-01T11:00:00.000Z'));
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
  mocked.standing.mockResolvedValue({ kind: 'ok', standing: standing() });
  mocked.reserve.mockResolvedValue({ kind: 'ok', reservation: reservation() });
  mocked.reservation.mockResolvedValue({ kind: 'ok', reservation: reservation() });
});

/** Opens the offer from the consumer home (the map list), as a customer does. */
afterEach(() => {
  nowSpy.mockRestore();
});

async function openOffer() {
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('offer-l1'));
  return screen.findByTestId('offer-reserve');
}

/** Reserves from the offer page and waits for the reservation screen. */
async function openReservation() {
  await fireEvent.press(await openOffer());
  await screen.findByTestId('reservation-details');
}

describe('FR-RES-03 reserve without a card from the offer page', () => {
  test('FR-RES-03 the offer page has "Reserve without a card"; pressing it reserves and opens the reservation', async () => {
    await fireEvent.press(await openOffer());

    expect(mocked.reserve).toHaveBeenCalledWith(
      'consumer-token',
      'l1',
      '2026-11-01T11:00:00.000Z',
      expect.any(String),
    );
    expect(await screen.findByTestId('reservation-details')).toBeOnTheScreen();
    expect(mocked.reservation).toHaveBeenCalledWith('consumer-token', 'r1');
  });

  test('FR-RES-03 NFR-15 pressing twice sends the same idempotency key', async () => {
    mocked.reserve.mockResolvedValueOnce({ kind: 'unreachable' });
    const button = await openOffer();

    await fireEvent.press(button);
    await screen.findByTestId('offer-reserve-problem');
    await fireEvent.press(screen.getByTestId('offer-reserve'));

    const keys = mocked.reserve.mock.calls.map((call) => call[3]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  test('E-RES-02 when the last bag was just taken the customer is told so', async () => {
    mocked.reserve.mockResolvedValue({ kind: 'soldOut' });

    await fireEvent.press(await openOffer());

    expect(
      await screen.findByText('Sorry, the last bag was just reserved by someone else.'),
    ).toBeOnTheScreen();
  });

  test('FR-RES-03 D-91 a second hold on the same offer is refused with a clear message', async () => {
    mocked.reserve.mockResolvedValue({ kind: 'alreadyReserved' });

    await fireEvent.press(await openOffer());

    expect(await screen.findByText('You already have a bag of this offer on hold.')).toBeOnTheScreen();
  });

  test('BR-07 the offer page warns when one more no-show would block no-card reserving', async () => {
    mocked.standing.mockResolvedValue({
      kind: 'ok',
      standing: standing({ level: 'warning', count: 2, leftBeforeBlock: 1 }),
    });

    await openOffer();

    expect(
      await screen.findByText(
        'Warning: one more missed pickup within 30 days and you cannot reserve without a card for 14 days.',
      ),
    ).toBeOnTheScreen();
  });

  test('BR-07 with no warning level nothing about no-shows is shown on the offer page', async () => {
    mocked.standing.mockResolvedValue({
      kind: 'ok',
      standing: standing({ level: 'notice', count: 1, leftBeforeBlock: 2 }),
    });

    await openOffer();

    expect(screen.queryByTestId('offer-no-show')).toBeNull();
  });
});

describe('FR-RES-03 FR-RES-04 the reservation screen', () => {
  test('FR-RES-03 FR-RES-10 it shows the hold end time, the pickup code and "I\'m on my way"', async () => {
    await openReservation();

    expect(
      await screen.findByText(`Held for you until ${formatDateTime('2026-11-01T11:15:00.000Z', 'en')}`),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('reservation-code')).toHaveTextContent('042917');
    expect(screen.getByText('On hold')).toBeOnTheScreen();
    expect(screen.getByTestId('reservation-checkin')).toBeOnTheScreen();
  });

  // D-96 (Maryam, 2026-11-14): after the one check-in the button stays, grey and disabled, instead of going away.
  test('FR-RES-04 D-96 "I\'m on my way" extends the hold and the button turns grey and cannot be pressed again', async () => {
    mocked.checkIn.mockResolvedValue({
      kind: 'ok',
      reservation: reservation({ checkedIn: true, holdExpiresAt: '2026-11-01T11:25:00.000Z' }),
    });
    await openReservation();

    await fireEvent.press(await screen.findByTestId('reservation-checkin'));

    expect(mocked.checkIn).toHaveBeenCalledWith('consumer-token', 'r1');
    expect(
      await screen.findByText(`Held for you until ${formatDateTime('2026-11-01T11:25:00.000Z', 'en')}`),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('You checked in, so your hold was extended. You can check in only once.'),
    ).toBeOnTheScreen();
    const button = screen.getByTestId('reservation-checkin');
    expect(button).toBeDisabled();
    await fireEvent.press(button);
    expect(mocked.checkIn).toHaveBeenCalledTimes(1);
  });

  test('FR-RES-04 D-96 a reservation already checked in shows the grey button when opened again', async () => {
    mocked.reservation.mockResolvedValue({ kind: 'ok', reservation: reservation({ checkedIn: true }) });
    await openReservation();

    expect(await screen.findByTestId('reservation-checkin')).toBeDisabled();
  });

  test('FR-RES-03 D-96 a countdown shows the time left of the 15-minute hold and ticks every second', async () => {
    nowSpy.mockReturnValue(Date.parse('2026-11-01T11:00:30.000Z'));
    await openReservation();

    expect(await screen.findByText('Time left to collect: 14:30')).toBeOnTheScreen();
    nowSpy.mockReturnValue(Date.parse('2026-11-01T11:00:31.000Z'));
    expect(await screen.findByText('Time left to collect: 14:29', {}, { timeout: 2500 })).toBeOnTheScreen();
  });

  test('FR-RES-04 D-96 the check-in adds its 10 minutes to the countdown', async () => {
    nowSpy.mockReturnValue(Date.parse('2026-11-01T11:00:30.000Z'));
    mocked.checkIn.mockResolvedValue({
      kind: 'ok',
      reservation: reservation({ checkedIn: true, holdExpiresAt: '2026-11-01T11:25:00.000Z' }),
    });
    await openReservation();

    await fireEvent.press(await screen.findByTestId('reservation-checkin'));

    expect(await screen.findByText('Time left to collect: 24:30')).toBeOnTheScreen();
  });

  test('E-RES-05 a refused check-in says why and reloads the reservation', async () => {
    mocked.checkIn.mockResolvedValue({ kind: 'refused' });
    await openReservation();
    mocked.reservation.mockResolvedValue({
      kind: 'ok',
      reservation: reservation({ status: 'No-show', pickupCode: null }),
    });

    await fireEvent.press(await screen.findByTestId('reservation-checkin'));

    expect(
      await screen.findByText('Check-in is not possible: you already checked in or the hold has ended.'),
    ).toBeOnTheScreen();
    await waitFor(() => {
      expect(screen.getByText('Hold ended')).toBeOnTheScreen();
    });
  });

  test('FR-RES-05 BR-07 an expired hold says the bag went back on sale, with the no-show notice and no code', async () => {
    mocked.reservation.mockResolvedValue({
      kind: 'ok',
      reservation: reservation({ status: 'No-show', pickupCode: null }),
    });
    mocked.standing.mockResolvedValue({
      kind: 'ok',
      standing: standing({ level: 'notice', count: 1, leftBeforeBlock: 2 }),
    });

    await openReservation();

    expect(
      await screen.findByText('The hold ended before pickup, so the bag went back on sale.'),
    ).toBeOnTheScreen();
    expect(
      await screen.findByText(
        'Your reservation expired and the bag went to someone else. Missed pickups: 1 of 3 in 30 days.',
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByTestId('reservation-code')).toBeNull();
    expect(screen.queryByTestId('reservation-checkin')).toBeNull();
  });
});

describe('NFR-06 reserving in Arabic', () => {
  test('NFR-06 the offer page and the reservation screen are in Arabic, right-to-left, with Arabic-Indic digits', async () => {
    await useArabic();

    const button = await openOffer();
    expect(screen.getByText('احجز بدون بطاقة')).toBeOnTheScreen();
    await fireEvent.press(button);

    const details = await screen.findByTestId('reservation-details');
    expect(details).toHaveStyle({ direction: 'rtl' });
    expect(screen.getByText('أنا في الطريق')).toBeOnTheScreen();
    expect(screen.getByTestId('reservation-code')).toHaveTextContent('٠٤٢٩١٧');
  });
});

describe('D-97 the pickup slot', () => {
  const slot = (start: string, end: string) => `${formatTime(start, 'en')} – ${formatTime(end, 'en')}`;

  // D-98 (Maryam, 2026-11-16): the slots are chosen from a drop-down list.
  test('D-98 the offer page has a pickup time drop-down showing the first slot', async () => {
    await openOffer();

    expect(screen.getByText('Choose your pickup time')).toBeOnTheScreen();
    expect(screen.getByTestId('offer-slots')).toHaveTextContent(
      new RegExp(`^${slot('2026-11-01T11:00:00.000Z', '2026-11-01T11:30:00.000Z')}`),
    );
  });

  test('D-98 opening the drop-down lists every slot; choosing one sends it with the reservation', async () => {
    const button = await openOffer();

    await fireEvent.press(screen.getByTestId('offer-slots'));
    expect(
      await screen.findByRole('radio', {
        name: slot('2026-11-01T12:30:00.000Z', '2026-11-01T13:00:00.000Z'),
      }),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByTestId('offer-slots-option-2026-11-01T12:00:00.000Z'));

    expect(screen.getByTestId('offer-slots')).toHaveTextContent(
      new RegExp(`^${slot('2026-11-01T12:00:00.000Z', '2026-11-01T12:30:00.000Z')}`),
    );
    await fireEvent.press(button);
    expect(mocked.reserve).toHaveBeenCalledWith(
      'consumer-token',
      'l1',
      '2026-11-01T12:00:00.000Z',
      expect.any(String),
    );
  });

  test('D-97 without any slot left the Reserve button cannot be pressed', async () => {
    mocked.offer.mockResolvedValue({ kind: 'ok', offer: { ...OFFER, pickupSlots: [] } });

    expect(await openOffer()).toBeDisabled();
    expect(screen.getByText('No pickup times are left for this offer.')).toBeOnTheScreen();
  });

  test('D-97 before the slot starts: the slot time and when it starts, no timer, no code, no button', async () => {
    mocked.reservation.mockResolvedValue({
      kind: 'ok',
      reservation: reservation({
        slotStart: '2026-11-01T12:00:00.000Z',
        holdExpiresAt: '2026-11-01T12:15:00.000Z',
        pickupCode: null,
      }),
    });

    await openReservation();

    expect(
      screen.getByText(`Your pickup time starts at ${formatDateTime('2026-11-01T12:00:00.000Z', 'en')}`),
    ).toBeOnTheScreen();
    expect(screen.getByText('Starts in 1:00:00')).toBeOnTheScreen();
    expect(screen.getByText(/The timer, your pickup code and/)).toBeOnTheScreen();
    expect(screen.queryByText(/Time left to collect/)).toBeNull();
    expect(screen.queryByTestId('reservation-code')).toBeNull();
    expect(screen.queryByTestId('reservation-checkin')).toBeNull();
  });

  test('D-97 when the slot starts the reservation is loaded again and the timer, code and button appear', async () => {
    mocked.reservation.mockResolvedValue({
      kind: 'ok',
      reservation: reservation({
        slotStart: '2026-11-01T11:00:02.000Z',
        holdExpiresAt: '2026-11-01T11:15:02.000Z',
        pickupCode: null,
      }),
    });
    await openReservation();
    expect(screen.queryByTestId('reservation-code')).toBeNull();

    mocked.reservation.mockResolvedValue({
      kind: 'ok',
      reservation: reservation({
        slotStart: '2026-11-01T11:00:02.000Z',
        holdExpiresAt: '2026-11-01T11:15:02.000Z',
      }),
    });
    nowSpy.mockReturnValue(Date.parse('2026-11-01T11:00:03.000Z'));

    expect(await screen.findByTestId('reservation-code', {}, { timeout: 2500 })).toHaveTextContent('042917');
    expect(screen.getByText(/^Time left to collect: 1[45]:[0-5][0-9]$/)).toBeOnTheScreen();
    expect(screen.getByTestId('reservation-checkin')).toBeOnTheScreen();
  });
});

describe('D-102 a paid bag not collected by the pickup end', () => {
  test('D-102 the customer sees Not collected, without a code', async () => {
    mocked.reservation.mockResolvedValue({
      kind: 'ok',
      reservation: reservation({
        method: 'card',
        status: 'Not collected',
        pickupCode: null,
        holdExpiresAt: null,
      }),
    });

    await openReservation();

    expect(screen.getByText('Not collected')).toBeOnTheScreen();
    expect(screen.queryByTestId('reservation-code')).toBeNull();
    expect(screen.queryByTestId('reservation-checkin')).toBeNull();
  });
});
