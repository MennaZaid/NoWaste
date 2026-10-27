// C-27 Data Access: the single PostgreSQL connection pool. SQL lives only in server/src/data.
import { Pool, type PoolClient } from 'pg';
import { loadConfig } from '../config/index.js';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (pool === undefined) {
    pool = new Pool({
      connectionString: loadConfig().databaseUrl,
      // Fail fast so GET /health can report "db down" instead of hanging.
      connectionTimeoutMillis: 3000,
    });
  }
  return pool;
}

/** Runs `work` in one transaction: committed if it resolves, rolled back if it throws. */
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool !== undefined) {
    const current = pool;
    pool = undefined;
    await current.end();
  }
}
