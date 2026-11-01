import type { NextRequest } from "next/server";
import { ApiError, handle, ok, parse, parseQuery } from "@/lib/api";
import { listInstall } from "@/lib/repo";
import { InstallQuerySchema, SlugParamsSchema } from "@/lib/schemas";

export const GET = handle(
  async (request: NextRequest, ctx: RouteContext<"/api/apps/[slug]/install">) => {
    const { slug } = parse(SlugParamsSchema, await ctx.params, "path parameters");
    const filter = parseQuery(InstallQuerySchema, request.nextUrl);
    const data = await listInstall(slug, filter);
    if (!data) throw new ApiError("not_found", `No app with slug "${slug}"`);
    return ok({ data });
  },
);
