import { Catalog } from "@/components/Catalog";
import { apps, categories } from "@/lib/store";

export default function Home() {
  return <Catalog apps={apps} categories={categories} />;
}
