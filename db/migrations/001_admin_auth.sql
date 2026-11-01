-- 001_admin_auth: admin users, server-side sessions and an append-only audit log.
-- Idempotent: safe to re-run. The migration runner wraps this file in a transaction.

/* ---------- admin_users ---------- */

CREATE TABLE IF NOT EXISTS public.admin_users (
  id                  uuid        PRIMARY KEY DEFAULT uuidv7(),
  email               text        NOT NULL,
  password_hash       text        NOT NULL,
  display_name        text,
  is_active           boolean     NOT NULL DEFAULT true,
  failed_login_count  integer     NOT NULL DEFAULT 0,
  locked_until        timestamptz,
  last_login_at       timestamptz,
  password_changed_at timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_users_email_key UNIQUE (email),
  -- Emails are stored lower-cased so the unique key is case-insensitive.
  CONSTRAINT admin_users_email_lower CHECK (email = lower(email)),
  CONSTRAINT admin_users_email_format CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 254),
  -- Only Argon2id PHC strings are accepted, so a plaintext password can never be stored by mistake.
  CONSTRAINT admin_users_password_hash_format CHECK (password_hash LIKE '$argon2id$%'),
  CONSTRAINT admin_users_display_name_length CHECK (display_name IS NULL OR length(display_name) BETWEEN 1 AND 100),
  CONSTRAINT admin_users_failed_login_count_nonneg CHECK (failed_login_count >= 0)
);

DROP TRIGGER IF EXISTS admin_users_set_updated_at ON public.admin_users;
CREATE TRIGGER admin_users_set_updated_at BEFORE UPDATE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

/* ---------- admin_sessions ---------- */

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id              uuid        PRIMARY KEY DEFAULT uuidv7(),
  user_id         uuid        NOT NULL REFERENCES public.admin_users (id) ON DELETE CASCADE,
  -- SHA-256 of the random session token. The raw token only ever lives in the cookie.
  token_hash      bytea       NOT NULL,
  -- Per-session secret used to derive the CSRF token.
  csrf_secret     bytea       NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  idle_expires_at timestamptz NOT NULL,
  expires_at      timestamptz NOT NULL,
  revoked_at      timestamptz,
  ip              inet,
  user_agent      text,
  CONSTRAINT admin_sessions_token_hash_key UNIQUE (token_hash),
  CONSTRAINT admin_sessions_token_hash_len CHECK (octet_length(token_hash) = 32),
  CONSTRAINT admin_sessions_csrf_secret_len CHECK (octet_length(csrf_secret) = 32),
  CONSTRAINT admin_sessions_expiry_order CHECK (idle_expires_at <= expires_at AND expires_at > created_at),
  CONSTRAINT admin_sessions_user_agent_length CHECK (user_agent IS NULL OR length(user_agent) <= 512)
);

CREATE INDEX IF NOT EXISTS admin_sessions_user_idx ON public.admin_sessions (user_id);
CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx ON public.admin_sessions (expires_at);

/* ---------- admin_audit_log ---------- */

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          uuid        PRIMARY KEY DEFAULT uuidv7(),
  user_id     uuid        REFERENCES public.admin_users (id) ON DELETE SET NULL,
  action      text        NOT NULL,
  target_type text,
  target_id   text,
  details     jsonb,
  ip          inet,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_audit_log_action_format CHECK (action ~ '^[a-z_]+(\.[a-z_]+)+$')
);

CREATE INDEX IF NOT EXISTS admin_audit_log_time_idx ON public.admin_audit_log USING brin (occurred_at);
CREATE INDEX IF NOT EXISTS admin_audit_log_user_idx ON public.admin_audit_log (user_id, occurred_at DESC);

-- The application connects as the table owner, so REVOKE cannot make the log
-- append-only. A trigger enforces it instead. The only allowed UPDATE is the
-- ON DELETE SET NULL of user_id when an admin user is removed.
CREATE OR REPLACE FUNCTION public.admin_audit_log_append_only()
RETURNS trigger LANGUAGE plpgsql AS $f$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.user_id IS NULL
     AND OLD.user_id IS NOT NULL
     AND (to_jsonb(NEW) - 'user_id') = (to_jsonb(OLD) - 'user_id') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'admin_audit_log is append-only (% not allowed)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$f$;

DROP TRIGGER IF EXISTS admin_audit_log_append_only ON public.admin_audit_log;
CREATE TRIGGER admin_audit_log_append_only BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_log_append_only();

-- Row triggers do not fire on TRUNCATE, so block it with a statement trigger.
DROP TRIGGER IF EXISTS admin_audit_log_no_truncate ON public.admin_audit_log;
CREATE TRIGGER admin_audit_log_no_truncate BEFORE TRUNCATE ON public.admin_audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_audit_log_append_only();
