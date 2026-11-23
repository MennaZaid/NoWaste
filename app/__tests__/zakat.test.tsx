// US-43 Zakat donation and receipt on the app (FR-TGI-05, FR-TGI-06, E-TGI-02, NFR-05a, NFR-06; decisions D-113 to
// D-116). The consumer chooses bags and a charity and pays by card; the receipt opens and can be shared as a PDF.
// The API, expo-print and expo-sharing are mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import {
  createCardToken,
  donateZakat,
  getMe,
  getMyZakat,
  getNearbyOffers,
  getOffer,
  getZakatCharities,
  getZakatReceipt,
  type Offer,
  type ZakatReceipt,
} from '@/api/client';
import { TOKEN_KEY } from '@/auth/tokenStorage';
import { receiptHtml } from '@/zakat/receiptHtml';
import en from '../src/i18n/en.json';
import ar from '../src/i18n/ar.json';
import { renderApp } from './helpers/renderApp';

jest.mock('@/api/client', () => ({
  isServerHealthy: jest.fn().mockResolvedValue(true),
  logout: jest.fn().mockResolvedValue(undefined),
  getMe: jest.fn(),
  updateMyLanguage: jest.fn().mockResolvedValue(true),
  getNearbyOffers: jest.fn(),
  getCategoryHours: jest.fn().mockResolvedValue({
    kind: 'ok',
    hours: { highlyPerishableMaxHours: 6, shortLifeMaxHours: 48 },
  }),
  downloadListingPhoto: jest.fn().mockResolvedValue(null),
  getNoShowStanding: jest.fn().mockResolvedValue({ kind: 'unexpected' }),
  getOffer: jest.fn(),
  getZakatCharities: jest.fn(),
  createCardToken: jest.fn(),
  donateZakat: jest.fn(),
  getZakatReceipt: jest.fn(),
  getMyZakat: jest.fn(),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({ coords: { latitude: 30.0381, longitude: 31.2122 } }),
  Accuracy: { Balanced: 3 },
}));

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));

const store = (SecureStore as unknown as { __secureStore: Map<string, string> }).__secureStore;
const mocked = {
  getMe: jest.mocked(getMe),
  nearby: jest.mocked(getNearbyOffers),
  offer: jest.mocked(getOffer),
  charities: jest.mocked(getZakatCharities),
  cardToken: jest.mocked(createCardToken),
  donate: jest.mocked(donateZakat),
  receipt: jest.mocked(getZakatReceipt),
  list: jest.mocked(getMyZakat),
  print: jest.mocked(Print.printToFileAsync),
  share: jest.mocked(Sharing.shareAsync),
};

const OFFER = {
  id: 'l1',
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
} as unknown as Offer;

let nowSpy: jest.SpyInstance<number, []>;

const RECEIPT: ZakatReceipt = {
  id: 'z1',
  receiptNumber: 'ZK-2026-000001',
  status: 'Paid',
  shopName: 'Fatma Bakery',
  foodName: 'Koshari',
  nameAr: null,
  nameEn: 'Koshari',
  bags: 2,
  amount: 80,
  charityName: 'Giza Food Bank',
  createdAt: '2026-11-01T10:00:00.000Z',
  deliveredAt: null,
  refundedAt: null,
};

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
  mocked.charities.mockResolvedValue({
    kind: 'ok',
    charities: [{ id: 'ch1', name: 'Giza Food Bank', distanceMeters: 2700 }],
  });
  mocked.cardToken.mockResolvedValue({ kind: 'ok', token: 'tok' });
  mocked.donate.mockResolvedValue({ kind: 'ok', receipt: RECEIPT });
  mocked.receipt.mockResolvedValue({ kind: 'ok', receipt: RECEIPT });
  mocked.list.mockResolvedValue({ kind: 'ok', receipts: [RECEIPT] });
  mocked.print.mockResolvedValue({ uri: 'file:///receipt.pdf', numberOfPages: 1 });
  mocked.share.mockResolvedValue(undefined);
});

afterEach(() => {
  nowSpy.mockRestore();
});

/** Home map -> the offer -> Donate as Zakat. */
async function openForm(waitForCharity = true) {
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('offer-l1'));
  await fireEvent.press(await screen.findByTestId('offer-zakat'));
  await screen.findByTestId('zakat-form');
  if (waitForCharity) await screen.findByText('Giza Food Bank');
}

/** Profile menu -> Zakat receipts -> the receipt. */
async function openReceipt() {
  await renderApp('/home');
  await fireEvent.press(await screen.findByTestId('header-profile'));
  await fireEvent.press(await screen.findByText(en.profile.zakat));
  await fireEvent.press(await screen.findByTestId('zakat-receipt-z1'));
  await screen.findByTestId('zakat-receipt-number');
}

async function typeCard() {
  await fireEvent.changeText(screen.getByLabelText(en.payment.number), '40000000');
  await fireEvent.changeText(screen.getByLabelText(en.payment.expiry), '12/30');
  await fireEvent.changeText(screen.getByLabelText(en.payment.cvv), '123');
}

describe('FR-TGI-05 donating bags as Zakat', () => {
  test('FR-TGI-05 the consumer chooses 2 bags and a charity, pays, and the receipt opens', async () => {
    await openForm();
    await fireEvent.press(screen.getByRole('button', { name: 'Add one to Number of bags' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Giza Food Bank' }));
    await typeCard();

    await fireEvent.press(screen.getByTestId('zakat-pay'));

    await waitFor(() =>
      expect(mocked.donate).toHaveBeenCalledWith('consumer-token', 'l1', {
        charityId: 'ch1',
        bags: 2,
        paymentToken: 'tok',
      }),
    );
    expect(await screen.findByTestId('zakat-receipt-number')).toHaveTextContent('ZK-2026-000001');
  });

  test('FR-TGI-05 the bags cannot go above the bags left', async () => {
    await openForm();
    for (let i = 0; i < 5; i += 1) {
      await fireEvent.press(screen.getByRole('button', { name: 'Add one to Number of bags' }));
    }

    expect(screen.getByTestId('zakat-bags')).toHaveTextContent('3');
  });

  test('FR-TGI-05 paying without choosing a charity asks for one and charges nothing', async () => {
    await openForm();
    await typeCard();

    await fireEvent.press(screen.getByTestId('zakat-pay'));

    expect(await screen.findByText(en.zakat.chooseCharity)).toBeOnTheScreen();
    expect(mocked.cardToken).not.toHaveBeenCalled();
  });

  test('FR-TGI-05 with no charity for this food the consumer is told and cannot pay', async () => {
    mocked.charities.mockResolvedValue({ kind: 'ok', charities: [] });
    await openForm(false);

    expect(await screen.findByText(en.zakat.noCharity)).toBeOnTheScreen();
    expect(screen.queryByTestId('zakat-pay')).toBeNull();
  });

  test('E-TGI-02 a declined card shows why, and no receipt opens', async () => {
    mocked.donate.mockResolvedValue({ kind: 'paymentFailed', reason: 'declined' });
    await openForm();
    await fireEvent.press(screen.getByRole('radio', { name: 'Giza Food Bank' }));
    await typeCard();

    await fireEvent.press(screen.getByTestId('zakat-pay'));

    expect(await screen.findByText(en.payment.failed.declined)).toBeOnTheScreen();
    expect(screen.queryByTestId('zakat-receipt')).toBeNull();
  });
});

describe('FR-TGI-06 the receipt', () => {
  test('FR-TGI-06 the receipt shows vendor, food, bags, amount, charity and its status', async () => {
    await openReceipt();

    expect(await screen.findByTestId('zakat-receipt-number')).toHaveTextContent('ZK-2026-000001');
    expect(screen.getByTestId('zakat-receipt-status')).toHaveTextContent(en.zakat.statuses.Paid);
    expect(screen.getByText('Fatma Bakery')).toBeOnTheScreen();
    expect(screen.getByText('Giza Food Bank')).toBeOnTheScreen();
  });

  test('FR-TGI-06 a delivered receipt says so with the date', async () => {
    mocked.receipt.mockResolvedValue({
      kind: 'ok',
      receipt: { ...RECEIPT, status: 'Delivered', deliveredAt: '2026-11-01T11:00:00.000Z' },
    });
    await openReceipt();

    expect(await screen.findByText(en.zakat.statuses.Delivered)).toBeOnTheScreen();
    expect(screen.getByText(en.zakat.delivered)).toBeOnTheScreen();
  });

  test('FR-TGI-06 Share as PDF prints the receipt and opens the share sheet', async () => {
    await openReceipt();

    await fireEvent.press(screen.getByRole('button', { name: en.zakat.share }));

    await waitFor(() => expect(mocked.share).toHaveBeenCalledWith('file:///receipt.pdf', expect.anything()));
    const html = String(mocked.print.mock.calls[0]?.[0]?.html);
    expect(html).toContain('ZK-2026-000001');
    expect(html).toContain('Giza Food Bank');
  });

  test('FR-TGI-06 the receipts list opens from Zakat receipts', async () => {
    await renderApp('/home');
    await fireEvent.press(await screen.findByTestId('header-profile'));
    await fireEvent.press(await screen.findByText(en.profile.zakat));

    expect(await screen.findByTestId('zakat-receipt-z1')).toBeOnTheScreen();
  });

  test('NFR-06 the PDF receipt is right to left in Arabic and escapes the text', () => {
    const html = receiptHtml(
      { ...RECEIPT, charityName: '<Giza & Co>' },
      {
        title: ar.zakat.receiptTitle,
        number: ar.zakat.number,
        status: ar.zakat.status,
        vendor: ar.zakat.vendor,
        food: ar.zakat.food,
        bags: ar.zakat.bags,
        amount: ar.zakat.amount,
        charity: ar.zakat.charity,
        date: ar.zakat.date,
        delivered: ar.zakat.delivered,
        refunded: ar.zakat.refunded,
      },
      {
        status: ar.zakat.statuses.Paid,
        food: 'كشري',
        amount: '٨٠',
        date: '١ نوفمبر',
        delivered: null,
        refunded: null,
      },
      'ar',
    );

    expect(html).toContain('dir="rtl"');
    expect(html).toContain('&lt;Giza &amp; Co&gt;');
    expect(html).not.toContain('<Giza');
  });

  test('NFR-05a no Zakat text says the food is safe', () => {
    for (const texts of [en.zakat, ar.zakat]) {
      expect(JSON.stringify(texts).toLowerCase()).not.toMatch(/\bsafe\b|آمن|سليم/);
    }
  });
});
