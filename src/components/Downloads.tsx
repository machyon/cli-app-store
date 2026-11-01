"use client";

import { useSyncExternalStore } from "react";
import { OS_LABEL, fileSize, type AppDetail, type InstallOption, type OS } from "@/lib/store";
import { CopyButton } from "./CopyButton";

type Sys = { os: OS | null; distro: string | null };

// Mirrors linux_distros.ua_keywords in the database.
const DISTRO_UA: Record<string, RegExp> = {
  debian: /ubuntu|debian|mint|pop!_os|kali|elementary/,
  fedora: /fedora|red hat|rhel|centos|rocky|alma/,
  arch: /\barch\b|manjaro|endeavour/,
};

function detect(): Sys {
  const n = navigator as Navigator & { userAgentData?: { platform?: string } };
  const t = `${n.userAgentData?.platform ?? ""} ${n.platform ?? ""} ${n.userAgent}`.toLowerCase();
  if (/android|iphone|ipad|ipod/.test(t)) return { os: null, distro: null };
  if (/windows|win32|win64/.test(t)) return { os: "windows", distro: null };
  if (/macintosh|macintel|macos|mac os/.test(t)) return { os: "macos", distro: null };
  if (/linux|x11|cros/.test(t))
    return { os: "linux", distro: Object.keys(DISTRO_UA).find((k) => DISTRO_UA[k]?.test(t)) ?? null };
  return { os: null, distro: null };
}

const KEY = "tty.store:system";

const NONE: Sys = { os: null, distro: null };
let cached: Sys | null = null;
const getDetected = () => (cached ??= detect());
const noop = () => () => {};

const subscribeMode = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(KEY, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(KEY, cb);
  };
};

export function Downloads({ app }: { app: AppDetail }) {
  // Server snapshot is "unknown", so server and client markup match on hydration.
  const detected = useSyncExternalStore(noop, getDetected, () => NONE);
  const mode = useSyncExternalStore(subscribeMode, () => localStorage.getItem(KEY) ?? "auto", () => "auto");

  const distros = new Map<string, string>();
  for (const i of app.install) if (i.distro_slug && i.distro) distros.set(i.distro_slug, i.distro);

  const sys: Sys =
    mode === "auto"
      ? detected
      : distros.has(mode)
        ? { os: "linux", distro: mode }
        : { os: mode as OS, distro: null };

  const change = (v: string) => {
    if (v === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, v);
    window.dispatchEvent(new Event(KEY));
  };

  const autoLabel =
    "Auto (" +
    (detected.os
      ? OS_LABEL[detected.os] + (detected.distro ? ", " + (distros.get(detected.distro) ?? detected.distro) : "")
      : "default order") +
    ")";

  const unsupported = sys.os && !app.support.includes(sys.os);

  // Groups, ordered so the user's system comes first.
  const bins = app.downloads.slice().sort((a, b) => Number(b.os === sys.os) - Number(a.os === sys.os));
  const distroPkgs = app.support.includes("linux")
    ? app.install
        .filter((i) => i.kind === "distro")
        .sort((a, b) => Number(b.distro_slug === sys.distro) - Number(a.distro_slug === sys.distro))
    : [];
  const rank = (i: InstallOption) => (i.os_hint === sys.os ? 0 : i.os_hint === null ? 1 : 2);
  const others = app.install.filter((i) => i.kind === "other").sort((a, b) => (sys.os ? rank(a) - rank(b) : 0));

  const groups = [
    { key: "bin", node: <Binaries key="bin" app={app} bins={bins} sys={sys} /> },
    { key: "distro", node: distroPkgs.length > 0 && (
      <Group key="distro" title="Linux distro packages">
        {distroPkgs.map((i) => (
          <CmdRow key={i.manager_slug} title={`${i.distro} (${i.manager})`} cmd={i.command} mine={i.distro_slug === sys.distro} />
        ))}
      </Group>
    ) },
    { key: "pm", node: others.length > 0 && (
      <Group key="pm" title="Other package managers">
        {others.map((i) => (
          <CmdRow
            key={i.manager_slug}
            title={i.manager}
            hint={i.os_hint ? OS_LABEL[i.os_hint] : "Any OS"}
            cmd={i.command}
            mine={!!sys.os && i.os_hint === sys.os && !(sys.os === "linux" && sys.distro)}
          />
        ))}
      </Group>
    ) },
  ];
  // On Linux, package managers are the better path, so show them before raw binaries.
  if (sys.os === "linux") groups.push(groups.shift()!);

  return (
    <div className="border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="m-0 text-sm font-bold">Install</h2>
        <select
          value={mode}
          onChange={(e) => change(e.target.value)}
          aria-label="Your system"
          className="max-w-[60%] cursor-pointer border border-line bg-surface px-1.5 py-1 text-xs text-ink"
        >
          <option value="auto">{autoLabel}</option>
          {(["windows", "macos", "linux"] as OS[]).map((o) => (
            <option key={o} value={o}>{OS_LABEL[o]}</option>
          ))}
          {[...distros].map(([slug, name]) => (
            <option key={slug} value={slug}>{name}</option>
          ))}
        </select>
      </div>
      {unsupported && (
        <p className="border-b border-line bg-bg px-4 py-2.5 text-[13px] text-warn" role="status">
          {app.name} doesn’t support {OS_LABEL[sys.os!]}. Options for other systems are below.
        </p>
      )}
      {groups.map((g) => g.node)}
    </div>
  );
}

function Binaries({ app, bins, sys }: { app: AppDetail; bins: AppDetail["downloads"]; sys: Sys }) {
  if (!bins.length) return null;
  return (
    <Group title={`Binaries${app.latest_version ? ` · v${app.latest_version}` : ""}`}>
      {bins.map((d) => (
        <div key={d.asset_id} className="group/dl border-b border-line transition-colors hover:bg-hover">
          <a
            href={d.download_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <strong className="block text-sm">
                {OS_LABEL[d.os]}
                {sys.os === d.os && !sys.distro && <Mine />}
              </strong>
              <span className="block truncate font-mono text-xs text-mute" title={d.file_name}>
                {d.arch} · {fileSize(d.size_bytes)}
              </span>
            </div>
            <em className="flex-none border border-ink px-2.5 py-1 text-[13px] not-italic group-hover/dl:bg-ink group-hover/dl:text-bg">
              Download
            </em>
          </a>
          {d.sha256 && (
            <details className="px-4 pb-2 text-xs text-mute">
              <summary className="cursor-pointer select-none hover:text-ink">SHA-256</summary>
              <div className="mt-1 flex items-start gap-2">
                <code className="min-w-0 flex-1 break-all font-mono">{d.sha256}</code>
                <CopyButton text={d.sha256} className="border border-line px-2 py-0.5 text-xs hover:border-ink" />
              </div>
            </details>
          )}
        </div>
      ))}
    </Group>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="m-0 border-b border-line bg-bg px-4 py-2 text-[13px] font-normal text-mute">{title}</h3>
      {children}
    </section>
  );
}

function CmdRow({ title, cmd, hint, mine }: { title: string; cmd: string; hint?: string; mine?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 border-b border-line px-4 py-3 transition-colors hover:bg-hover ${mine ? "bg-hover/60" : ""}`}>
      <div className="min-w-0">
        <strong className="block text-sm">
          {title}
          {hint && <span className="ml-1.5 text-xs font-normal text-mute">{hint}</span>}
          {mine && <Mine />}
        </strong>
        <code className="block overflow-x-auto whitespace-nowrap font-mono text-xs text-mute">{cmd}</code>
      </div>
      <CopyButton text={cmd} className="border border-ink bg-transparent px-2.5 py-1 hover:bg-ink hover:text-bg" />
    </div>
  );
}

const Mine = () => (
  <span className="ml-1.5 inline border border-accent px-1.5 align-[1px] text-[11px] font-normal text-accent">
    Your system
  </span>
);
