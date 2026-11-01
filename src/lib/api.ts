import "server-only";
import { isIP } from "node:net";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { ApiErrorBody } from "@/lib/schemas";

type ErrorCode = ApiErrorBody["error"]["code"];

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  rate_limited: 429,
  internal_error: 500,
  unavailable: 503,
};

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    readonly headers?: HeadersInit,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function fail(code: ErrorCode, message: string, details?: unknown, headers?: HeadersInit): NextResponse {
  const body: ApiErrorBody = { error: { code, message, ...(details !== undefined && { details }) } };
  return NextResponse.json(body, { status: STATUS[code], ...(headers && { headers }) });
}

export function ok<T>(body: T, status = 200, headers?: HeadersInit): NextResponse {
  return NextResponse.json(body, { status, ...(headers && { headers }) });
}

/**
 * Successful GET responses that CDNs and browsers may cache: fresh for `maxAge`
 * seconds, then served stale for up to a further `maxAge * 5` while revalidating.
 */
export function cacheable<T>(body: T, maxAge = 60): NextResponse {
  return ok(body, 200, {
    "Cache-Control": `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 5}`,
  });
}

/** Validates input with Zod; throws ApiError(400) with the issues on failure. */
export function parse<S extends z.ZodType>(schema: S, input: unknown, where: string): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError("bad_request", `Invalid ${where}`, z.treeifyError(result.error));
  }
  return result.data;
}

export function parseQuery<S extends z.ZodType>(schema: S, url: URL): z.output<S> {
  return parse(schema, Object.fromEntries(url.searchParams), "query parameters");
}

/** Default cap on JSON request bodies. */
export const MAX_JSON_BYTES = 64 * 1024;

/** Reads the body as text, refusing to buffer more than `maxBytes`. */
async function readBodyCapped(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) throw new ApiError("payload_too_large", `Request body exceeds ${maxBytes} bytes`);
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ApiError("payload_too_large", `Request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function parseJsonBody<S extends z.ZodType>(
  schema: S,
  request: Request,
  { maxBytes = MAX_JSON_BYTES, requireJsonType = false }: { maxBytes?: number; requireJsonType?: boolean } = {},
): Promise<z.output<S>> {
  if (requireJsonType) {
    const type = request.headers.get("content-type") ?? "";
    if (!/^application\/json\s*(;|$)/i.test(type)) {
      throw new ApiError("unsupported_media_type", "Content-Type must be application/json");
    }
  }
  const text = await readBodyCapped(request, maxBytes);
  let raw: unknown;
  try {
    raw = text === "" ? {} : JSON.parse(text);
  } catch {
    throw new ApiError("bad_request", "Request body is not valid JSON");
  }
  return parse(schema, raw, "request body");
}

/* Postgres errors -> client errors. Messages are fixed strings so that SQL,
 * table names and values never reach the client. */
const UNIQUE_MESSAGES: Record<string, string> = {
  apps_slug_key: "Another app already uses this slug",
  apps_github_owner_github_repo_key: "Another app already uses this GitHub repository",
};

function fromPgError(err: unknown): ApiError | null {
  if (typeof err !== "object" || err === null || !("code" in err)) return null;
  const { code, constraint } = err as { code?: unknown; constraint?: unknown };
  if (typeof code !== "string" || !/^[0-9A-Z]{5}$/.test(code)) return null;
  const name = typeof constraint === "string" ? constraint : "";
  switch (code) {
    case "23505":
      return new ApiError("conflict", UNIQUE_MESSAGES[name] ?? "A record with this value already exists");
    case "23503":
      return new ApiError(
        "conflict",
        name.startsWith("release_assets")
          ? "An operating system can't be removed while release assets exist for it"
          : "A referenced record does not exist or is still in use",
      );
    case "23514":
    case "23502":
    case "22P02":
    case "22001":
      return new ApiError("bad_request", "A value was rejected by the database");
    default:
      return null;
  }
}

/** Wraps a handler: ApiError -> mapped status, anything else -> opaque 500. */
export function handle<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      // Let Next.js control-flow errors (prerender bail-outs, redirect, notFound) through.
      unstable_rethrow(err);
      if (err instanceof ApiError) return fail(err.code, err.message, err.details, err.headers);
      const mapped = fromPgError(err);
      if (mapped) return fail(mapped.code, mapped.message);
      console.error("Unhandled API error:", err);
      return fail("internal_error", "Something went wrong");
    }
  };
}

/* Naive in-memory fixed-window limiter. Serverless instances do not share
 * memory, so this only throttles per-instance; use a shared store for strict limits. */
/**
 * Best-effort client IP. On Vercel the platform overwrites x-forwarded-for and
 * x-real-ip, so the first entry is trustworthy there. Elsewhere it can be spoofed,
 * so only use it for rate limiting and audit context, never for authorization.
 */
export function clientIp(request: Request): string | null {
  const raw =
    request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "";
  const ip = raw.trim();
  return isIP(ip) ? ip : null;
}

const hits = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 5000;

/* Bounded memory without a full clear(): a clear() would let anyone reset every
 * limit (including other IPs') by spraying unique keys. Drop expired windows
 * first, then the oldest tenth. */
function evict(now: number): void {
  for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  if (hits.size < MAX_KEYS) return;
  let drop = Math.ceil(MAX_KEYS / 10);
  for (const k of hits.keys()) {
    if (drop-- <= 0) break;
    hits.delete(k);
  }
}

export function rateLimit(key: string, max: number, windowMs: number): number | null {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    if (hits.size >= MAX_KEYS) evict(now);
    hits.delete(key); // re-insert so Map order stays oldest-first
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  entry.count += 1;
  return entry.count > max ? Math.ceil((entry.resetAt - now) / 1000) : null;
}

/** handle() for admin endpoints: responses carry user-specific data, so nothing may cache them. */
export function adminHandle<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  const wrapped = handle(fn);
  return async (...args: A) => {
    const response = await wrapped(...args);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  };
}
