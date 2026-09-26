import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "../config/env.js";
import { AppError } from "../lib/api.js";

let pool: Pool | undefined;

const getPool = (): Pool => {
  if (!env.databaseUrl) {
    throw new AppError(503, "Database is not configured");
  }
  pool ??= new Pool({
    connectionString: env.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: env.databaseUrl.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });
  return pool;
};

export const query = async <T extends QueryResultRow>(text: string, values: readonly unknown[] = []): Promise<T[]> => {
  const result = await getPool().query<T>(text, [...values]);
  return result.rows;
};

export const queryOne = async <T extends QueryResultRow>(text: string, values: readonly unknown[] = []): Promise<T | undefined> =>
  (await query<T>(text, values))[0];

export const transaction = async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const checkDatabase = async (): Promise<boolean> => {
  if (!env.databaseUrl) return false;
  try {
    await query("SELECT 1");
    return true;
  } catch {
    return false;
  }
};

export const closeDatabase = async (): Promise<void> => {
  if (pool) await pool.end();
};
