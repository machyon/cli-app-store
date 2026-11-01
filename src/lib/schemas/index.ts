import { z } from "zod";

/* ---------- primitives ---------- */

export const OsSchema = z
  .enum(["linux", "macos", "windows"])
  .meta({ id: "OS", description: "Operating system" });
export type OS = z.infer<typeof OsSchema>;

export const ArchSchema = z
  .enum(["x86_64", "arm64", "x86", "armv7"])
  .meta({ id: "Arch", description: "CPU architecture" });
export type Arch = z.infer<typeof ArchSchema>;

export const StatusSchema = z
  .enum(["stable", "beta", "experimental", "maintenance"])
  .meta({ id: "Status", description: "Maintenance status of the app" });
export type Status = z.infer<typeof StatusSchema>;

export const SlugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "must be lowercase letters, digits and dashes")
  .max(100)
  .meta({ example: "ripgrep" });

const IsoDateSchema = z.iso.datetime().meta({ example: "2026-11-01T00:00:00.000Z" });

/* ---------- entities ---------- */

export const CategorySchema = z
  .object({
    id: z.number().int(),
    slug: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    sort_order: z.number().int(),
    app_count: z.number().int().nonnegative(),
  })
  .meta({ id: "Category" });
export type Category = z.infer<typeof CategorySchema>;

export const InstallOptionSchema = z
  .object({
    manager_slug: z.string(),
    manager: z.string(),
    kind: z.enum(["distro", "other"]),
    os_hint: OsSchema.nullable(),
    distro_slug: z.string().nullable(),
    distro: z.string().nullable(),
    command: z.string().meta({ example: "sudo apt install ripgrep" }),
  })
  .meta({ id: "InstallOption" });
export type InstallOption = z.infer<typeof InstallOptionSchema>;

export const DownloadSchema = z
  .object({
    asset_id: z.uuid(),
    version: z.string(),
    os: OsSchema,
    arch: ArchSchema,
    file_name: z.string(),
    size_bytes: z.string().regex(/^\d+$/).meta({ description: "bigint serialized as a string" }),
    sha256: z.string().nullable(),
    download_url: z.url(),
  })
  .meta({ id: "Download" });
export type Download = z.infer<typeof DownloadSchema>;

export const DemoLineSchema = z
  .object({ text: z.string(), prompt: z.boolean().nullable() })
  .meta({ id: "DemoLine" });
export type DemoLine = z.infer<typeof DemoLineSchema>;

export const AppSummarySchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    tagline: z.string(),
    status: StatusSchema,
    stars_count: z.number().int().nonnegative(),
    forks_count: z.number().int().nonnegative(),
    github_url: z.string().nullable(),
    category: z.string(),
    category_slug: z.string(),
    language: z.string().nullable(),
    latest_version: z.string().nullable(),
    latest_released_at: IsoDateSchema.nullable(),
    support: z.array(OsSchema),
  })
  .meta({ id: "AppSummary" });
export type AppSummary = z.infer<typeof AppSummarySchema>;

export const AppDetailSchema = AppSummarySchema.extend({
  about: z.string(),
  updated_at: IsoDateSchema,
  licenses: z.array(z.string()),
  features: z.array(z.string()),
  demo: z.array(DemoLineSchema),
  install: z.array(InstallOptionSchema),
  downloads: z.array(DownloadSchema),
}).meta({ id: "AppDetail" });
export type AppDetail = z.infer<typeof AppDetailSchema>;

/* ---------- request inputs ---------- */

export const ListAppsQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional().meta({ description: "Full-text / fuzzy search" }),
  category: SlugSchema.optional(),
  os: OsSchema.optional(),
  status: StatusSchema.optional(),
  sort: z.enum(["stars", "latest", "name"]).default("stars"),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListAppsQuery = z.infer<typeof ListAppsQuerySchema>;

export const SlugParamsSchema = z.object({ slug: SlugSchema });

export const InstallQuerySchema = z.object({
  os: OsSchema.optional(),
  distro: SlugSchema.optional(),
});
export type InstallQuery = z.infer<typeof InstallQuerySchema>;

export const DownloadsQuerySchema = z.object({
  os: OsSchema.optional(),
  arch: ArchSchema.optional(),
});
export type DownloadsQuery = z.infer<typeof DownloadsQuerySchema>;

export const DownloadEventParamsSchema = z.object({ slug: SlugSchema, assetId: z.uuid() });

export const DownloadEventBodySchema = z
  .object({
    detected_os: OsSchema.optional(),
    detected_distro: SlugSchema.optional(),
    selected_manually: z.boolean().default(false),
  })
  .strict()
  .meta({ id: "DownloadEventInput" });
export type DownloadEventBody = z.infer<typeof DownloadEventBodySchema>;

/* ---------- response envelopes ---------- */

export const PaginationSchema = z.object({
  total: z.number().int().nonnegative(),
  limit: z.number().int(),
  offset: z.number().int(),
});

export const AppListResponseSchema = z
  .object({ data: z.array(AppSummarySchema), pagination: PaginationSchema })
  .meta({ id: "AppListResponse" });

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.enum(["bad_request", "not_found", "rate_limited", "internal_error", "unavailable"]),
      message: z.string(),
      details: z.unknown().optional(),
    }),
  })
  .meta({ id: "ErrorResponse" });
export type ApiErrorBody = z.infer<typeof ErrorSchema>;

export const HealthSchema = z
  .object({ status: z.literal("ok"), database: z.literal("connected"), now: IsoDateSchema })
  .meta({ id: "Health" });
