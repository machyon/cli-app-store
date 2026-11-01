import data from "@/data/store.json";

export type OS = "linux" | "macos" | "windows";
export type Status = "stable" | "beta" | "experimental" | "maintenance";

export type InstallOption = {
  manager_slug: string;
  manager: string;
  kind: "distro" | "other";
  os_hint: OS | null;
  distro_slug: string | null;
  distro: string | null;
  command: string;
};

export type Download = {
  asset_id: string;
  version: string;
  os: OS;
  arch: string;
  file_name: string;
  size_bytes: string;
  sha256: string | null;
  download_url: string;
};

export type App = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  about: string;
  status: Status;
  stars_count: number;
  forks_count: number;
  github_url: string;
  updated_at: string;
  category: string;
  category_slug: string;
  language: string | null;
  latest_version: string | null;
  latest_released_at: string | null;
  licenses: string[];
  support: OS[];
  features: string[];
  demo: { text: string; prompt: boolean | null }[];
  install: InstallOption[];
  downloads: Download[];
};

export type Category = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  sort_order: number;
};

export const apps = data.apps as App[];
export const categories = (data.categories as Category[])
  .slice()
  .sort((a, b) => a.sort_order - b.sort_order);

export const getApp = (slug: string) => apps.find((a) => a.slug === slug);

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
