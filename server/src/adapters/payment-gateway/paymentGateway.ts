// C-23 Payment Gateway Adapter (SDD 3.2.1, IPaymentGateway): charge(amount, token) → approved with the gateway's
// reference, or declined with a reason. Services use only IPaymentGateway (NFR-12). The real provider is open (SRS
// TBD-2); during the course payments use a sandbox only (IF-SW-07), so Sprint 2 has the pretend bank of decision D-99
// (`mock_bank` schema, docs/test-cards.md). Card details never reach NoWaste: the app sends them to the bank's card
// page (mockBankCardPage.ts) and NoWaste gets only a one-time token (NFR-10, IF-SW-02).
import { chargeToken, refundCharge } from '../../data/mockBankRepository.js';

export type DeclineReason =
  'invalid_token' | 'unknown_card' | 'wrong_details' | 'expired_card' | 'declined' | 'insufficient_funds';

export type GatewayAnswer =
  { approved: true; reference: string } | { approved: false; reason: DeclineReason };

export interface IPaymentGateway {
  /**
   * Charges the full amount (EGP) to the card behind a one-time token. May never settle when the gateway does not
   * answer; the Payment Service applies the PAYMENT-TIMEOUT limit.
   */
  charge(amount: number, token: string, now: Date): Promise<GatewayAnswer>;
  /** SDD refund(paymentId, amount): gives the amount of an approved charge back to the card (E-TGI-03, BR-11). */
  refund(reference: string, amount: number, now: Date): Promise<{ refunded: boolean }>;
}

/** The pretend bank (D-99). A card whose behaviour is `no_answer` never answers, to test the timeout. */
export function createMockBankGateway(): IPaymentGateway {
  return {
    async charge(amount, token, now) {
      const outcome = await chargeToken(token, amount, now);
      if (outcome.status === 'approved') return { approved: true, reference: outcome.reference };
      if (outcome.status === 'declined') return { approved: false, reason: outcome.reason };
      return new Promise<GatewayAnswer>(() => undefined);
    },
    async refund(reference, amount, now) {
      return { refunded: await refundCharge(reference, amount, now) };
    },
  };
}

let gateway: IPaymentGateway | undefined;

/** The gateway in use: the pretend bank until a real sandbox is chosen (TBD-2). */
export function getPaymentGateway(): IPaymentGateway {
  gateway ??= createMockBankGateway();
  return gateway;
}

/** Tests put another gateway in place, for example one that is down (NFR-12); undefined goes back to the bank. */
export function setPaymentGateway(next: IPaymentGateway | undefined): void {
  gateway = next;
}
