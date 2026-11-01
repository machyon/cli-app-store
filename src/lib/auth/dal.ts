import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api";
import { csrfTokenMatches, lookupSession, SESSION_COOKIE, type SessionContext } from "@/lib/auth/session";

/* Data Access Layer: the only place that turns a request into an admin identity.
 * Every admin page, Route Handler and write calls one of these, close to the data.
 * proxy.ts redirects early when the cookie is missing, but that is only a UX
 * shortcut; authorization is decided here. */

/** The live session for this request, or null. Deduplicated per request. */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return lookupSession(token);
});

/** For admin pages: the session, or a redirect to the login page. */
export async function requireAdminPage(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  return session;
}

/** For admin Route Handlers that only read: 401 without a live session. */
export async function requireAdmin(): Promise<SessionContext> {
  const session = await getSession();
  if (!session) throw new ApiError("unauthorized", "Sign in required");
  return session;
}

/** Origins allowed to send state-changing admin requests. */
function allowedOrigins(request: NextRequest): Set<string> {
  const configured = (process.env.APP_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return new Set(configured.length > 0 ? configured : [request.nextUrl.origin]);
}

/**
 * Rejects cross-site requests. Browsers always send Origin on POST/PUT/DELETE
 * fetches; Sec-Fetch-Site is the fallback. Requests with neither are refused.
 */
export function assertSameOrigin(request: NextRequest): void {
  const origin = request.headers.get("origin");
  if (origin !== null) {
    if (!allowedOrigins(request).has(origin)) throw new ApiError("forbidden", "Cross-origin request refused");
    return;
  }
  if (request.headers.get("sec-fetch-site") !== "same-origin") {
    throw new ApiError("forbidden", "Cross-origin request refused");
  }
}

/**
 * For admin writes: same origin, a live session, and a CSRF token in the
 * x-csrf-token header that matches the session (defence in depth on top of
 * SameSite=Strict cookies and the Origin check).
 */
export async function requireAdminMutation(request: NextRequest): Promise<SessionContext> {
  assertSameOrigin(request);
  const session = await requireAdmin();
  if (!csrfTokenMatches(session.csrfSecret, request.headers.get("x-csrf-token"))) {
    throw new ApiError("forbidden", "Missing or invalid CSRF token");
  }
  return session;
}
