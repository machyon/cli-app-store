import { AdminProvider } from "@/components/admin/AdminContext";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdminPage } from "@/lib/auth/dal";
import { csrfTokenFor } from "@/lib/auth/session";

// The session lookup is a request-time database read, so these pages cannot be
// part of a static shell. Allow them to block rather than fail prerendering.
export const instant = false;

export default async function DashboardLayout({ children }: LayoutProps<"/admin">) {
  const session = await requireAdminPage();
  return (
    <AdminProvider admin={session.admin} csrfToken={csrfTokenFor(session.csrfSecret)}>
      <AdminNav />
      {children}
    </AdminProvider>
  );
}
