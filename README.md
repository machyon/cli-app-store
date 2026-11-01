This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Admin dashboard

Admins sign in at `/admin` to create, edit, publish/unpublish and delete apps, including their features, demo transcript, OS support, licenses and install packages. Releases and release assets are read-only in the dashboard. The admin API is documented at `/docs` under the **Admin** tag.

### Setup

Requires Node.js 24.7 or later (for the built-in `crypto.argon2`).

```bash
npm run db:migrate                                              # creates admin_users, admin_sessions, admin_audit_log
npm run admin:create -- --email you@example.com --name "You"    # prompts for a password (12–128 chars, not echoed)
npm run admin:create -- --email you@example.com --reset         # reset a password; signs out all sessions
```

There is no sign-up page and no default account. The CLI is the only way to create an admin.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `DATABASE_CA` | on Vercel | CA certificate PEM (with `\n` escapes), used instead of `certs/ca.pem` |
| `REVALIDATE_SECRET` | optional | Bearer token for `POST /api/revalidate` |
| `APP_ORIGIN` | optional | Comma-separated origins allowed to send admin writes. Defaults to the request's own origin. Set it when the app sits behind a proxy that rewrites `Host` |

Session tokens are random and stored hashed, so no signing secret is needed.

### Security model

- **Passwords:** Argon2id (m=19 MiB, t=2, p=1), PHC strings, re-hashed on login if the parameters were raised. The database rejects any `password_hash` that isn't Argon2id.
- **Sessions:** 32-byte random token in a `__Host-admin_session` cookie (`HttpOnly`, `Secure`, `SameSite=Strict`). Only its SHA-256 is stored. Sessions expire after 30 minutes idle or 8 hours total, are rotated at login, and are revoked on sign-out and on password change.
- **Login abuse:** one generic error for every failure. Unknown and locked accounts take the same Argon2 time. Rate limits per IP (10/min) and per email (10 per 15 min). The account locks for 15 min after 5 failures, doubling up to 8 h.
- **CSRF:** writes need a same-origin `Origin` (or `Sec-Fetch-Site: same-origin`) **and** an `x-csrf-token` derived from the session. JSON content type is required.
- **Authorization:** every admin page and Route Handler checks the session in `src/lib/auth/dal.ts`. `src/proxy.ts` only redirects early.
- **Input:** strict Zod schemas with length caps that mirror the DB constraints, 64 KB body limit, parameterised SQL only. Database errors map to 400/409 without SQL details.
- **Headers:** HSTS, `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy, COOP/CORP everywhere. Public pages get a static CSP so they stay prerendered. `/admin` gets a per-request nonce CSP with `strict-dynamic`, plus `no-store` and `noindex`.
- **Audit:** logins, failures, sign-outs, password changes and every app create/update/delete are written to `admin_audit_log`, in the same transaction as the change. Database triggers make the log append-only.
- **Concurrency:** edits send the `updated_at` they loaded. If someone else saved in the meantime, the API answers `409` instead of overwriting.

Known limits: the in-memory rate limiter is per instance (Fluid Compute reuses instances, but limits aren't global; the DB lockout is). Per-email limits and lockout also let someone who knows an admin's email delay that admin's sign-in. That is the usual trade-off of account lockout.

See `docs/DB.README.md` §5.15–5.18 and §11 for the schema.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
