import type { NextRequest } from "next/server";
import { ApiError, handle, ok, parse, parseQuery } from "@/lib/api";
import { listDownloads } from "@/lib/repo";
import { DownloadsQuerySchema, SlugParamsSchema } from "@/lib/schemas";

export const GET = handle(
  async (request: NextRequest, ctx: RouteContext<"/api/apps/[slug]/downloads">) => {
    const { slug } = parse(SlugParamsSchema, await ctx.params, "path parameters");
    const filter = parseQuery(DownloadsQuerySchema, request.nextUrl);
    const data = await listDownloads(slug, filter);
    if (!data) throw new ApiError("not_found", `No app with slug "${slug}"`);
    return ok({ data });
  },
);
