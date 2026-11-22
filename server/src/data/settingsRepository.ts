// C-27 Data Access: the settings table (SDD 4.2). Rule values (SRS 5.5) are read from here,
// never from constants in code.
import { getPool } from './db.js';

export interface SettingRow {
  key: string;
  value: unknown;
  description: string | null;
  source: string | null;
}

export async function getSetting(key: string): Promise<SettingRow | undefined> {
  const result = await getPool().query<SettingRow>(
    'SELECT key, value, description, source FROM settings WHERE key = $1',
    [key],
  );
  return result.rows[0];
}

/** Replaces the value of one settings row; false when the row does not exist. */
export async function setSettingValue(key: string, value: unknown): Promise<boolean> {
  const result = await getPool().query('UPDATE settings SET value = $2 WHERE key = $1', [
    key,
    JSON.stringify(value),
  ]);
  return (result.rowCount ?? 0) > 0;
}
