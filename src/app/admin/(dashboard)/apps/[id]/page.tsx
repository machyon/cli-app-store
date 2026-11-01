import { notFound } from "next/navigation";
import { AppForm } from "@/components/admin/AppForm";
import { getAppForEdit, getLookups } from "@/lib/admin-repo";
import { requireAdminPage } from "@/lib/auth/dal";
import { AppIdParamsSchema } from "@/lib/schemas/admin";
import { date } from "@/lib/store";

export default async function EditAppPage(props: PageProps<"/admin/apps/[id]">) {
  await requireAdminPage();
  const params = AppIdParamsSchema.safeParse(await props.params);
  if (!params.success) notFound();

  const [app, lookups] = await Promise.all([getAppForEdit(params.data.id), getLookups()]);
  if (!app) notFound();

  return (
    <div className="animate-fade">
      <h1 className="text-2xl font-bold tracking-tight">
        Edit <span className="font-mono">{app.name}</span>
      </h1>
      <p className="mb-6 text-sm text-mute">
        Created {date(app.created_at)} · last updated {date(app.updated_at)}
      </p>
      <AppForm lookups={lookups} app={app} />
    </div>
  );
}
