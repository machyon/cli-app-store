"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { OS_LABEL, OS_LIST, compact, type AppSummary, type Category, type OS } from "@/lib/store";
import { GitHubIcon, Glyph, OsTags, StarIcon, StatusBadge } from "./ui";

type Sort = "stars" | "name" | "recent";

export function Catalog({ apps, categories }: { apps: AppSummary[]; categories: Category[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [os, setOs] = useState<OS | "any">("any");
  const [sort, setSort] = useState<Sort>("stars");
  const input = useRef<HTMLInputElement>(null);
  const dq = useDeferredValue(q);

  // "/" focuses search, like most dev tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(t.tagName)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: apps.length };
    for (const a of apps) m[a.category_slug] = (m[a.category_slug] ?? 0) + 1;
    return m;
  }, [apps]);

  const results = useMemo(() => {
    const terms = dq.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const r = apps.filter((a) => {
      if (cat !== "all" && a.category_slug !== cat) return false;
      if (os !== "any" && !a.support.includes(os)) return false;
      const hay = [a.name, a.tagline, a.category, a.language ?? ""].join(" ").toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
    return r.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "recent"
          ? (b.latest_released_at ?? "").localeCompare(a.latest_released_at ?? "")
          : b.stars_count - a.stars_count,
    );
  }, [apps, dq, cat, os, sort]);

  const filtered = q || cat !== "all" || os !== "any";
  const reset = () => {
    setQ("");
    setCat("all");
    setOs("any");
    input.current?.focus();
  };
  const activeCat = categories.find((c) => c.slug === cat);

  const chip =
    "cursor-pointer border px-3 py-1 text-[13px] transition-colors aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-bg";

  return (
    <>
      <section className="pt-[clamp(40px,8vw,88px)] pb-8">
        <h1 className="mb-3 max-w-[16em] text-[clamp(28px,5vw,48px)] leading-[1.1] font-bold tracking-[-0.03em]">
          Find terminal apps worth installing.
        </h1>
        <p className="mb-7 max-w-[36em] text-mute">
          Browse command-line tools by category, check supported systems, and install with one command.
        </p>
        <label className="flex max-w-[640px] items-center border border-ink bg-surface font-mono focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent">
          <span aria-hidden="true" className="pr-1 pl-4 font-bold text-accent">$</span>
          <input
            ref={input}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            placeholder="search apps, e.g. fuzzy, git, rust"
            autoComplete="off"
            spellCheck={false}
            aria-label="Search apps"
            className="min-w-0 flex-1 bg-transparent py-4 pr-4 pl-2 text-base text-ink caret-accent outline-none placeholder:text-mute/70 [&::-webkit-search-cancel-button]:hidden"
          />
          {q ? (
            <button
              type="button"
              onClick={() => { setQ(""); input.current?.focus(); }}
              className="mr-3 cursor-pointer px-2 text-[13px] text-mute hover:text-ink"
            >
              clear
            </button>
          ) : (
            <kbd className="mr-4 hidden border border-line px-1.5 text-xs text-mute sm:inline" title="Press / to search">/</kbd>
          )}
        </label>
      </section>

      <div className="mb-6 flex flex-col gap-3 border-y border-line py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
            {[{ slug: "all", name: "All" }, ...categories].map((c) => (
              <button
                key={c.slug}
                type="button"
                aria-pressed={cat === c.slug}
                onClick={() => setCat(c.slug)}
                className={`${chip} border-line hover:bg-hover`}
              >
                {c.name}
                <span className="ml-1.5 opacity-60">{counts[c.slug] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Operating system">
            <span className="text-mute">Runs on</span>
            {(["any", ...OS_LIST] as const).map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={os === o}
                onClick={() => setOs(o)}
                className={`${chip} border-line px-2.5 py-0.5 text-xs hover:bg-hover`}
              >
                {o === "any" ? "Any" : OS_LABEL[o]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-mute" aria-live="polite">
              {results.length} {results.length === 1 ? "app" : "apps"}
            </span>
            <label className="flex items-center gap-2 text-mute">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="cursor-pointer border border-line bg-surface px-1.5 py-1 text-xs text-ink"
              >
                <option value="stars">Most stars</option>
                <option value="recent">Latest release</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </div>
        </div>
        {activeCat?.description && (
          <p className="text-[13px] text-mute">{activeCat.description}</p>
        )}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,300px),1fr))] gap-4">
        {results.length ? (
          results.map((a, i) => <AppCard key={a.id} app={a} index={i} />)
        ) : (
          <div className="col-span-full border border-line p-10 text-center text-mute">
            <p className="mb-4">No apps match {q ? <>“<span className="font-mono text-ink">{q}</span>”</> : "these filters"}.</p>
            {filtered && (
              <button type="button" onClick={reset} className="cursor-pointer border border-ink px-3 py-1 text-[13px] text-ink hover:bg-ink hover:text-bg">
                Clear search and filters
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function AppCard({ app: a, index }: { app: AppSummary; index: number }) {
  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      className="group relative flex animate-fade flex-col rounded-xl border border-line bg-surface p-5 transition-[border-color,transform] duration-200 focus-within:border-ink hover:-translate-y-0.5 hover:border-ink"
    >
      <div className="mb-3 flex items-center gap-3">
        <Glyph name={a.name} />
        <div className="min-w-0">
          <h3 className="m-0 font-mono text-base leading-tight">
            {/* Stretched link: whole card is clickable without nesting <a> */}
            <Link href={`/apps/${a.slug}`} className="outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-accent">
              {a.name}
            </Link>
          </h3>
          <span className="font-mono text-xs text-mute">
            {a.latest_version ? `v${a.latest_version}` : "no release"} · {a.category}
          </span>
        </div>
        <StatusBadge status={a.status} className="ml-auto" />
      </div>
      <p className="mb-4 flex-1 text-sm text-mute">{a.tagline}</p>
      <div className="mb-4">
        <OsTags support={a.support} />
      </div>
      <div className="flex items-center justify-between border-t border-line pt-3 text-[13px] text-mute">
        <span className="inline-flex items-center gap-1.5" title={`${a.stars_count.toLocaleString("en-US")} GitHub stars`}>
          <StarIcon />
          {compact(a.stars_count)}
          {a.language && <span className="ml-2">{a.language}</span>}
        </span>
        {a.github_url && (
          <a
            href={a.github_url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${a.name} on GitHub`}
            className="relative z-10 inline-flex items-center gap-1.5 border border-line px-2.5 py-1 text-ink transition-colors hover:border-ink hover:bg-hover"
          >
            <GitHubIcon />
            GitHub
          </a>
        )}
      </div>
    </article>
  );
}
