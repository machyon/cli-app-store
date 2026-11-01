import { connection } from "next/server";
import { fail, handle, ok } from "@/lib/api";
import { databaseNow } from "@/lib/repo";

export const GET = handle(async () => {
  await connection();
  try {
    return ok({ status: "ok", database: "connected", now: await databaseNow() });
  } catch (err) {
    console.error("Health check failed:", err);
    return fail("unavailable", "Database unreachable");
  }
});
