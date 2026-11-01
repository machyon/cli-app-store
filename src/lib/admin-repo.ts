import "server-only";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { ApiError } from "@/lib/api";
import { iso, query, transaction, type Tx } from "@/lib/db";
import { OsSchema } from "@/lib/schemas";
import {
  AdminAppRowSchema,
  AppInputSchema,
  LookupsSchema,
  type AdminApp,
  type AdminAppRow,
  type AppInput,
  type AppUpdate,
  type Lookups,
} from "@/lib/schemas/admin";

/* Admin reads are never cached: they must show unpublished apps and the latest
 * state. Every write runs in one transaction together with its audit row. */

export interface Actor {
  adminId: string;
  ip: string | null;
}

type Reader = Pick<Tx, "query">;
const pool: Reader = { query };

/* ---------- audit ---------- */

export async function audit(
  tx: Tx,
  entry: {
    adminId: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: Record<string, unknown>;
    ip: string | null;
  },
): Promise<void> {
  await tx.execute(
    `INSERT INTO admin_audit_log (user_id, action, target_type, target_id, details, ip)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::inet)`,
    [
      entry.adminId,
      entry.action,
      entry.targetType ?? null,
      entry.targetId ?? null,
      entry.details ? JSON.stringify(entry.details) : null,
      entry.ip,
    ],
  );
}

/* ---------- reads ---------- */

export async function listAppsAdmin(): Promise<AdminAppRow[]> {
  return query(
    AdminAppRowSchema,
    `SELECT a.id, a.slug, a.name, a.status::text AS status, c.name AS category,
            a.is_published, ${iso("a.updated_at")} AS updated_at
       FROM apps a JOIN categories c ON c.id = a.category_id
      ORDER BY a.name`,
  );
}

const CoreRowSchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  name: z.string(),
  tagline: z.string(),
  about: z.string(),
  category_id: z.number().int(),
  language_id: z.number().int().nullable(),
  status: z.enum(["stable", "beta", "experimental", "maintenance"]),
  github_owner: z.string(),
  github_repo: z.string(),
  github_url: z.string().nullable(),
  is_published: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});

async function readApp(db: Reader, id: string, lock = false): Promise<AdminApp | null> {
  const [core] = await db.query(
    CoreRowSchema,
    `SELECT id, slug, name, tagline, about, category_id, language_id, status::text AS status,
            github_owner, github_repo, github_url, is_published,
            ${iso("created_at")} AS created_at, ${iso("updated_at")} AS updated_at
       FROM apps WHERE id = $1 ${lock ? "FOR UPDATE" : ""}`,
    [id],
  );
  if (!core) return null;

  const [features, demo, os, licenses, packages] = await Promise.all([
    db.query(z.object({ body: z.string() }), `SELECT body FROM app_features WHERE app_id = $1 ORDER BY ordinal`, [id]),
    db.query(
      z.object({ content: z.string() }),
      `SELECT content FROM app_demo_lines WHERE app_id = $1 ORDER BY line_no`,
      [id],
    ),
    db.query(z.object({ os: OsSchema }), `SELECT os::text AS os FROM app_os_support WHERE app_id = $1 ORDER BY os`, [id]),
    db.query(
      z.object({ license_id: z.number().int() }),
      `SELECT license_id FROM app_licenses WHERE app_id = $1 ORDER BY license_id`,
      [id],
    ),
    db.query(
      z.object({ package_manager_id: z.number().int(), package_name: z.string(), command_override: z.string().nullable() }),
      `SELECT package_manager_id, package_name, command_override
         FROM app_packages WHERE app_id = $1 ORDER BY package_manager_id`,
      [id],
    ),
  ]);

  return {
    ...core,
    features: features.map((f) => f.body),
    demo: demo.map((d) => d.content),
    os: os.map((o) => o.os),
    license_ids: licenses.map((l) => l.license_id),
    packages,
  };
}

export const getAppForEdit = (id: string): Promise<AdminApp | null> => readApp(pool, id);

export async function getLookups(): Promise<Lookups> {
  const lookup = z.object({ id: z.number().int(), name: z.string() });
  const [categories, languages, licenses, package_managers] = await Promise.all([
    query(lookup, `SELECT id, name FROM categories ORDER BY sort_order, name`),
    query(lookup, `SELECT id, name FROM programming_languages ORDER BY name`),
    query(lookup.extend({ spdx_id: z.string() }), `SELECT id, name, spdx_id FROM licenses ORDER BY spdx_id`),
    query(
      lookup.extend({ slug: z.string(), command_template: z.string() }),
      `SELECT id, name, slug, command_template FROM package_managers ORDER BY kind, name`,
    ),
  ]);
  return LookupsSchema.parse({ categories, languages, licenses, package_managers });
}

/* ---------- writes ---------- */

const CORE_FIELDS = [
  "slug",
  "name",
  "tagline",
  "about",
  "category_id",
  "language_id",
  "status",
  "github_owner",
  "github_repo",
  "is_published",
] as const;

const coreParams = (a: AppInput): unknown[] => CORE_FIELDS.map((f) => a[f]);

/** Replaces the child collections of an app with the given ones. */
async function writeChildren(tx: Tx, appId: string, a: AppInput): Promise<void> {
  await tx.execute(`DELETE FROM app_features WHERE app_id = $1`, [appId]);
  await tx.execute(
    `INSERT INTO app_features (app_id, ordinal, body)
     SELECT $1, t.ord, t.body FROM unnest($2::text[]) WITH ORDINALITY AS t(body, ord)`,
    [appId, a.features],
  );

  await tx.execute(`DELETE FROM app_demo_lines WHERE app_id = $1`, [appId]);
  // is_prompt is a generated column (content starts with "$ ").
  await tx.execute(
    `INSERT INTO app_demo_lines (app_id, line_no, content)
     SELECT $1, t.ord, t.content FROM unnest($2::text[]) WITH ORDINALITY AS t(content, ord)`,
    [appId, a.demo],
  );

  // OS support is diffed rather than replaced: release_assets references it, so
  // removing an OS that still has assets fails with a clear 409 instead of
  // silently cascading.
  await tx.execute(`DELETE FROM app_os_support WHERE app_id = $1 AND NOT (os = ANY($2::operating_system[]))`, [
    appId,
    a.os,
  ]);
  await tx.execute(
    `INSERT INTO app_os_support (app_id, os)
     SELECT $1, unnest($2::operating_system[]) ON CONFLICT DO NOTHING`,
    [appId, a.os],
  );

  await tx.execute(`DELETE FROM app_licenses WHERE app_id = $1`, [appId]);
  await tx.execute(`INSERT INTO app_licenses (app_id, license_id) SELECT $1, unnest($2::int[])`, [
    appId,
    a.license_ids,
  ]);

  await tx.execute(`DELETE FROM app_packages WHERE app_id = $1`, [appId]);
  await tx.execute(
    `INSERT INTO app_packages (app_id, package_manager_id, package_name, command_override)
     SELECT $1, t.pm, t.name, t.cmd FROM unnest($2::int[], $3::text[], $4::text[]) AS t(pm, name, cmd)`,
    [
      appId,
      a.packages.map((p) => p.package_manager_id),
      a.packages.map((p) => p.package_name),
      a.packages.map((p) => p.command_override),
    ],
  );
}

/** Drops every cached catalog read so public pages show the change immediately. */
function invalidateCatalog(): void {
  revalidateTag("apps", { expire: 0 });
}

export async function createApp(input: AppInput, actor: Actor): Promise<{ id: string; slug: string }> {
  const created = await transaction(async (tx) => {
    const [row] = await tx.query(
      z.object({ id: z.uuid() }),
      `INSERT INTO apps (${CORE_FIELDS.join(", ")})
       VALUES ($1, $2, $3, $4, $5, $6, $7::app_status, $8, $9, $10)
       RETURNING id`,
      coreParams(input),
    );
    if (!row) throw new Error("INSERT INTO apps returned no row");
    await writeChildren(tx, row.id, input);
    await audit(tx, {
      adminId: actor.adminId,
      action: "app.create",
      targetType: "app",
      targetId: row.id,
      details: { slug: input.slug },
      ip: actor.ip,
    });
    return { id: row.id, slug: input.slug };
  });
  invalidateCatalog();
  return created;
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export async function updateApp(id: string, input: AppUpdate, actor: Actor): Promise<{ slug: string; updated_at: string }> {
  const result = await transaction(async (tx) => {
    const before = await readApp(tx, id, true);
    if (!before) throw new ApiError("not_found", "No such app");
    if (before.updated_at !== input.expected_updated_at) {
      throw new ApiError("conflict", "This app was changed by someone else. Reload and try again.", {
        current_updated_at: before.updated_at,
      });
    }

    const next: AppInput = AppInputSchema.parse(
      Object.fromEntries(Object.entries(input).filter(([k]) => k !== "expected_updated_at")),
    );
    const changed = (Object.keys(next) as (keyof AppInput)[]).filter((k) => {
      // Order of OS / licenses / packages doesn't matter; compare sorted.
      const norm = (v: unknown) =>
        Array.isArray(v) && (k === "os" || k === "license_ids" || k === "packages")
          ? [...v].map((x) => JSON.stringify(x)).sort()
          : v;
      return !sameJson(norm(before[k]), norm(next[k]));
    });

    const [row] = await tx.query(
      z.object({ updated_at: z.string() }),
      `UPDATE apps SET
         slug = $1, name = $2, tagline = $3, about = $4, category_id = $5, language_id = $6,
         status = $7::app_status, github_owner = $8, github_repo = $9, is_published = $10
       WHERE id = $11
       RETURNING ${iso("updated_at")} AS updated_at`,
      [...coreParams(next), id],
    );
    if (!row) throw new ApiError("not_found", "No such app");
    await writeChildren(tx, id, next);
    await audit(tx, {
      adminId: actor.adminId,
      action: "app.update",
      targetType: "app",
      targetId: id,
      details: { slug: next.slug, previous_slug: before.slug, changed },
      ip: actor.ip,
    });
    return { slug: next.slug, updated_at: row.updated_at };
  });
  invalidateCatalog();
  return result;
}

export async function deleteApp(id: string, actor: Actor): Promise<void> {
  await transaction(async (tx) => {
    const [row] = await tx.query(
      z.object({ slug: z.string(), name: z.string() }),
      `DELETE FROM apps WHERE id = $1 RETURNING slug, name`,
      [id],
    );
    if (!row) throw new ApiError("not_found", "No such app");
    await audit(tx, {
      adminId: actor.adminId,
      action: "app.delete",
      targetType: "app",
      targetId: id,
      details: { slug: row.slug, name: row.name },
      ip: actor.ip,
    });
  });
  invalidateCatalog();
}
