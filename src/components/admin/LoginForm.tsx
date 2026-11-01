"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Field, inputClass, primaryButton } from "@/components/admin/fields";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/session", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (res.ok) {
        router.replace("/admin");
        router.refresh();
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(
        res.status === 429
          ? (body?.error?.message ?? "Too many attempts. Try again later.")
          : res.status === 400
            ? "Enter a valid email and password."
            : (body?.error?.message ?? "Sign in failed."),
      );
    } catch {
      setError("Network error. Check your connection.");
    }
    setBusy(false);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate={false}>
      {error && <Alert>{error}</Alert>}
      <Field id="email" label="Email">
        <input id="email" name="email" type="email" required autoComplete="username" maxLength={254} className={inputClass} />
      </Field>
      <Field id="password" label="Password">
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          maxLength={128}
          className={inputClass}
        />
      </Field>
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
