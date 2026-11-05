// C-27 Data Access: the vendor_branches table (decision D-64). The shop given at sign-up is the first branch; each
// branch has its own map pin and opening hours. A listing is picked up at one branch.
import type { PoolClient } from 'pg';
import { getPool } from './db.js';

export interface BranchRecord {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  /** "HH:MM", or null for a shop registered before opening hours were required (D-62). */
  opensAt: string | null;
  closesAt: string | null;
}

export interface NewBranch {
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  opensAt: string | null;
  closesAt: string | null;
}

const branchColumns = `id, name, address,
  ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude,
  to_char(opens_at, 'HH24:MI') AS "opensAt", to_char(closes_at, 'HH24:MI') AS "closesAt"`;

/** Inserts a branch (inside the sign-up transaction when a client is given). */
export async function insertBranch(
  vendorId: string,
  branch: NewBranch,
  client?: PoolClient,
): Promise<BranchRecord> {
  const result = await (client ?? getPool()).query<BranchRecord>(
    // clock_timestamp(), not now(): branches saved in one sign-up transaction keep their order (main branch first).
    `INSERT INTO vendor_branches (vendor_id, name, address, location, opens_at, closes_at, created_at)
     VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography, $6, $7, clock_timestamp())
     RETURNING ${branchColumns}`,
    [
      vendorId,
      branch.name,
      branch.address,
      branch.latitude,
      branch.longitude,
      branch.opensAt,
      branch.closesAt,
    ],
  );
  const row = result.rows[0];
  if (row === undefined) throw new Error('Branch was not saved');
  return row;
}

/** The vendor's branches, the first (main) one first. */
export async function findVendorBranches(vendorId: string): Promise<BranchRecord[]> {
  const result = await getPool().query<BranchRecord>(
    `SELECT ${branchColumns} FROM vendor_branches WHERE vendor_id = $1 ORDER BY created_at, id`,
    [vendorId],
  );
  return result.rows;
}

/** One branch of this vendor, or undefined (another vendor's branch is not found either). */
export async function findVendorBranch(vendorId: string, id: string): Promise<BranchRecord | undefined> {
  const result = await getPool().query<BranchRecord>(
    `SELECT ${branchColumns} FROM vendor_branches WHERE id = $1 AND vendor_id = $2`,
    [id, vendorId],
  );
  return result.rows[0];
}

/** Saves a branch's opening hours; undefined when it is not this vendor's branch. */
export async function saveBranchHours(
  vendorId: string,
  id: string,
  hours: { opensAt: string; closesAt: string },
): Promise<BranchRecord | undefined> {
  const result = await getPool().query<BranchRecord>(
    `UPDATE vendor_branches SET opens_at = $3, closes_at = $4 WHERE id = $1 AND vendor_id = $2
     RETURNING ${branchColumns}`,
    [id, vendorId, hours.opensAt, hours.closesAt],
  );
  return result.rows[0];
}
