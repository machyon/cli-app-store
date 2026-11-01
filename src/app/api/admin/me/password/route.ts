import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { adminHandle, ApiError, clientIp, ok, parseJsonBody, rateLimit } from "@/lib/api";
import { requireAdminMutation } from "@/lib/auth/dal";
import { changePassword } from "@/lib/auth/login";
import { cookieOptions, csrfTokenFor, lookupSession, SESSION_COOKIE } from "@/lib/auth/session";
import { ChangePasswordBodySchema } from "@/lib/schemas/admin";

/** Changes the password, signs out every other session and rotates this one. */
export const PUT = adminHandle(async (request: NextRequest) => {
  const session = await requireAdminMutation(request);
  const retryAfter = rateLimit(`password:${session.admin.id}`, 5, 15 * 60_000);
  if (retryAfter !== null) {
    throw new ApiError("rate_limited", "Too many attempts. Try again later.", undefined, { "Retry-After": String(retryAfter) });
  }

  const body = await parseJsonBody(ChangePasswordBodySchema, request, { maxBytes: 4096, requireJsonType: true });
  const token = await changePassword(session.admin.id, body.current_password, body.new_password, {
    ip: clientIp(request),
    userAgent: request.headers.get("user-agent"),
  });
  if (!token) throw new ApiError("forbidden", "Current password is incorrect");

  const next = await lookupSession(token);
  if (!next) throw new Error("new session could not be read back");
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions);
  return ok({ changed: true, csrf_token: csrfTokenFor(next.csrfSecret) });
});
