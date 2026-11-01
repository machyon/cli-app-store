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

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "tty.store API",
      version: "1.0.0",
      description: "Read API for the tty.store CLI app catalog, plus download analytics.",
    },
    servers: [{ url: "/" }],
    tags: [{ name: "Catalog" }, { name: "Analytics" }, { name: "System" }],
  });
}
