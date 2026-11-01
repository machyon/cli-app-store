import type { NextRequest } from "next/server";
import { adminHandle, ApiError, clientIp, ok, parse, parseJsonBody } from "@/lib/api";
import { deleteApp, getAppForEdit, updateApp } from "@/lib/admin-repo";
import { requireAdmin, requireAdminMutation } from "@/lib/auth/dal";
import { AppIdParamsSchema, AppUpdateSchema } from "@/lib/schemas/admin";

type Ctx = RouteContext<"/api/admin/apps/[id]">;

export const GET = adminHandle(async (_request: NextRequest, ctx: Ctx) => {
  await requireAdmin();
  const { id } = parse(AppIdParamsSchema, await ctx.params, "path parameters");
  const app = await getAppForEdit(id);
  if (!app) throw new ApiError("not_found", "No such app");
  return ok(app);
});

/** Full replacement of the app and its child data. Requires expected_updated_at (optimistic locking). */
export const PUT = adminHandle(async (request: NextRequest, ctx: Ctx) => {
  const session = await requireAdminMutation(request);
  const { id } = parse(AppIdParamsSchema, await ctx.params, "path parameters");
  const input = await parseJsonBody(AppUpdateSchema, request, { requireJsonType: true });
  return ok(await updateApp(id, input, { adminId: session.admin.id, ip: clientIp(request) }));
});

/** Deletes the app and, by cascade, its child data, releases and download history. */
export const DELETE = adminHandle(async (request: NextRequest, ctx: Ctx) => {
  const session = await requireAdminMutation(request);
  const { id } = parse(AppIdParamsSchema, await ctx.params, "path parameters");
  await deleteApp(id, { adminId: session.admin.id, ip: clientIp(request) });
  return ok({ deleted: true });
});
