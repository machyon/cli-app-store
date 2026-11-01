// Creates an admin user, or resets an existing admin's password with --reset.
// There is no sign-up endpoint and no default account: this script is the only
// way to create an admin.
//
//   npm run admin:create -- --email you@example.com [--name "Your Name"]
//   npm run admin:create -- --email you@example.com --reset
//
// The password is read from the terminal without echo. When stdin is not a TTY
// (CI), the first line of stdin is used. It is never accepted as an argument,
// because arguments end up in shell history and process lists.
import readline from "node:readline";
import { parseArgs } from "node:util";
import { connect } from "./db-client.mjs";
import { hashPassword } from "../src/lib/auth/argon2.mjs";
import { PASSWORD_MAX, PASSWORD_MIN } from "../src/lib/auth/policy.mjs";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    reset: { type: "boolean", default: false },
  },
});

const email = (values.email ?? process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) {
  console.error("Pass a valid --email (or set ADMIN_EMAIL).");
  process.exit(1);
}
const displayName = values.name?.trim() || null;
if (displayName && displayName.length > 100) {
  console.error("--name must be at most 100 characters.");
  process.exit(1);
}

/** Reads one line from stdin; hides input when attached to a terminal. */
async function readSecret(prompt) {
  if (!process.stdin.isTTY) {
    // Piped input: read to EOF and use the first line (a trailing newline is optional).
    let data = "";
    for await (const chunk of process.stdin) data += chunk;
    return data.split(/\r?\n/)[0] ?? "";
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
    if (process.stdin.isTTY) {
      // Suppress echo of everything typed after the prompt.
      rl._writeToOutput = (s) => {
        if (s.startsWith(prompt)) rl.output.write(prompt);
      };
    }
    rl.question(prompt, (answer) => {
      rl.close();
      if (process.stdin.isTTY) process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const password = await readSecret("Password: ");
if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
  console.error(`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters.`);
  process.exit(1);
}
if (process.stdin.isTTY) {
  const confirm = await readSecret("Confirm password: ");
  if (confirm !== password) {
    console.error("Passwords do not match.");
    process.exit(1);
  }
}

const hash = await hashPassword(password);
const client = await connect();
try {
  await client.query("BEGIN");
  if (values.reset) {
    const { rows } = await client.query(
      `UPDATE admin_users
          SET password_hash = $2, password_changed_at = now(),
              failed_login_count = 0, locked_until = NULL, is_active = true
        WHERE email = $1
        RETURNING id`,
      [email, hash],
    );
    if (rows.length === 0) throw new Error(`No admin with email ${email}`);
    await client.query("UPDATE admin_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [
      rows[0].id,
    ]);
    await client.query(
      `INSERT INTO admin_audit_log (user_id, action, target_type, target_id, details)
       VALUES ($1::uuid, 'admin.password_reset', 'admin_user', $1::text, '{"via":"cli"}')`,
      [rows[0].id],
    );
    console.log(`Password reset for ${email}. All of their sessions were revoked.`);
  } else {
    const { rows } = await client.query(
      `INSERT INTO admin_users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, hash, displayName],
    );
    if (rows.length === 0) throw new Error(`An admin with email ${email} already exists (use --reset).`);
    await client.query(
      `INSERT INTO admin_audit_log (user_id, action, target_type, target_id, details)
       VALUES ($1::uuid, 'admin.create', 'admin_user', $1::text, '{"via":"cli"}')`,
      [rows[0].id],
    );
    console.log(`Created admin ${email}.`);
  }
  await client.query("COMMIT");
} catch (err) {
  await client.query("ROLLBACK");
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
