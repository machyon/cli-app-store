import type { NextRequest } from "next/server";
import { ApiError, clientIp, fail, handle, ok, parse, parseJsonBody, rateLimit } from "@/lib/api";
import { recordDownloadEvent } from "@/lib/repo";
import { DownloadEventBodySchema, DownloadEventParamsSchema } from "@/lib/schemas";

export const POST = handle(
  async (request: NextRequest, ctx: RouteContext<"/api/apps/[slug]/downloads/[assetId]/events">) => {
    const ip = clientIp(request) ?? "unknown";
    const retryAfter = rateLimit(`download-event:${ip}`, 30, 60_000);
    if (retryAfter !== null) {
      return fail("rate_limited", "Too many requests", undefined, { "Retry-After": String(retryAfter) });
    }

    const { slug, assetId } = parse(DownloadEventParamsSchema, await ctx.params, "path parameters");
    const body = await parseJsonBody(DownloadEventBodySchema, request);
    const recorded = await recordDownloadEvent(slug, assetId, body);
    if (!recorded) throw new ApiError("not_found", "No such download asset for this app");
    return ok({ recorded: true }, 201);
  },
);
