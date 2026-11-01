import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { ApiErrorBody } from "@/lib/schemas";

type ErrorCode = ApiErrorBody["error"]["code"];

const STATUS: Record<ErrorCode, number> = {
  bad_request: 400,
  not_found: 404,
  rate_limited: 429,
  internal_error: 500,
  unavailable: 503,
};

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function fail(code: ErrorCode, message: string, details?: unknown, headers?: HeadersInit): NextResponse {
  const body: ApiErrorBody = { error: { code, message, ...(details !== undefined && { details }) } };
  return NextResponse.json(body, { status: STATUS[code], ...(headers && { headers }) });
}

export function ok<T>(body: T, status = 200): NextResponse {
  return NextResponse.json(body, { status });
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

export async function parseJsonBody<S extends z.ZodType>(schema: S, request: Request): Promise<z.output<S>> {
  let raw: unknown;
  try {
    const text = await request.text();
    raw = text === "" ? {} : JSON.parse(text);
  } catch {
    throw new ApiError("bad_request", "Request body is not valid JSON");
  }
  return parse(schema, raw, "request body");
}

/** Wraps a handler: ApiError -> mapped status, anything else -> opaque 500. */
export function handle<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return fail(err.code, err.message, err.details);
      console.error("Unhandled API error:", err);
      return fail("internal_error", "Something went wrong");
    }
  };
}

/* Naive in-memory fixed-window limiter. Serverless instances do not share
 * memory, so this only throttles per-instance; use a shared store for strict limits. */
const hits = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs: number): number | null {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.resetAt <= now) {
    if (hits.size > 5000) hits.clear();
    hits.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  entry.count += 1;
  return entry.count > max ? Math.ceil((entry.resetAt - now) / 1000) : null;
}
