import type { NextRequest } from "next/server";
import { handle, ok, parseQuery } from "@/lib/api";
import { listApps } from "@/lib/repo";
import { ListAppsQuerySchema } from "@/lib/schemas";

export const GET = handle(async (request: NextRequest) => {
  const query = parseQuery(ListAppsQuerySchema, request.nextUrl);
  const { data, total } = await listApps(query);
  return ok({ data, pagination: { total, limit: query.limit, offset: query.offset } });
});
