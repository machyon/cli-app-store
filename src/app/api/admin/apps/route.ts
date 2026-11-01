import type { NextRequest } from "next/server";
import { adminHandle, clientIp, ok, parseJsonBody } from "@/lib/api";
import { createApp, listAppsAdmin } from "@/lib/admin-repo";
import { requireAdmin, requireAdminMutation } from "@/lib/auth/dal";
import { AppInputSchema } from "@/lib/schemas/admin";

/** All apps, including unpublished ones. */
export const GET = adminHandle(async () => {
  await requireAdmin();
  return ok({ data: await listAppsAdmin() });
});

export const POST = adminHandle(async (request: NextRequest) => {
  const session = await requireAdminMutation(request);
  const input = await parseJsonBody(AppInputSchema, request, { requireJsonType: true });
  const created = await createApp(input, { adminId: session.admin.id, ip: clientIp(request) });
  return ok(created, 201, { Location: `/api/admin/apps/${created.id}` });
});
