import { adminHandle, ok } from "@/lib/api";
import { getLookups } from "@/lib/admin-repo";
import { requireAdmin } from "@/lib/auth/dal";

/** Categories, languages, licenses and package managers for the app form. */
export const GET = adminHandle(async () => {
  await requireAdmin();
  return ok(await getLookups());
});
