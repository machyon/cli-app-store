import "server-only";
import { z } from "zod";
import { audit } from "@/lib/admin-repo";
import { query, transaction } from "@/lib/db";
import { hashPassword, needsRehash, verifyDummy, verifyPassword } from "@/lib/auth/password";
import { createSession, pruneSessions, revokeAllSessions } from "@/lib/auth/session";
import type { Admin } from "@/lib/schemas/admin";

/** Consecutive failures before an account locks. Lock time doubles after each further failure. */
const LOCK_AFTER = 5;
const LOCK_BASE_MINUTES = 15;
const LOCK_MAX_DOUBLINGS = 5; // caps the lock at 15 min * 2^5 = 8 h

interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

const UserRowSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  display_name: z.string().nullable(),
  password_hash: z.string(),
  is_active: z.boolean(),
  is_locked: z.boolean(),
});

/**
 * Checks credentials and opens a session. Returns null for every failure
 * (unknown email, wrong password, inactive or locked account) so callers can
 * only give one generic error, and runs Argon2 in every case so timing is the same.
 */
export async function login(
  email: string,
  password: string,
  meta: RequestMeta,
): Promise<{ token: string; admin: Admin } | null> {
  const [user] = await query(
    UserRowSchema,
    `SELECT id, email, display_name, password_hash, is_active,
            coalesce(locked_until > now(), false) AS is_locked
       FROM admin_users WHERE email = $1`,
    [email],
  );

  if (!user || !user.is_active || user.is_locked) {
    await verifyDummy(password);
    await transaction((tx) =>
      audit(tx, {
        adminId: user?.id ?? null,
        action: "login.failure",
        targetType: "admin_user",
        ...(user && { targetId: user.id }),
        details: { reason: !user ? "unknown_email" : !user.is_active ? "inactive" : "locked", email },
        ip: meta.ip,
      }),
    );
    return null;
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    await transaction(async (tx) => {
      const [row] = await tx.query(
        z.object({ failed_login_count: z.number().int(), locked: z.boolean() }),
        `UPDATE admin_users
            SET failed_login_count = failed_login_count + 1,
                locked_until = CASE
                  WHEN failed_login_count + 1 >= $2
                  THEN now() + make_interval(mins => $3 * power(2, least(failed_login_count + 1 - $2, $4))::int)
                  ELSE locked_until END
          WHERE id = $1
          RETURNING failed_login_count, coalesce(locked_until > now(), false) AS locked`,
        [user.id, LOCK_AFTER, LOCK_BASE_MINUTES, LOCK_MAX_DOUBLINGS],
      );
      await audit(tx, {
        adminId: user.id,
        action: "login.failure",
        targetType: "admin_user",
        targetId: user.id,
        details: { reason: "bad_password", failed_login_count: row?.failed_login_count, locked: row?.locked },
        ip: meta.ip,
      });
    });
    return null;
  }

  const newHash = needsRehash(user.password_hash) ? await hashPassword(password) : null;
  const token = await transaction(async (tx) => {
    await tx.execute(
      `UPDATE admin_users
          SET failed_login_count = 0, locked_until = NULL, last_login_at = now(),
              password_hash = coalesce($2, password_hash)
        WHERE id = $1`,
      [user.id, newHash],
    );
    await pruneSessions(tx);
    const t = await createSession(tx, user.id, meta);
    await audit(tx, { adminId: user.id, action: "login.success", targetType: "admin_user", targetId: user.id, ip: meta.ip });
    return t;
  });

  return { token, admin: { id: user.id, email: user.email, display_name: user.display_name } };
}

/**
 * Changes the password after re-checking the current one. Revokes every session
 * of the user (other devices included) and returns a fresh session token for
 * this browser. Returns null when the current password is wrong.
 */
export async function changePassword(
  adminId: string,
  currentPassword: string,
  newPassword: string,
  meta: RequestMeta,
): Promise<string | null> {
  const [user] = await query(
    z.object({ password_hash: z.string() }),
    `SELECT password_hash FROM admin_users WHERE id = $1 AND is_active`,
    [adminId],
  );
  if (!user || !(await verifyPassword(currentPassword, user.password_hash))) {
    await transaction((tx) =>
      audit(tx, {
        adminId,
        action: "password.change_failure",
        targetType: "admin_user",
        targetId: adminId,
        ip: meta.ip,
      }),
    );
    return null;
  }

  const hash = await hashPassword(newPassword);
  return transaction(async (tx) => {
    await tx.execute(`UPDATE admin_users SET password_hash = $2, password_changed_at = now() WHERE id = $1`, [
      adminId,
      hash,
    ]);
    await revokeAllSessions(tx, adminId);
    const token = await createSession(tx, adminId, meta);
    await audit(tx, { adminId, action: "password.change", targetType: "admin_user", targetId: adminId, ip: meta.ip });
    return token;
  });
}
