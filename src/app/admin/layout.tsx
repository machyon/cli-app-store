import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Admin pages always render per request: they depend on the session, and the
// nonce-based CSP from src/proxy.ts can only be applied to dynamically rendered HTML.
export const instant = false;

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await connection();
  return <div className="py-8">{children}</div>;
}
