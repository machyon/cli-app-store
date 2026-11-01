// Shared Postgres connection for CLI scripts. Same TLS rules as backend/server.mjs:
// TLS comes only from certs/ca.pem (or DATABASE_CA) and sslmode in the URL is ignored.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env"), quiet: true });

export async function connect() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set in .env");

  const url = new URL(databaseUrl);
  url.searchParams.delete("sslmode");

  const ca = process.env.DATABASE_CA
    ? process.env.DATABASE_CA.replace(/\\n/g, "\n")
    : fs.readFileSync(path.join(root, "certs", "ca.pem"), "utf8");

  const client = new pg.Client({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: { ca, rejectUnauthorized: true },
  });
  await client.connect();
  return client;
}
