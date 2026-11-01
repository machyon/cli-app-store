import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import { execute, iso, query } from "@/lib/db";
import {
  AppSummarySchema,
  CategorySchema,
  DemoLineSchema,
  DownloadSchema,
  InstallOptionSchema,
  type AppDetail,
  type AppSummary,
  type Category,
  type Download,
  type DownloadEventBody,
  type DownloadsQuery,
  type InstallOption,
  type InstallQuery,
  type ListAppsQuery,
} from "@/lib/schemas";

const SUMMARY_COLUMNS = `
  a.id, a.slug, a.name, a.tagline, a.status::text AS status,
  a.stars_count, a.forks_count, a.github_url,
  c.name AS category, c.slug AS category_slug,
  pl.name AS language,
  lr.version AS latest_version,
  ${iso("lr.released_at")} AS latest_released_at,
  COALESCE((SELECT array_agg(s.os::text ORDER BY s.os) FROM app_os_support s WHERE s.app_id = a.id), '{}'::text[]) AS support`;

const SUMMARY_FROM = `
  FROM apps a
  JOIN categories c ON c.id = a.category_id
  LEFT JOIN programming_languages pl ON pl.id = a.language_id
  LEFT JOIN latest_releases lr ON lr.app_id = a.id`;

/* ---------- categories ---------- */

export async function listCategories(): Promise<Category[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("apps");
  return query(
    CategorySchema,
    `SELECT c.id, c.slug, c.name, c.description, c.sort_order,
            (SELECT count(*)::int FROM apps a WHERE a.category_id = c.id AND a.is_published) AS app_count
       FROM categories c
      ORDER BY c.sort_order, c.name`,
  );
}

/* ---------- apps ---------- */

const ListRowSchema = AppSummarySchema.extend({ total: z.number().int() });

export async function listApps(
  input: ListAppsQuery,
): Promise<{ data: AppSummary[]; total: number }> {
  "use cache";
  cacheLife("minutes");
  cacheTag("apps");

  const where: string[] = ["a.is_published"];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  if (input.q !== undefined) {
    const p = add(input.q);
    where.push(`(a.search_vector @@ websearch_to_tsquery('english', ${p}) OR a.name % ${p})`);
  }
  if (input.category !== undefined) where.push(`c.slug = ${add(input.category)}`);
  if (input.status !== undefined) where.push(`a.status = ${add(input.status)}::app_status`);
  if (input.os !== undefined) {
    where.push(
      `EXISTS (SELECT 1 FROM app_os_support s WHERE s.app_id = a.id AND s.os = ${add(input.os)}::operating_system)`,
    );
  }

  // Sort columns come from a closed whitelist, never from user input.
  const orderBy: Record<ListAppsQuery["sort"], string> = {
    stars: "a.stars_count DESC, a.name",
    latest: "lr.released_at DESC NULLS LAST, a.name",
    name: "a.name",
  };

  const limitP = add(input.limit);
  const offsetP = add(input.offset);
  const rows = await query(
    ListRowSchema,
    `SELECT ${SUMMARY_COLUMNS}, count(*) OVER()::int AS total
       ${SUMMARY_FROM}
      WHERE ${where.join(" AND ")}
      ORDER BY ${orderBy[input.sort]}
      LIMIT ${limitP} OFFSET ${offsetP}`,
    params,
  );

  const total = rows[0]?.total ?? 0;
  const data: AppSummary[] = rows.map((row) => AppSummarySchema.parse(row));
  return { data, total };
}

const DetailRowSchema = AppSummarySchema.extend({
  about: z.string(),
  updated_at: z.string(),
  licenses: z.array(z.string()),
});

export async function getAppBySlug(slug: string): Promise<AppDetail | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("apps", `app:${slug}`);

  const [row] = await query(
    DetailRowSchema,
    `SELECT ${SUMMARY_COLUMNS},
            a.about,
            ${iso("a.updated_at")} AS updated_at,
            COALESCE((SELECT array_agg(l.spdx_id ORDER BY l.spdx_id)
                        FROM app_licenses al JOIN licenses l ON l.id = al.license_id
                       WHERE al.app_id = a.id), '{}'::text[]) AS licenses
       ${SUMMARY_FROM}
      WHERE a.is_published AND a.slug = $1`,
    [slug],
  );
  if (!row) return null;

  const [features, demo, install, downloads] = await Promise.all([
    query(
      z.object({ body: z.string() }),
      `SELECT body FROM app_feature_list WHERE slug = $1 ORDER BY ordinal`,
      [slug],
    ),
    query(
      DemoLineSchema,
      `SELECT d.content AS text, d.is_prompt AS prompt
         FROM app_demo_lines d JOIN apps a ON a.id = d.app_id
        WHERE a.slug = $1 AND a.is_published
        ORDER BY d.line_no`,
      [slug],
    ),
    fetchInstall(slug, {}),
    fetchDownloads(slug, {}),
  ]);

  return { ...row, features: features.map((f) => f.body), demo, install, downloads };
}

/* ---------- install & downloads ---------- */

const installSql = (os?: string): string => `
  SELECT manager_slug, manager, kind::text AS kind, os_hint::text AS os_hint,
         distro_slug, distro, command
    FROM app_install_options
   WHERE slug = $1
     ${os ? `AND (os_hint::text = $2 OR (os_hint IS NULL AND (kind = 'other' OR $2 = 'linux')))` : ""}
   ORDER BY kind, manager`;

async function fetchInstall(slug: string, filter: InstallQuery): Promise<InstallOption[]> {
  const rows = await query(
    InstallOptionSchema,
    installSql(filter.os),
    filter.os ? [slug, filter.os] : [slug],
  );
  return filter.distro ? rows.filter((r) => r.distro_slug === filter.distro) : rows;
}

async function fetchDownloads(slug: string, filter: DownloadsQuery): Promise<Download[]> {
  const where: string[] = ["slug = $1"];
  const params: unknown[] = [slug];
  if (filter.os) {
    params.push(filter.os);
    where.push(`os = $${params.length}::operating_system`);
  }
  if (filter.arch) {
    params.push(filter.arch);
    where.push(`arch = $${params.length}::cpu_arch`);
  }
  return query(
    DownloadSchema,
    `SELECT asset_id, version, os::text AS os, arch::text AS arch, file_name,
            size_bytes::text AS size_bytes, sha256, download_url
       FROM app_download_links
      WHERE ${where.join(" AND ")}
      ORDER BY os, arch`,
    params,
  );
}

/** Returns null when the app does not exist (or is unpublished). */
export async function listInstall(slug: string, filter: InstallQuery): Promise<InstallOption[] | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("apps", `app:${slug}`);
  if (!(await appExists(slug))) return null;
  return fetchInstall(slug, filter);
}

/** Returns null when the app does not exist (or is unpublished). */
export async function listDownloads(slug: string, filter: DownloadsQuery): Promise<Download[] | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("apps", `app:${slug}`);
  if (!(await appExists(slug))) return null;
  return fetchDownloads(slug, filter);
}

async function appExists(slug: string): Promise<boolean> {
  const rows = await query(
    z.object({ ok: z.literal(1) }),
    `SELECT 1 AS ok FROM apps WHERE slug = $1 AND is_published`,
    [slug],
  );
  return rows.length > 0;
}

/* ---------- download events (write) ---------- */

/** Records a download click. Returns false if the asset does not belong to the app's latest release. */
export async function recordDownloadEvent(
  slug: string,
  assetId: string,
  body: DownloadEventBody,
): Promise<boolean> {
  const inserted = await execute(
    `INSERT INTO download_events (asset_id, detected_os, detected_distro_id, selected_manually)
     SELECT l.asset_id,
            $3::operating_system,
            (SELECT d.id FROM linux_distros d WHERE d.slug = $4),
            $5::boolean
       FROM app_download_links l
      WHERE l.slug = $1 AND l.asset_id = $2::uuid`,
    [slug, assetId, body.detected_os ?? null, body.detected_distro ?? null, body.selected_manually],
  );
  return inserted > 0;
}

/* ---------- health ---------- */

export async function databaseNow(): Promise<string> {
  const [row] = await query(
    z.object({ now: z.string() }),
    `SELECT ${iso("now()")} AS now`,
  );
  if (!row) throw new Error("health query returned no rows");
  return row.now;
}
