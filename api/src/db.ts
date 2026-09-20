import fs from 'node:fs';
import path from 'node:path';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

// Attempt to load .env file if running locally or in dev scripts
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'api/.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../.env'),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    try {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(envPath);
      }
      break;
    } catch {
      // Ignore errors loading .env in non-local environments
    }
  }
}

const isSslEnabled = process.env.PGSSLMODE !== 'disable' && process.env.NODE_ENV !== 'test';

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
  database: process.env.DB_NAME || 'postgres',
  user: process.env.DB_USER || 'poorateeka_admin',
  password: process.env.DB_PASSWORD,
  ssl: isSslEnabled ? { rejectUnauthorized: false } : false,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

/**
 * Execute a single query on the pool.
 */
export async function query<R extends QueryResultRow = any, I extends any[] = any[]>(
  text: string,
  params?: I
): Promise<QueryResult<R>> {
  return pool.query<R>(text, params);
}

/**
 * Transaction wrapper. Automatically begins a transaction, passes the client to fn,
 * and commits on success or rolls back on any error.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  actor: string = 'api'
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (actor) {
      await client.query("SELECT set_config('app.actor', $1, true)", [actor]);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Error during transaction rollback:', rollbackError);
    }
    throw error;
  } finally {
    client.release();
  }
}
