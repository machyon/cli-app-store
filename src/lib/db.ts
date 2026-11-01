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
