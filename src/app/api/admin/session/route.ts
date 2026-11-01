import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { adminHandle, ApiError, clientIp, ok, parseJsonBody, rateLimit } from "@/lib/api";
import { audit } from "@/lib/admin-repo";
import { assertSameOrigin, getSession, requireAdmin, requireAdminMutation } from "@/lib/auth/dal";
import { login } from "@/lib/auth/login";
import { cookieOptions, csrfTokenFor, lookupSession, revokeSession, SESSION_COOKIE } from "@/lib/auth/session";
import { transaction } from "@/lib/db";
import { LoginBodySchema } from "@/lib/schemas/admin";

const INVALID = "Invalid email or password, or the account is temporarily locked";

function throttle(key: string, max: number, windowMs: number): void {
  const retryAfter = rateLimit(key, max, windowMs);
  if (retryAfter !== null) {
    throw new ApiError("rate_limited", "Too many sign-in attempts. Try again later.", undefined, {
      "Retry-After": String(retryAfter),
    });
  }
}

/** Current admin and CSRF token. */
export const GET = adminHandle(async () => {
  const session = await requireAdmin();
  return ok({ admin: session.admin, csrf_token: csrfTokenFor(session.csrfSecret) });
});

/** Sign in. Sets the session cookie; the CSRF token for later writes is in the body. */
export const POST = adminHandle(async (request: NextRequest) => {
  // Blocks login CSRF (an attacker signing the victim into the attacker's account).
  assertSameOrigin(request);
  const ip = clientIp(request);
  throttle(`login:ip:${ip ?? "unknown"}`, 10, 60_000);

  const body = await parseJsonBody(LoginBodySchema, request, { maxBytes: 4096, requireJsonType: true });
  throttle(`login:email:${body.email}`, 10, 15 * 60_000);

  const result = await login(body.email, body.password, { ip, userAgent: request.headers.get("user-agent") });
  if (!result) throw new ApiError("unauthorized", INVALID);

  // Session fixation: any session this browser already had is ended, and a new token is issued.
  const previous = await getSession();
  if (previous) await transaction((tx) => revokeSession(tx, previous.sessionId));

  const session = await lookupSession(result.token);
  if (!session) throw new Error("new session could not be read back");
  (await cookies()).set(SESSION_COOKIE, result.token, cookieOptions);
  return ok({ admin: result.admin, csrf_token: csrfTokenFor(session.csrfSecret) });
});

/** Sign out: revokes the session server-side and clears the cookie. */
export const DELETE = adminHandle(async (request: NextRequest) => {
  const session = await requireAdminMutation(request);
  await transaction(async (tx) => {
    await revokeSession(tx, session.sessionId);
    await audit(tx, {
      adminId: session.admin.id,
      action: "session.logout",
      targetType: "admin_user",
      targetId: session.admin.id,
      ip: clientIp(request),
    });
  });
  (await cookies()).set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return ok({ signed_out: true });
});
