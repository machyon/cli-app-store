import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/LoginForm";
import { getSession } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Admin sign in" };

// Reads the session at request time, so it must block rather than prerender.
export const instant = false;

export default async function LoginPage() {
  if (await getSession()) redirect("/admin");
  return (
    <div className="mx-auto max-w-sm pt-10">
      <pre className="mb-6 font-mono text-sm text-mute">
        <span className="text-accent">$</span> sudo tty.store admin
      </pre>
      <h1 className="mb-6 text-2xl font-bold tracking-tight">Sign in</h1>
      <LoginForm />
    </div>
  );
}
