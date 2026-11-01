import { PasswordForm } from "@/components/admin/PasswordForm";
import { requireAdminPage } from "@/lib/auth/dal";

// Reads the session at request time, so it must block rather than prerender.
export const instant = false;

export default async function AccountPage() {
  const { admin } = await requireAdminPage();
  return (
    <div className="max-w-md animate-fade">
      <h1 className="mb-1 text-2xl font-bold tracking-tight">Account</h1>
      <p className="mb-6 text-sm text-mute">Signed in as {admin.email}</p>
      <h2 className="mb-4 text-lg font-semibold">Change password</h2>
      <PasswordForm email={admin.email} />
    </div>
  );
}
