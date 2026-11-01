import type { NextRequest } from "next/server";
import { cacheable, handle, parseQuery } from "@/lib/api";
import { listApps } from "@/lib/repo";
import { ListAppsQuerySchema } from "@/lib/schemas";

export const GET = handle(async (request: NextRequest) => {
  const query = parseQuery(ListAppsQuerySchema, request.nextUrl);
  const { data, total } = await listApps(query);
  return cacheable({ data, pagination: { total, limit: query.limit, offset: query.offset } }, 60);
});
