"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useAdmin } from "@/components/admin/AdminContext";

const LINKS = [
  { href: "/admin", label: "Apps" },
  { href: "/admin/apps/new", label: "New app" },
  { href: "/admin/account", label: "Account" },
];

export function AdminNav() {
  const { admin, request } = useAdmin();
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    await request("DELETE", "/api/admin/session");
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
      <nav aria-label="Admin" className="flex flex-wrap items-center gap-1 text-sm">
        <span className="mr-3 font-mono text-xs tracking-wider text-mute uppercase">Admin</span>
        {LINKS.map((l) => {
          const active = l.href === "/admin" ? pathname === "/admin" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={
                "border px-3 py-1 transition-colors " +
                (active ? "border-ink bg-ink text-bg" : "border-transparent text-mute hover:text-ink")
              }
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-3 text-sm text-mute">
        <span title={admin.email}>{admin.display_name ?? admin.email}</span>
        <button
          type="button"
          onClick={signOut}
          disabled={busy}
          className="border border-line px-3 py-1 text-ink transition-colors hover:border-ink disabled:opacity-50"
        >
          {busy ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
