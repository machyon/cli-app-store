// Applies db/migrations/*.sql in name order. Each file runs once, in its own
// transaction, and is recorded in public.schema_migrations.
//
//   npm run db:migrate            apply pending migrations
//   npm run db:migrate -- --dry   list pending migrations only
import fs from "node:fs";
import path from "node:path";
import { connect, root } from "./db-client.mjs";

const dir = path.join(root, "db", "migrations");
const dry = process.argv.includes("--dry");

const client = await connect();
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name       text        PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const { rows } = await client.query("SELECT name FROM public.schema_migrations");
  const applied = new Set(rows.map((r) => r.name));
  const pending = fs
    .readdirSync(dir)
    .filter((f) => /^\d+_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .filter((f) => !applied.has(f));

  if (pending.length === 0) console.log("No pending migrations.");

  for (const file of pending) {
    if (dry) {
      console.log(`pending: ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    await client.query("BEGIN");
    try {
      // Serialise concurrent runners.
      await client.query("SELECT pg_advisory_xact_lock(hashtext('schema_migrations'))");
      await client.query(sql);
      await client.query("INSERT INTO public.schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`applied: ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`${file} failed: ${err.message}`);
    }
  }
} finally {
  await client.end();
}
