// C-14 Zakat & Receipt Service, IZakat (SDD 3.2.1): donate(listingId, consumerId, charityId), markDelivered,
// refundUncollected. US-43 (FR-TGI-05, FR-TGI-06, E-TGI-02, E-TGI-03, BR-11), decisions D-113 to D-116.
// The consumer pays by card for 1 to N bags of a consumer listing (D-116) and chooses a charity that accepts the food
// type; the bags become a Donation offered only to that charity (D-113), who schedules and collects it through the
// US-22 flow. The receipt (D-114) is Paid, then Delivered when the vendor enters the charity's code, or Refunded in full
// by the worker when the pickup window ends without collection (D-115).
import { clock } from '../../domain/clock.js';
import { SrsError } from '../../domain/errors.js';
import {
  confirmZakat,
  findCharitiesFor,
  findReceipt,
  findUncollectedZakat,
  isZakatOffer,
  listReceipts,
  markZakatRefunded,
  takeBagsForZakat,
  undoZakat,
  type ReceiptRecord,
} from '../../data/zakatRepository.js';
import { chargeCard, refundCard } from '../payment/paymentService.js';
import { radiusMeters } from '../routing/routingService.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = () => new SrsError(404, { error: 'not_found' });

export interface ReceiptView {
  id: string;
  receiptNumber: string;
  status: ReceiptRecord['status'];
  shopName: string;
  /** The food as the vendor named it (D-66); `nameAr` / `nameEn` let the app show it in the reader's language. */
  foodName: string;
  nameAr: string | null;
  nameEn: string | null;
  bags: number;
  amount: number;
  charityName: string;
  createdAt: string;
  deliveredAt: string | null;
  refundedAt: string | null;
}

function receiptView(receipt: ReceiptRecord): ReceiptView {
  return {
    id: receipt.id,
    receiptNumber: receipt.receiptNumber,
    status: receipt.status,
    shopName: receipt.shopName,
    foodName: receipt.nameEn ?? receipt.nameAr ?? receipt.foodType ?? '',
    nameAr: receipt.nameAr,
    nameEn: receipt.nameEn,
    bags: receipt.bags,
    amount: receipt.amount,
    charityName: receipt.charityName,
    createdAt: receipt.createdAt.toISOString(),
    deliveredAt: receipt.deliveredAt?.toISOString() ?? null,
    refundedAt: receipt.refundedAt?.toISOString() ?? null,
  };
}

/** GET /listings/nearby/:id/charities: the charities the consumer can choose for this offer (FR-TGI-05). */
export async function listCharities(
  listingId: string,
): Promise<{ charities: { id: string; name: string; distanceMeters: number }[] }> {
  if (!UUID.test(listingId) || !(await isZakatOffer(listingId, clock.now()))) throw notFound();
  const charities = await findCharitiesFor(listingId, await radiusMeters());
  return { charities: charities.map((c) => ({ ...c, distanceMeters: Math.round(c.distanceMeters) })) };
}

/**
 * POST /listings/nearby/:id/zakat {charityId, bags, paymentToken}: takes the bags, charges bags x price to the card
 * and issues the receipt (201). E-TGI-02: a failed payment gives 402 with the reason and keeps nothing.
 */
export async function donate(
  consumerId: string,
  listingId: string,
  input: { charityId?: unknown; bags?: unknown; paymentToken?: unknown },
): Promise<ReceiptView> {
  if (!UUID.test(listingId)) throw notFound();
  const fields: string[] = [];
  if (typeof input.bags !== 'number' || !Number.isInteger(input.bags) || input.bags < 1) fields.push('bags');
  if (typeof input.paymentToken !== 'string' || input.paymentToken.trim() === '') fields.push('paymentToken');
  if (typeof input.charityId !== 'string' || !UUID.test(input.charityId)) fields.push('charityId');
  if (fields.length > 0) throw new SrsError(400, { error: 'invalid_input', fields });
  const bags = input.bags as number;
  const charityId = input.charityId as string;

  const now = clock.now();
  if (!(await isZakatOffer(listingId, now))) throw notFound();
  const charities = await findCharitiesFor(listingId, await radiusMeters());
  if (!charities.some((c) => c.id === charityId)) {
    throw new SrsError(400, { error: 'invalid_input', fields: ['charityId'] });
  }

  const taken = await takeBagsForZakat({ listingId, consumerId, charityId, bags, now });
  if (taken.kind === 'notFound') throw notFound();
  if (taken.kind === 'notEnoughBags') {
    throw new SrsError(409, { error: 'E-RES-02', bagsAvailable: taken.bagsAvailable });
  }
  const payment = await chargeCard(taken.amount, input.paymentToken as string);
  if (!payment.approved) {
    await undoZakat(taken.zakatId, clock.now());
    throw new SrsError(402, { error: 'E-TGI-02', reason: payment.reason });
  }
  await confirmZakat(taken.zakatId, payment.reference, now);
  const receipt = await findReceipt(taken.zakatId);
  if (receipt === undefined) throw new Error('Zakat receipt not found after payment');
  return receiptView(receipt);
}

/** GET /zakat: the consumer's receipts, the newest first. */
export async function myReceipts(consumerId: string): Promise<{ receipts: ReceiptView[] }> {
  return { receipts: (await listReceipts(consumerId)).map(receiptView) };
}

/** GET /zakat/:id: the receipt, for the consumer who paid or the charity it was given to (FR-TGI-06). */
export async function getReceipt(userId: string, id: string): Promise<ReceiptView> {
  const receipt = UUID.test(id) ? await findReceipt(id) : undefined;
  if (receipt === undefined || (receipt.consumerId !== userId && receipt.charityId !== userId))
    throw notFound();
  return receiptView(receipt);
}

/** Worker job (E-TGI-03, BR-11): refunds Paid donations whose pickup window ended; returns how many. */
export async function refundUncollectedZakat(now: Date = clock.now()): Promise<number> {
  let refunded = 0;
  for (const donation of await findUncollectedZakat(now)) {
    if (!(await refundCard(donation.reference, donation.amount))) continue;
    if (await markZakatRefunded(donation.id, now)) refunded += 1;
  }
  return refunded;
}
