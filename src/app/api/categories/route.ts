import { cacheable, handle } from "@/lib/api";
import { listCategories } from "@/lib/repo";

export const GET = handle(async () => cacheable({ data: await listCategories() }, 300));
