import { AppForm } from "@/components/admin/AppForm";
import { getLookups } from "@/lib/admin-repo";
import { requireAdminPage } from "@/lib/auth/dal";

export default async function NewAppPage() {
  await requireAdminPage();
  const lookups = await getLookups();
  return (
    <div className="animate-fade">
      <h1 className="mb-6 text-2xl font-bold tracking-tight">New app</h1>
      <AppForm lookups={lookups} />
    </div>
  );
}
