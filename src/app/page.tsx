import { Catalog } from "@/components/Catalog";
import { listApps, listCategories } from "@/lib/repo";
import type { AppSummary } from "@/lib/store";

const PAGE_SIZE = 100; // Maximum page size accepted by the API.

/** Loads every published app, following pagination so the client-side catalog is complete. */
async function listAllApps(): Promise<AppSummary[]> {
  const all: AppSummary[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, total } = await listApps({ sort: "stars", limit: PAGE_SIZE, offset });
    all.push(...data);
    if (data.length === 0 || all.length >= total) return all;
  }
}

export default async function Home() {
  const [apps, categories] = await Promise.all([listAllApps(), listCategories()]);
  return <Catalog apps={apps} categories={categories} />;
}
