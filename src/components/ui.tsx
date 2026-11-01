import { OS_LABEL, OS_LIST, STATUS_LABEL, type OS, type Status } from "@/lib/store";

const STATUS_COLOR: Record<Status, string> = {
  stable: "text-ok",
  beta: "text-warn",
  experimental: "text-exp",
  maintenance: "text-idle",
};

const STATUS_HINT: Record<Status, string> = {
  stable: "Production ready",
  beta: "Usable, may change",
  experimental: "Early, expect rough edges",
  maintenance: "No new features; consider alternatives",
};

export function StatusBadge({ status, className = "" }: { status: Status; className?: string }) {
  return (
    <span
      title={STATUS_HINT[status]}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap border border-line px-2 py-0.5 text-xs ${STATUS_COLOR[status]} ${className}`}
    >
      <span aria-hidden="true" className="size-1.5 bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function OsTags({ support }: { support: OS[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Supported systems">
      {OS_LIST.map((o) => {
        const on = support.includes(o);
        return (
          <li
            key={o}
            className={
              "border px-2 py-0.5 text-xs " +
              (on ? "border-ink text-ink" : "border-line text-mute line-through opacity-55")
            }
          >
            {OS_LABEL[o]}
            <span className="sr-only">{on ? " supported" : " not supported"}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function Glyph({ name, size = "sm" }: { name: string; size?: "sm" | "lg" }) {
  return (
    <div
      aria-hidden="true"
      className={
        "grid flex-none place-items-center border border-ink bg-surface font-mono font-bold " +
        (size === "lg" ? "size-16 text-[22px]" : "size-10 text-sm")
      }
    >
      {name.slice(0, 2)}
    </div>
  );
}

export const StarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 1l2.1 4.6 5 .5-3.8 3.4 1.1 4.9L8 11.9 3.6 14.4l1.1-4.9L.9 6.1l5-.5z" />
  </svg>
);

export const ForkIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M5 3.25a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0zm0 2.12a2.25 2.25 0 1 0-1.5 0v.88A2.25 2.25 0 0 0 5.75 8.5h1.5v2.13a2.25 2.25 0 1 0 1.5 0V8.5h1.5A2.25 2.25 0 0 0 12.5 6.25v-.88a2.25 2.25 0 1 0-1.5 0v.88a.75.75 0 0 1-.75.75h-4.5A.75.75 0 0 1 5 6.25v-.88zM8 12.75a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zm3.75-9.5a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z" />
  </svg>
);

export const GitHubIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

export function Sk({ className = "" }: { className?: string }) {
  return <div className={`sk animate-shim ${className}`} />;
}
