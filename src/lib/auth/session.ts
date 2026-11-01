import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { query, type Tx } from "@/lib/db";
import type { Admin } from "@/lib/schemas/admin";

/* Opaque server-side sessions.
 * - The cookie holds 32 random bytes (base64url). The DB stores only SHA-256(token),
 *   so a read of the sessions table can't be replayed as a login.
 * - "__Host-" prefix: the browser only accepts it with Secure, Path=/ and no Domain,
 *   so a sibling subdomain can't set or overwrite it.
 * - Sliding idle timeout plus an absolute lifetime (OWASP Session Management). */

export const SESSION_COOKIE = "__Host-admin_session";
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
/** Only write last_seen_at at most this often, to avoid a DB write on every request. */
const TOUCH_INTERVAL_S = 60;

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

const sha256 = (value: string): Buffer => createHash("sha256").update(value).digest();

export interface SessionContext {
  sessionId: string;
  admin: Admin;
  csrfSecret: Buffer;
}

export const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
  maxAge: ABSOLUTE_TIMEOUT_MS / 1000,
};

/** Creates a session row and returns the raw token to put in the cookie. */
export async function createSession(
  tx: Tx,
  userId: string,
  meta: { ip: string | null; userAgent: string | null },
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await tx.execute(
    `INSERT INTO admin_sessions (user_id, token_hash, csrf_secret, idle_expires_at, expires_at, ip, user_agent)
     VALUES ($1, $2, $3,
             now() + make_interval(secs => $4), now() + make_interval(secs => $5),
             $6::inet, $7)`,
    [
      userId,
      sha256(token),
      randomBytes(32),
      IDLE_TIMEOUT_MS / 1000,
      ABSOLUTE_TIMEOUT_MS / 1000,
      meta.ip,
      meta.userAgent?.slice(0, 512) ?? null,
    ],
  );
  return token;
}

const SessionRowSchema = z.object({
  session_id: z.uuid(),
  user_id: z.uuid(),
  email: z.string(),
  display_name: z.string().nullable(),
  csrf_secret: z.instanceof(Buffer),
});

/**
 * Resolves a raw cookie token to a live session, sliding its idle timeout.
 * A session is live when it is not revoked, not past either timeout, its admin
 * is active, and it was created after the admin's last password change.
 */
export async function lookupSession(token: string | undefined): Promise<SessionContext | null> {
  if (!token || !TOKEN_RE.test(token)) return null;
  const [row] = await query(
    SessionRowSchema,
    `WITH live AS (
       SELECT s.id, s.user_id, s.csrf_secret, s.last_seen_at, u.email, u.display_name
         FROM admin_sessions s
         JOIN admin_users u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
          AND s.idle_expires_at > now()
          AND u.is_active
          AND s.created_at >= u.password_changed_at
     ), touched AS (
       UPDATE admin_sessions t
          SET last_seen_at = now(),
              idle_expires_at = least(now() + make_interval(secs => $2), t.expires_at)
         FROM live
        WHERE t.id = live.id AND live.last_seen_at < now() - make_interval(secs => $3)
     )
     SELECT id AS session_id, user_id, email, display_name, csrf_secret FROM live`,
    [sha256(token), IDLE_TIMEOUT_MS / 1000, TOUCH_INTERVAL_S],
  );
  if (!row) return null;
  return {
    sessionId: row.session_id,
    admin: { id: row.user_id, email: row.email, display_name: row.display_name },
    csrfSecret: row.csrf_secret,
  };
}

export async function revokeSession(tx: Tx, sessionId: string): Promise<void> {
  await tx.execute(`UPDATE admin_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [sessionId]);
}

/** Revokes every session of a user, optionally keeping one. */
export async function revokeAllSessions(tx: Tx, userId: string, exceptSessionId?: string): Promise<void> {
  await tx.execute(
    `UPDATE admin_sessions SET revoked_at = now()
      WHERE user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [userId, exceptSessionId ?? null],
  );
}

/** Opportunistic clean-up of sessions that ended more than a day ago. */
export async function pruneSessions(tx: Tx): Promise<void> {
  await tx.execute(
    `DELETE FROM admin_sessions
      WHERE expires_at < now() - interval '1 day'
         OR revoked_at < now() - interval '1 day'`,
  );
}

/* ---------- CSRF ---------- */

/** The CSRF token is an HMAC of a fixed label under the per-session secret. */
export function csrfTokenFor(secret: Buffer): string {
  return createHmac("sha256", secret).update("admin-csrf-v1").digest("base64url");
}

export function csrfTokenMatches(secret: Buffer, presented: string | null): boolean {
  if (!presented) return false;
  const expected = Buffer.from(csrfTokenFor(secret));
  const actual = Buffer.from(presented);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
