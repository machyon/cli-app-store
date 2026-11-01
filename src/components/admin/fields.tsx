import type { ReactNode } from "react";

export const inputClass =
  "w-full border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-mute focus:border-ink focus:outline-none aria-[invalid=true]:border-red-600";

export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-mute">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "ok"; children: ReactNode }) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={
        "border px-3 py-2 text-sm " +
        (kind === "error" ? "border-red-600/50 text-red-700 dark:text-red-400" : "border-ok/50 text-ok")
      }
    >
      {children}
    </div>
  );
}

export const primaryButton =
  "border border-ink bg-ink px-4 py-2 text-sm text-bg transition-opacity hover:opacity-85 disabled:opacity-50";
export const secondaryButton =
  "border border-line px-4 py-2 text-sm text-ink transition-colors hover:border-ink disabled:opacity-50";
