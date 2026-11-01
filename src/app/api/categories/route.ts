import { handle, ok } from "@/lib/api";
import { listCategories } from "@/lib/repo";

export const GET = handle(async () => ok({ data: await listCategories() }));
