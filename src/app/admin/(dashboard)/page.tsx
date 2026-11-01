import Link from "next/link";
import { AppTable } from "@/components/admin/AppTable";
import { listAppsAdmin } from "@/lib/admin-repo";
import { requireAdminPage } from "@/lib/auth/dal";

// Reads the session at request time, so it must block rather than prerender.
export const instant = false;

export default async function AdminAppsPage() {
  await requireAdminPage();
  const apps = await listAppsAdmin();
  return (
    <div className="animate-fade">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Apps</h1>
          <p className="text-sm text-mute">
            {apps.length} total, {apps.filter((a) => !a.is_published).length} unpublished
          </p>
        </div>
        <Link href="/admin/apps/new" className="border border-ink bg-ink px-4 py-2 text-sm text-bg hover:opacity-85">
          New app
        </Link>
      </div>
      <AppTable apps={apps} />
    </div>
  );
}
