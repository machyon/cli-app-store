import { OpenAPIRegistry, OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import {
  AppDetailSchema,
  AppListResponseSchema,
  CategorySchema,
  DownloadEventBodySchema,
  DownloadEventParamsSchema,
  DownloadSchema,
  DownloadsQuerySchema,
  ErrorSchema,
  HealthSchema,
  InstallOptionSchema,
  InstallQuerySchema,
  ListAppsQuerySchema,
  SlugParamsSchema,
} from "@/lib/schemas";
import {
  AdminAppRowSchema,
  AdminAppSchema,
  AppIdParamsSchema,
  AppInputSchema,
  AppUpdateSchema,
  ChangePasswordBodySchema,
  LoginBodySchema,
  LookupsSchema,
  SessionResponseSchema,
} from "@/lib/schemas/admin";

const json = <S extends z.ZodType>(schema: S) => ({ content: { "application/json": { schema } } });
const error = (description: string) => ({ description, ...json(ErrorSchema) });

export function generateOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registry.registerPath({
    method: "get",
    path: "/api/health",
    tags: ["System"],
    summary: "Database liveness check",
    responses: {
      200: { description: "Database reachable", ...json(HealthSchema) },
      503: error("Database unreachable"),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/categories",
    tags: ["Catalog"],
    summary: "List categories with published app counts",
    responses: { 200: { description: "Categories", ...json(z.object({ data: z.array(CategorySchema) })) } },
  });

  registry.registerPath({
    method: "get",
    path: "/api/apps",
    tags: ["Catalog"],
    summary: "Search and list apps",
    request: { query: ListAppsQuerySchema },
    responses: {
      200: { description: "A page of apps", ...json(AppListResponseSchema) },
      400: error("Invalid query parameters"),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/apps/{slug}",
    tags: ["Catalog"],
    summary: "Get one app with features, demo, install options and downloads",
    request: { params: SlugParamsSchema },
    responses: {
      200: { description: "App detail", ...json(AppDetailSchema) },
      400: error("Invalid slug"),
      404: error("Unknown app"),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/apps/{slug}/install",
    tags: ["Catalog"],
    summary: "Install commands for an app",
    request: { params: SlugParamsSchema, query: InstallQuerySchema },
    responses: {
      200: { description: "Install options", ...json(z.object({ data: z.array(InstallOptionSchema) })) },
      400: error("Invalid parameters"),
      404: error("Unknown app"),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/apps/{slug}/downloads",
    tags: ["Catalog"],
    summary: "Binary downloads for an app's latest release",
    request: { params: SlugParamsSchema, query: DownloadsQuerySchema },
    responses: {
      200: { description: "Downloads", ...json(z.object({ data: z.array(DownloadSchema) })) },
      400: error("Invalid parameters"),
      404: error("Unknown app"),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/apps/{slug}/downloads/{assetId}/events",
    tags: ["Analytics"],
    summary: "Record a download click",
    request: {
      params: DownloadEventParamsSchema,
      body: { required: false, ...json(DownloadEventBodySchema) },
    },
    responses: {
      201: { description: "Recorded", ...json(z.object({ recorded: z.literal(true) })) },
      400: error("Invalid parameters or body"),
      404: error("Unknown app or asset"),
      429: error("Rate limited"),
    },
  });

  /* ---------- admin ---------- */

  registry.registerComponent("securitySchemes", "adminSession", {
    type: "apiKey",
    in: "cookie",
    name: "__Host-admin_session",
    description: "HttpOnly session cookie set by POST /api/admin/session.",
  });
  registry.registerComponent("securitySchemes", "csrfToken", {
    type: "apiKey",
    in: "header",
    name: "x-csrf-token",
    description: "Returned as csrf_token by the session endpoints. Required on every admin write.",
  });
  const read = [{ adminSession: [] }];
  const write = [{ adminSession: [], csrfToken: [] }];
  const authErrors = {
    401: error("Not signed in"),
    403: error("Cross-origin request or missing/invalid CSRF token"),
  };

  registry.registerPath({
    method: "get",
    path: "/api/admin/session",
    tags: ["Admin"],
    summary: "Current admin and CSRF token",
    security: read,
    responses: { 200: { description: "Signed in", ...json(SessionResponseSchema) }, 401: error("Not signed in") },
  });
  registry.registerPath({
    method: "post",
    path: "/api/admin/session",
    tags: ["Admin"],
    summary: "Sign in",
    description: "Same-origin only. Rate limited per IP and per email. Accounts lock after repeated failures.",
    request: { body: { required: true, ...json(LoginBodySchema) } },
    responses: {
      200: { description: "Signed in; sets the session cookie", ...json(SessionResponseSchema) },
      400: error("Invalid body"),
      401: error("Invalid credentials or locked account (deliberately indistinguishable)"),
      403: error("Cross-origin request"),
      429: error("Rate limited"),
    },
  });
  registry.registerPath({
    method: "delete",
    path: "/api/admin/session",
    tags: ["Admin"],
    summary: "Sign out",
    security: write,
    responses: { 200: { description: "Signed out", ...json(z.object({ signed_out: z.literal(true) })) }, ...authErrors },
  });
  registry.registerPath({
    method: "put",
    path: "/api/admin/me/password",
    tags: ["Admin"],
    summary: "Change password (signs out all other sessions)",
    security: write,
    request: { body: { required: true, ...json(ChangePasswordBodySchema) } },
    responses: {
      200: { description: "Changed", ...json(z.object({ changed: z.literal(true), csrf_token: z.string() })) },
      400: error("Invalid body"),
      ...authErrors,
      429: error("Rate limited"),
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/admin/lookups",
    tags: ["Admin"],
    summary: "Categories, languages, licenses and package managers",
    security: read,
    responses: { 200: { description: "Lookups", ...json(LookupsSchema) }, 401: error("Not signed in") },
  });
  registry.registerPath({
    method: "get",
    path: "/api/admin/apps",
    tags: ["Admin"],
    summary: "List all apps, including unpublished",
    security: read,
    responses: {
      200: { description: "Apps", ...json(z.object({ data: z.array(AdminAppRowSchema) })) },
      401: error("Not signed in"),
    },
  });
  registry.registerPath({
    method: "post",
    path: "/api/admin/apps",
    tags: ["Admin"],
    summary: "Create an app",
    security: write,
    request: { body: { required: true, ...json(AppInputSchema) } },
    responses: {
      201: { description: "Created", ...json(z.object({ id: z.uuid(), slug: z.string() })) },
      400: error("Invalid body"),
      ...authErrors,
      409: error("Slug or GitHub repository already used"),
      413: error("Body too large"),
    },
  });
  registry.registerPath({
    method: "get",
    path: "/api/admin/apps/{id}",
    tags: ["Admin"],
    summary: "Get an app for editing",
    security: read,
    request: { params: AppIdParamsSchema },
    responses: { 200: { description: "App", ...json(AdminAppSchema) }, 401: error("Not signed in"), 404: error("Unknown app") },
  });
  registry.registerPath({
    method: "put",
    path: "/api/admin/apps/{id}",
    tags: ["Admin"],
    summary: "Replace an app and its child data",
    description: "expected_updated_at must equal the current updated_at, otherwise 409 (optimistic locking).",
    security: write,
    request: { params: AppIdParamsSchema, body: { required: true, ...json(AppUpdateSchema) } },
    responses: {
      200: { description: "Updated", ...json(z.object({ slug: z.string(), updated_at: z.string() })) },
      400: error("Invalid body"),
      ...authErrors,
      404: error("Unknown app"),
      409: error("Edited concurrently, duplicate value, or OS still has release assets"),
    },
  });
  registry.registerPath({
    method: "delete",
    path: "/api/admin/apps/{id}",
    tags: ["Admin"],
    summary: "Delete an app (cascades to releases and download history)",
    security: write,
    request: { params: AppIdParamsSchema },
    responses: {
      200: { description: "Deleted", ...json(z.object({ deleted: z.literal(true) })) },
      ...authErrors,
      404: error("Unknown app"),
    },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "tty.store API",
      version: "1.0.0",
      description: "Read API for the tty.store CLI app catalog, download analytics, and the admin API.",
    },
    servers: [{ url: "/" }],
    tags: [{ name: "Catalog" }, { name: "Analytics" }, { name: "Admin" }, { name: "System" }],
  });
}
