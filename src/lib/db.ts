import "server-only";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import type { z } from "zod";

function readCa(): string {
  const fromEnv = process.env.DATABASE_CA;
  if (fromEnv) return fromEnv.replace(/\\n/g, "\n");
  return fs.readFileSync(path.join(process.cwd(), "certs", "ca.pem"), "utf8");
}

function createPool(): pg.Pool {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");

  // TLS comes only from the CA; a sslmode query param must not override it.
  const url = new URL(databaseUrl);
  url.searchParams.delete("sslmode");

  return new pg.Pool({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: { ca: readCa(), rejectUnauthorized: true },
    max: 10,
  });
}

// Reuse the pool across hot reloads in dev.
const globalForPg = globalThis as typeof globalThis & { __ttyPool?: pg.Pool };

function getPool(): pg.Pool {
  globalForPg.__ttyPool ??= createPool();
  return globalForPg.__ttyPool;
}

/** SQL expression rendering a timestamptz column as an ISO-8601 UTC string (millisecond precision). */
export const iso = (col: string): string => `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

/** Runs a parameterised query and validates every row with the given Zod schema. */
export async function query<S extends z.ZodType>(
  schema: S,
  sql: string,
  params: readonly unknown[] = [],
): Promise<z.output<S>[]> {
  const { rows } = await getPool().query<Record<string, unknown>>(sql, [...params]);
  return rows.map((row) => schema.parse(row));
}

/** Runs a statement and returns the number of affected rows. */
export async function execute(sql: string, params: readonly unknown[] = []): Promise<number> {
  const result = await getPool().query(sql, [...params]);
  return result.rowCount ?? 0;
}

/** The query helpers bound to one connection inside a transaction. */
export interface Tx {
  query<S extends z.ZodType>(schema: S, sql: string, params?: readonly unknown[]): Promise<z.output<S>[]>;
  execute(sql: string, params?: readonly unknown[]): Promise<number>;
}

/**
 * Runs `fn` inside BEGIN/COMMIT on a single pooled connection. Any thrown error
 * rolls the transaction back and is re-thrown.
 */
export async function transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  const tx: Tx = {
    async query(schema, sql, params = []) {
      const { rows } = await client.query<Record<string, unknown>>(sql, [...params]);
      return rows.map((row) => schema.parse(row));
    },
    async execute(sql, params = []) {
      const result = await client.query(sql, [...params]);
      return result.rowCount ?? 0;
    },
  };
  try {
    await client.query("BEGIN");
    const result = await fn(tx);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
