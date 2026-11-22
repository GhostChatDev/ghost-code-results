import { Pool, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var tallyroomPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env.local and set your PostgreSQL connection.");
  }
  if (!global.tallyroomPool) {
    global.tallyroomPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 8,
      idleTimeoutMillis: 30_000,
    });
  }
  return global.tallyroomPool;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}

export function databaseError(error: unknown): Error {
  if (error instanceof Error) {
    const databaseMessage = (error as Error & { detail?: string }).detail;
    return new Error(databaseMessage || error.message);
  }
  return new Error("The database request could not be completed");
}
