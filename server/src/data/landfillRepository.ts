// C-27 Data Access: landfill records (SDD 4.2 LandfillRecord, US-25, FR-RTE-13, decision D-117).
import { getPool } from './db.js';

export interface LandfillRecord {
  bags: number;
  recordedAt: Date;
}

export type RecordLandfillResult =
  | { kind: 'recorded'; record: LandfillRecord }
  | { kind: 'alreadyRecorded' }
  | { kind: 'takenByPartner' }
  | { kind: 'nothingLeft' };

/** The landfill record of a listing, or undefined. */
export async function findLandfillRecord(listingId: string): Promise<LandfillRecord | undefined> {
  const result = await getPool().query<LandfillRecord>(
    'SELECT bags, recorded_at AS "recordedAt" FROM landfill_records WHERE listing_id = $1',
    [listingId],
  );
  return result.rows[0];
}

/**
 * FR-RTE-13: records the bags nobody took (bags_available) as landfill, once. The listing row is locked, so a charity
 * accepting it at the same moment and a second record cannot both happen.
 */
export async function recordLandfill(listingId: string, now: Date): Promise<RecordLandfillResult> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query<{ bagsAvailable: number }>(
      'SELECT bags_available AS "bagsAvailable" FROM listings WHERE id = $1 FOR UPDATE',
      [listingId],
    );
    const bags = locked.rows[0]?.bagsAvailable ?? 0;
    const existing = await client.query('SELECT 1 FROM landfill_records WHERE listing_id = $1', [listingId]);
    const partner = await client.query(
      `SELECT 1 FROM partner_offers WHERE listing_id = $1 AND status IN ('Accepted', 'Completed')`,
      [listingId],
    );
    let outcome: RecordLandfillResult;
    if (existing.rowCount !== 0) outcome = { kind: 'alreadyRecorded' };
    else if (partner.rowCount !== 0) outcome = { kind: 'takenByPartner' };
    else if (bags <= 0) outcome = { kind: 'nothingLeft' };
    else {
      const inserted = await client.query<LandfillRecord>(
        `INSERT INTO landfill_records (listing_id, bags, recorded_at) VALUES ($1, $2, $3)
         RETURNING bags, recorded_at AS "recordedAt"`,
        [listingId, bags, now],
      );
      outcome = { kind: 'recorded', record: inserted.rows[0] as LandfillRecord };
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
