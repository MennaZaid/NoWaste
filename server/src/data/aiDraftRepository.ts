// C-27 Data Access: the AI draft kept for each uploaded photo (US-12, NFR-05b, NFR-05d).
import { getPool } from './db.js';

export async function saveAiDraft(photoKey: string, result: unknown): Promise<void> {
  await getPool().query(
    `INSERT INTO ai_drafts (photo_key, result) VALUES ($1, $2)
     ON CONFLICT (photo_key) DO UPDATE SET result = EXCLUDED.result, created_at = now()`,
    [photoKey, JSON.stringify(result)],
  );
}

export async function findAiDraft(photoKey: string): Promise<unknown> {
  const result = await getPool().query<{ result: unknown }>(
    'SELECT result FROM ai_drafts WHERE photo_key = $1',
    [photoKey],
  );
  return result.rows[0]?.result;
}
