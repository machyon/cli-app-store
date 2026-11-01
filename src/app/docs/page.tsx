import type { Metadata } from "next";
import SwaggerClient from "./SwaggerClient";

export const metadata: Metadata = { title: "API docs" };

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl bg-white p-4 text-black">
      <SwaggerClient />
    </div>
  );
}
