import type { AppDetail, AppSummary, Category, InstallOption, OS, Status } from "@/lib/schemas";

export type { AppDetail, AppSummary, Category, InstallOption, OS, Status };
export type { Download } from "@/lib/schemas";

export const OS_LIST: OS[] = ["linux", "macos", "windows"];
export const OS_LABEL: Record<OS, string> = {
  linux: "Linux",
  macos: "macOS",
  windows: "Windows",
};

export const STATUS_LABEL: Record<Status, string> = {
  stable: "Stable",
  beta: "Beta",
  experimental: "Experimental",
  maintenance: "Maintenance",
};

export const compact = (n: number) =>
  n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);

export const fileSize = (bytes: string | number) => {
  const b = Number(bytes);
  if (b >= 1024 * 1024) return (b / 1024 / 1024).toFixed(1) + " MB";
  if (b >= 1024) return Math.round(b / 1024) + " KB";
  return b + " B";
};

export const date = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : "—";
