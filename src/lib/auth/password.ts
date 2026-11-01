import "server-only";
import { hashPassword, needsRehash, verifyPassword } from "@/lib/auth/argon2.mjs";

export { hashPassword, needsRehash, verifyPassword };

let dummyHash: Promise<string> | undefined;

/**
 * Burns the same Argon2id work as a real verification. Call it when the email
 * is unknown or the account is locked, so response timing doesn't reveal which
 * accounts exist.
 */
export async function verifyDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword("dummy-password-for-timing-equalisation");
  await verifyPassword(password, await dummyHash);
}
