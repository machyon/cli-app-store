import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { fail, handle, ok } from "@/lib/api";

/** Constant-time comparison of the presented bearer token against the configured secret. */
function isAuthorized(request: NextRequest, secret: string): boolean {
  const presented = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

/**
 * Invalidates every cached catalog read. Call this after the database changes
 * (e.g. from the ingest job) so visitors stop seeing stale data before the
 * cache lifetime expires. "max" serves stale content while the refresh runs.
 */
export const POST = handle(async (request: NextRequest) => {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return fail("unavailable", "Revalidation is not configured");
  if (!isAuthorized(request, secret)) {
    return new NextResponse("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  }

  revalidateTag("apps", "max");
  return ok({ revalidated: true, tags: ["apps"] });
});
