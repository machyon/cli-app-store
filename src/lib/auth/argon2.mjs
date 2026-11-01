// Argon2id password hashing with Node's built-in crypto.argon2 (Node >= 24.7).
// Plain ESM with no "server-only" import so that scripts/create-admin.mjs can share it.
// Hashes are stored as PHC strings: $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>
import { argon2, randomBytes, timingSafeEqual } from "node:crypto";

// OWASP Password Storage Cheat Sheet minimum for Argon2id: m=19 MiB, t=2, p=1.
const PARAMS = { memory: 19456, passes: 2, parallelism: 1, tagLength: 32 };
const SALT_BYTES = 16;

// Upper bounds on parameters read back from a stored hash, so a tampered row
// cannot make verification allocate unbounded memory or CPU.
const MAX = { memory: 262144, passes: 10, parallelism: 8, tagLength: 64 };

const b64 = (buf) => buf.toString("base64").replace(/=+$/, "");

/**
 * @param {string | Buffer} message
 * @param {Buffer} nonce
 * @param {{ memory: number, passes: number, parallelism: number, tagLength: number }} p
 * @returns {Promise<Buffer>}
 */
function derive(message, nonce, p) {
  return new Promise((resolve, reject) => {
    argon2("argon2id", { message, nonce, ...p }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/**
 * Hashes a password into a PHC string with a fresh random salt.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, PARAMS);
  const { memory: m, passes: t, parallelism: p } = PARAMS;
  return `$argon2id$v=19$m=${m},t=${t},p=${p}$${b64(salt)}$${b64(key)}`;
}

const PHC = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

/**
 * Verifies a password against a stored PHC string in constant time.
 * Returns false (never throws) for malformed or out-of-bounds hashes.
 * @param {string} password
 * @param {string} phc
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, phc) {
  const m = PHC.exec(phc);
  if (!m) return false;
  const memory = Number(m[1]);
  const passes = Number(m[2]);
  const parallelism = Number(m[3]);
  const salt = Buffer.from(m[4], "base64");
  const expected = Buffer.from(m[5], "base64");
  if (
    memory < 8 * parallelism || memory > MAX.memory ||
    passes < 1 || passes > MAX.passes ||
    parallelism < 1 || parallelism > MAX.parallelism ||
    salt.length < 8 || expected.length < 16 || expected.length > MAX.tagLength
  ) {
    return false;
  }
  const actual = await derive(password, salt, { memory, passes, parallelism, tagLength: expected.length });
  return timingSafeEqual(actual, expected);
}

/**
 * True when a stored hash uses weaker parameters than the current ones and
 * should be re-hashed after a successful login.
 * @param {string} phc
 * @returns {boolean}
 */
export function needsRehash(phc) {
  const m = PHC.exec(phc);
  if (!m) return true;
  return Number(m[1]) < PARAMS.memory || Number(m[2]) < PARAMS.passes;
}

/** Password policy shared by the API and the CLI (NIST SP 800-63B: length over composition). */
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;
