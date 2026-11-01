import type { NextRequest } from "next/server";
import { ApiError, handle, ok, parse } from "@/lib/api";
import { getAppBySlug } from "@/lib/repo";
import { SlugParamsSchema } from "@/lib/schemas";

export const GET = handle(async (_request: NextRequest, ctx: RouteContext<"/api/apps/[slug]">) => {
  const { slug } = parse(SlugParamsSchema, await ctx.params, "path parameters");
  const app = await getAppBySlug(slug);
  if (!app) throw new ApiError("not_found", `No app with slug "${slug}"`);
  return ok(app);
});
