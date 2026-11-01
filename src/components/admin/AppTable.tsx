"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAdmin } from "@/components/admin/AdminContext";
import { Alert, inputClass } from "@/components/admin/fields";
import { StatusBadge } from "@/components/ui";
import type { AdminAppRow } from "@/lib/schemas/admin";
import { date } from "@/lib/store";

export function AppTable({ apps }: { apps: AdminAppRow[] }) {
  const { request } = useAdmin();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? apps.filter((a) => a.name.toLowerCase().includes(needle) || a.slug.includes(needle)) : apps;
  }, [apps, q]);

  async function remove(app: AdminAppRow) {
    const ok = window.confirm(
      `Delete "${app.name}"?\n\nThis also deletes its features, demo, packages, releases, release assets and download history. It can't be undone.`,
    );
    if (!ok) return;
    setDeleting(app.id);
    setError(null);
    const res = await request("DELETE", `/api/admin/apps/${app.id}`);
    setDeleting(null);
    if (!res.ok) {
      setError(res.error?.message ?? "Delete failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert>{error}</Alert>}
      <label className="sr-only" htmlFor="admin-search">
        Filter apps
      </label>
      <input
        id="admin-search"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Filter by name or slug"
        className={`${inputClass} max-w-xs`}
      />
      <div className="overflow-x-auto border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-xs tracking-wide text-mute uppercase">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Name</th>
              <th scope="col" className="px-3 py-2 font-medium">Category</th>
              <th scope="col" className="px-3 py-2 font-medium">Status</th>
              <th scope="col" className="px-3 py-2 font-medium">Visibility</th>
              <th scope="col" className="px-3 py-2 font-medium">Updated</th>
              <th scope="col" className="px-3 py-2 font-medium"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id} className="border-b border-line last:border-0 hover:bg-hover">
                <td className="px-3 py-2">
                  <Link href={`/admin/apps/${a.id}`} className="font-mono font-semibold hover:text-accent">
                    {a.name}
                  </Link>
                  <div className="font-mono text-xs text-mute">{a.slug}</div>
                </td>
                <td className="px-3 py-2">{a.category}</td>
                <td className="px-3 py-2"><StatusBadge status={a.status} /></td>
                <td className="px-3 py-2">
                  {a.is_published ? (
                    <span className="text-ok">Published</span>
                  ) : (
                    <span className="text-mute">Unpublished</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-mute">{date(a.updated_at)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link href={`/admin/apps/${a.id}`} className="mr-3 hover:text-accent">Edit</Link>
                  <button
                    type="button"
                    onClick={() => remove(a)}
                    disabled={deleting === a.id}
                    className="text-red-700 hover:underline disabled:opacity-50 dark:text-red-400"
                  >
                    {deleting === a.id ? "Deleting…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-mute">No apps match.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
