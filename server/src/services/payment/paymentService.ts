// C-12 Payment Service, IPayment (SDD 3.2.1): card payments through the Payment Gateway Adapter (FR-RES-02, E-RES-01).
// It never sees or stores card data: it charges a one-time token (NFR-10). The gateway must answer within the settings
// row PAYMENT-TIMEOUT (1 minute, decision D-99), otherwise the payment counts as failed. Refunds: US-43 (Zakat, D-115);
// consumer cancellation refunds (FR-RES-12) are US-35.
import { getPaymentGateway, type DeclineReason } from '../../adapters/payment-gateway/paymentGateway.js';
import { clock } from '../../domain/clock.js';
import { getSetting } from '../../data/settingsRepository.js';

export type PaymentResult =
  { approved: true; reference: string } | { approved: false; reason: DeclineReason | 'timeout' };

/** PAYMENT-TIMEOUT in milliseconds. */
export async function paymentTimeoutMs(): Promise<number> {
  const value = (await getSetting('PAYMENT-TIMEOUT'))?.value as { seconds?: unknown } | null | undefined;
  if (typeof value?.seconds !== 'number' || !(value.seconds > 0)) {
    throw new Error('Settings row PAYMENT-TIMEOUT is missing or invalid');
  }
  return value.seconds * 1000;
}

/** Charges the full price to the card behind `token`; a gateway that does not answer in time gives `timeout`. */
export async function chargeCard(amount: number, token: string): Promise<PaymentResult> {
  const limit = await paymentTimeoutMs();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<PaymentResult>((resolve) => {
    timer = setTimeout(() => {
      resolve({ approved: false, reason: 'timeout' });
    }, limit);
  });
  try {
    return await Promise.race([getPaymentGateway().charge(amount, token, clock.now()), timeout]);
  } catch {
    // NFR-12 (found in the SCRUM-81 NFR pass, 2026-11-21): a gateway that cannot be reached at all is handled like
    // one that does not answer in time, so the pending reservation is dropped and the bag is free again (E-RES-01).
    return { approved: false, reason: 'timeout' };
  } finally {
    clearTimeout(timer);
  }
}

/** US-43 (E-TGI-03, BR-11, D-115): gives the full amount of an approved charge back. False if the bank refused. */
export async function refundCard(reference: string, amount: number): Promise<boolean> {
  try {
    return (await getPaymentGateway().refund(reference, amount, clock.now())).refunded;
  } catch {
    // The worker tries again on its next run (SDD 5.5).
    return false;
  }
}
