import { ok } from "@/lib/api";
import { generateOpenApiDocument } from "@/lib/openapi";

export const GET = (): Response => ok(generateOpenApiDocument());
