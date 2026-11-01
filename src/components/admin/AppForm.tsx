"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useAdmin } from "@/components/admin/AdminContext";
import { Alert, Field, inputClass, primaryButton, secondaryButton } from "@/components/admin/fields";
import type { AdminApp, AppInput, Lookups } from "@/lib/schemas/admin";
import { OS_LABEL, OS_LIST, STATUS_LABEL, type OS, type Status } from "@/lib/store";

const STATUSES = Object.keys(STATUS_LABEL) as Status[];

/** Collects every message under one top-level field of a z.treeifyError() tree. */
function messagesFor(details: unknown, key: string): string | undefined {
  const node = (details as { properties?: Record<string, unknown> } | undefined)?.properties?.[key];
  const out: string[] = [];
  const walk = (n: unknown, path: string) => {
    if (!n || typeof n !== "object") return;
    const { errors, properties, items } = n as {
      errors?: string[];
      properties?: Record<string, unknown>;
      items?: unknown[];
    };
    for (const e of errors ?? []) out.push(path ? `${path}: ${e}` : e);
    for (const [k, v] of Object.entries(properties ?? {})) walk(v, path ? `${path}.${k}` : k);
    (items ?? []).forEach((v, i) => walk(v, path ? `${path}[${i + 1}]` : `line ${i + 1}`));
  };
  walk(node, "");
  return out.length ? out.join("; ") : undefined;
}

const lines = (s: string): string[] =>
  s
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l, i, all) => l !== "" || (i > 0 && i < all.length - 1)); // keep inner blank lines only

export function AppForm({ lookups, app }: { lookups: Lookups; app?: AdminApp }) {
  const { request } = useAdmin();
  const router = useRouter();

  const [slug, setSlug] = useState(app?.slug ?? "");
  const [name, setName] = useState(app?.name ?? "");
  const [tagline, setTagline] = useState(app?.tagline ?? "");
  const [about, setAbout] = useState(app?.about ?? "");
  const [categoryId, setCategoryId] = useState(String(app?.category_id ?? lookups.categories[0]?.id ?? ""));
  const [languageId, setLanguageId] = useState(app?.language_id == null ? "" : String(app.language_id));
  const [status, setStatus] = useState<Status>(app?.status ?? "stable");
  const [owner, setOwner] = useState(app?.github_owner ?? "");
  const [repo, setRepo] = useState(app?.github_repo ?? "");
  const [published, setPublished] = useState(app?.is_published ?? false);
  const [features, setFeatures] = useState((app?.features ?? []).join("\n"));
  const [demo, setDemo] = useState((app?.demo ?? []).join("\n"));
  const [os, setOs] = useState<Set<OS>>(new Set(app?.os ?? []));
  const [licenses, setLicenses] = useState<Set<number>>(new Set(app?.license_ids ?? []));
  const [packages, setPackages] = useState<Record<number, { name: string; override: string }>>(() =>
    Object.fromEntries(
      (app?.packages ?? []).map((p) => [p.package_manager_id, { name: p.package_name, override: p.command_override ?? "" }]),
    ),
  );
  const [updatedAt, setUpdatedAt] = useState(app?.updated_at ?? "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<unknown>(undefined);
  const [saved, setSaved] = useState(false);

  const err = (key: keyof AppInput) => messagesFor(details, key);
  const aria = (id: string, key: keyof AppInput) => ({
    "aria-invalid": err(key) ? true : undefined,
    "aria-describedby": err(key) ? `${id}-error` : `${id}-hint`,
  });

  const toggle = <T,>(set: Set<T>, value: T): Set<T> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  function payload(): AppInput {
    return {
      slug: slug.trim(),
      name: name.trim(),
      tagline: tagline.trim(),
      about: about.trim(),
      category_id: Number(categoryId),
      language_id: languageId === "" ? null : Number(languageId),
      status,
      github_owner: owner.trim(),
      github_repo: repo.trim(),
      is_published: published,
      features: lines(features).filter((l) => l.trim() !== ""),
      demo: lines(demo),
      os: OS_LIST.filter((o) => os.has(o)),
      license_ids: [...licenses].sort((a, b) => a - b),
      packages: Object.entries(packages)
        .filter(([, p]) => p.name.trim() !== "")
        .map(([id, p]) => ({
          package_manager_id: Number(id),
          package_name: p.name.trim(),
          command_override: p.override.trim() === "" ? null : p.override.trim(),
        })),
    };
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDetails(undefined);
    setSaved(false);

    const body = payload();
    const res = app
      ? await request<{ slug: string; updated_at: string }>("PUT", `/api/admin/apps/${app.id}`, {
          ...body,
          expected_updated_at: updatedAt,
        })
      : await request<{ id: string }>("POST", "/api/admin/apps", body);
    setBusy(false);

    if (!res.ok || !res.data) {
      setError(res.error?.message ?? "Save failed");
      setDetails(res.error?.details);
      return;
    }
    if (app) {
      setUpdatedAt((res.data as { updated_at: string }).updated_at);
      setSaved(true);
      router.refresh();
    } else {
      router.push(`/admin/apps/${(res.data as { id: string }).id}`);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-8" aria-busy={busy}>
      {error && (
        <Alert>
          {error}
          {error.startsWith("This app was changed") && (
            <>
              {" "}
              <button type="button" className="underline" onClick={() => window.location.reload()}>
                Reload
              </button>
            </>
          )}
        </Alert>
      )}
      {saved && <Alert kind="ok">Saved. Public pages are refreshed.</Alert>}

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold">Basics</legend>
        <Field id="name" label="Name" error={err("name")}>
          <input id="name" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} {...aria("name", "name")} />
        </Field>
        <Field id="slug" label="Slug" hint="Lowercase letters, digits and dashes. Used in the URL." error={err("slug")}>
          <input id="slug" required maxLength={100} pattern="[a-z0-9][a-z0-9\-]*" value={slug} onChange={(e) => setSlug(e.target.value)} className={`${inputClass} font-mono`} {...aria("slug", "slug")} />
        </Field>
        <div className="sm:col-span-2">
          <Field id="tagline" label="Tagline" error={err("tagline")}>
            <input id="tagline" required maxLength={200} value={tagline} onChange={(e) => setTagline(e.target.value)} className={inputClass} {...aria("tagline", "tagline")} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field id="about" label="About" error={err("about")}>
            <textarea id="about" required maxLength={5000} rows={5} value={about} onChange={(e) => setAbout(e.target.value)} className={inputClass} {...aria("about", "about")} />
          </Field>
        </div>
        <Field id="category" label="Category" error={err("category_id")}>
          <select id="category" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputClass} {...aria("category", "category_id")}>
            {lookups.categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field id="language" label="Language" error={err("language_id")}>
          <select id="language" value={languageId} onChange={(e) => setLanguageId(e.target.value)} className={inputClass} {...aria("language", "language_id")}>
            <option value="">—</option>
            {lookups.languages.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </Field>
        <Field id="status" label="Status" error={err("status")}>
          <select id="status" value={status} onChange={(e) => setStatus(e.target.value as Status)} className={inputClass} {...aria("status", "status")}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </Field>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Published (visible in the public catalog)
          </label>
        </div>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold">GitHub</legend>
        <Field id="owner" label="Owner" error={err("github_owner")}>
          <input id="owner" required maxLength={39} value={owner} onChange={(e) => setOwner(e.target.value)} className={`${inputClass} font-mono`} {...aria("owner", "github_owner")} />
        </Field>
        <Field id="repo" label="Repository" hint={owner && repo ? `https://github.com/${owner}/${repo}` : "The URL is built from owner and repository."} error={err("github_repo")}>
          <input id="repo" required maxLength={100} value={repo} onChange={(e) => setRepo(e.target.value)} className={`${inputClass} font-mono`} {...aria("repo", "github_repo")} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="mb-3 text-lg font-semibold">Content</legend>
        <Field id="features" label="Features" hint="One per line, in display order (max 30)." error={err("features")}>
          <textarea id="features" rows={7} value={features} onChange={(e) => setFeatures(e.target.value)} className={inputClass} {...aria("features", "features")} />
        </Field>
        <Field id="demo" label="Demo transcript" hint={'One terminal line per line (max 50). Lines starting with "$ " are shown as prompts.'} error={err("demo")}>
          <textarea id="demo" rows={7} value={demo} onChange={(e) => setDemo(e.target.value)} className={`${inputClass} font-mono`} {...aria("demo", "demo")} />
        </Field>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-lg font-semibold">Platforms & licenses</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">Operating systems</p>
            <div className="flex flex-wrap gap-4">
              {OS_LIST.map((o) => (
                <label key={o} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={os.has(o)} onChange={() => setOs((s) => toggle(s, o))} className="size-4" />
                  {OS_LABEL[o]}
                </label>
              ))}
            </div>
            {err("os") && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{err("os")}</p>}
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Licenses</p>
            <div className="flex flex-wrap gap-4">
              {lookups.licenses.map((l) => (
                <label key={l.id} className="flex items-center gap-2 text-sm" title={l.name}>
                  <input type="checkbox" checked={licenses.has(l.id)} onChange={() => setLicenses((s) => toggle(s, l.id))} className="size-4" />
                  <span className="font-mono">{l.spdx_id}</span>
                </label>
              ))}
            </div>
            {err("license_ids") && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{err("license_ids")}</p>}
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 text-lg font-semibold">Install packages</legend>
        <p className="mb-3 text-xs text-mute">Leave the package name empty to skip a package manager. The override replaces the generated command.</p>
        {err("packages") && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{err("packages")}</p>}
        <div className="overflow-x-auto border border-line bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs tracking-wide text-mute uppercase">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">Manager</th>
                <th scope="col" className="px-3 py-2 font-medium">Package name</th>
                <th scope="col" className="px-3 py-2 font-medium">Command override</th>
              </tr>
            </thead>
            <tbody>
              {lookups.package_managers.map((pm) => {
                const value = packages[pm.id] ?? { name: "", override: "" };
                const set = (patch: Partial<typeof value>) => setPackages((p) => ({ ...p, [pm.id]: { ...value, ...patch } }));
                return (
                  <tr key={pm.id} className="border-b border-line last:border-0">
                    <th scope="row" className="px-3 py-2 font-normal">
                      {pm.name}
                      <div className="font-mono text-xs text-mute">{pm.command_template}</div>
                    </th>
                    <td className="px-3 py-2">
                      <input aria-label={`${pm.name} package name`} maxLength={200} value={value.name} onChange={(e) => set({ name: e.target.value })} className={`${inputClass} font-mono`} />
                    </td>
                    <td className="px-3 py-2">
                      <input aria-label={`${pm.name} command override`} maxLength={300} value={value.override} onChange={(e) => set({ override: e.target.value })} placeholder="optional" className={`${inputClass} font-mono`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button type="submit" disabled={busy} className={primaryButton}>
          {busy ? "Saving…" : app ? "Save changes" : "Create app"}
        </button>
        <Link href="/admin" className={secondaryButton}>Cancel</Link>
        {app?.is_published && (
          <Link href={`/apps/${app.slug}`} className="ml-auto text-sm text-mute hover:text-ink" target="_blank" rel="noopener">
            View public page <span aria-hidden="true">↗</span>
          </Link>
        )}
      </div>
    </form>
  );
}
