// C-27 Data Access for the pretend bank (decision D-99): the `mock_bank` schema stands in for the payment gateway's
// sandbox (SRS 2.5, IF-SW-07). It is not NoWaste data: only the pretend bank (server/src/adapters/payment-gateway)
// uses these tables. Card numbers and CVVs are compared as SHA-256 hashes; the numbers are never stored.
import { getPool } from './db.js';

export interface TypedCard {
  numberHash: string;
  cvvHash: string;
  expiryMonth: number;
  expiryYear: number;
}

/** The bank's card page: keeps what was typed (as hashes) behind a one-time token. */
export async function insertToken(card: TypedCard, now: Date): Promise<string> {
  const result = await getPool().query<{ token: string }>(
    `INSERT INTO mock_bank.tokens (number_hash, cvv_hash, expiry_month, expiry_year, created_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING token`,
    [card.numberHash, card.cvvHash, card.expiryMonth, card.expiryYear, now],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('Token was not saved');
  return row.token;
}

export type ChargeOutcome =
  | { status: 'approved'; reference: string }
  | {
      status: 'declined';
      reason:
        | 'invalid_token'
        | 'unknown_card'
        | 'wrong_details'
        | 'expired_card'
        | 'declined'
        | 'insufficient_funds';
    }
  | { status: 'no_answer' };

/**
 * Charges `amount` to the card behind a token, once: the token is used up whatever the answer. In one transaction
 * the token and the card rows are locked, so two charges never spend the same money twice.
 */
export async function chargeToken(token: string, amount: number, now: Date): Promise<ChargeOutcome> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const typed = await client.query<TypedCard & { usedAt: Date | null }>(
      `SELECT number_hash AS "numberHash", cvv_hash AS "cvvHash", expiry_month AS "expiryMonth",
              expiry_year AS "expiryYear", used_at AS "usedAt"
       FROM mock_bank.tokens WHERE token::text = $1 FOR UPDATE`,
      [token],
    );
    const entered = typed.rows[0];
    if (entered === undefined || entered.usedAt !== null) {
      await client.query('ROLLBACK');
      return { status: 'declined', reason: 'invalid_token' };
    }
    await client.query('UPDATE mock_bank.tokens SET used_at = $2 WHERE token = $1', [token, now]);

    const cards = await client.query<{
      id: number;
      cvvHash: string;
      expiryMonth: number;
      expiryYear: number;
      balance: number;
      status: string;
      behaviour: string;
    }>(
      `SELECT id, cvv_hash AS "cvvHash", expiry_month AS "expiryMonth", expiry_year AS "expiryYear",
              balance::float8 AS balance, status, behaviour
       FROM mock_bank.cards WHERE number_hash = $1 FOR UPDATE`,
      [entered.numberHash],
    );
    const card = cards.rows[0];
    let outcome: ChargeOutcome;
    if (card === undefined) outcome = { status: 'declined', reason: 'unknown_card' };
    else if (card.behaviour === 'no_answer') outcome = { status: 'no_answer' };
    else if (
      card.cvvHash !== entered.cvvHash ||
      card.expiryMonth !== entered.expiryMonth ||
      card.expiryYear !== entered.expiryYear
    ) {
      outcome = { status: 'declined', reason: 'wrong_details' };
    } else if (Date.UTC(card.expiryYear, card.expiryMonth, 1) <= now.getTime()) {
      // A card is valid until the end of its expiry month.
      outcome = { status: 'declined', reason: 'expired_card' };
    } else if (card.status !== 'active') outcome = { status: 'declined', reason: 'declined' };
    else if (card.balance < amount) outcome = { status: 'declined', reason: 'insufficient_funds' };
    else {
      await client.query('UPDATE mock_bank.cards SET balance = balance - $2 WHERE id = $1', [
        card.id,
        amount,
      ]);
      const charge = await client.query<{ reference: string }>(
        `INSERT INTO mock_bank.charges (token, amount, status, created_at) VALUES ($1, $2, 'approved', $3)
         RETURNING reference`,
        [token, amount, now],
      );
      outcome = { status: 'approved', reference: charge.rows[0]?.reference ?? '' };
    }
    if (outcome.status === 'declined') {
      await client.query(
        `INSERT INTO mock_bank.charges (token, amount, status, reason, created_at) VALUES ($1, $2, 'declined', $3, $4)`,
        [token, amount, outcome.reason, now],
      );
    }
    await client.query('COMMIT');
    return outcome;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * US-43 (E-TGI-03, BR-11): the pretend bank gives the amount of an approved charge back to the card it came from,
 * once. Returns false for an unknown or declined charge, or one already refunded.
 */
export async function refundCharge(reference: string, amount: number, now: Date): Promise<boolean> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const charge = await client.query<{ numberHash: string }>(
      `SELECT t.number_hash AS "numberHash" FROM mock_bank.charges c JOIN mock_bank.tokens t ON t.token = c.token
       WHERE c.reference::text = $1 AND c.status = 'approved' FOR UPDATE OF c`,
      [reference],
    );
    const numberHash = charge.rows[0]?.numberHash;
    if (numberHash === undefined) {
      await client.query('ROLLBACK');
      return false;
    }
    const refund = await client.query(
      `INSERT INTO mock_bank.refunds (charge_reference, amount, created_at) VALUES ($1::uuid, $2, $3)
       ON CONFLICT (charge_reference) DO NOTHING`,
      [reference, amount, now],
    );
    if ((refund.rowCount ?? 0) === 0) {
      await client.query('ROLLBACK');
      return false;
    }
    await client.query('UPDATE mock_bank.cards SET balance = balance + $2 WHERE number_hash = $1', [
      numberHash,
      amount,
    ]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
