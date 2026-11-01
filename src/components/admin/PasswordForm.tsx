"use client";

import { useState, type FormEvent } from "react";
import { useAdmin } from "@/components/admin/AdminContext";
import { Alert, Field, inputClass, primaryButton } from "@/components/admin/fields";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/auth/policy.mjs";

export function PasswordForm({ email }: { email: string }) {
  const { request, setCsrfToken } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const current = String(form.get("current") ?? "");
    const next = String(form.get("next") ?? "");
    if (next !== String(form.get("confirm") ?? "")) {
      setMessage({ kind: "error", text: "The new passwords don't match." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await request<{ csrf_token: string }>("PUT", "/api/admin/me/password", {
      current_password: current,
      new_password: next,
    });
    setBusy(false);
    if (res.ok && res.data) {
      // The session was rotated, so the CSRF token changed too.
      setCsrfToken(res.data.csrf_token);
      formEl.reset();
      setMessage({ kind: "ok", text: "Password changed. All other sessions were signed out." });
    } else {
      setMessage({
        kind: "error",
        text: res.status === 400 ? `New password must be ${PASSWORD_MIN}–${PASSWORD_MAX} characters and differ from the current one.` : (res.error?.message ?? "Change failed"),
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      {message && <Alert kind={message.kind}>{message.text}</Alert>}
      {/* Lets password managers associate the new password with the right account. */}
      <input type="hidden" name="username" autoComplete="username" value={email} />
      <Field id="current" label="Current password">
        <input id="current" name="current" type="password" required autoComplete="current-password" maxLength={PASSWORD_MAX} className={inputClass} />
      </Field>
      <Field id="next" label="New password" hint={`${PASSWORD_MIN}–${PASSWORD_MAX} characters. A long passphrase is best.`}>
        <input id="next" name="next" type="password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} autoComplete="new-password" className={inputClass} aria-describedby="next-hint" />
      </Field>
      <Field id="confirm" label="Confirm new password">
        <input id="confirm" name="confirm" type="password" required minLength={PASSWORD_MIN} maxLength={PASSWORD_MAX} autoComplete="new-password" className={inputClass} />
      </Field>
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Changing…" : "Change password"}
      </button>
    </form>
  );
}
