"use client";

import { createContext, use, useCallback, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export interface AdminUser {
  id: string;
  email: string;
  display_name: string | null;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
}

interface Ctx {
  admin: AdminUser;
  request: <T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown) => Promise<ApiResult<T>>;
  setCsrfToken: (token: string) => void;
}

const AdminContext = createContext<Ctx | null>(null);

export function AdminProvider({
  admin,
  csrfToken,
  children,
}: {
  admin: AdminUser;
  csrfToken: string;
  children: ReactNode;
}) {
  const router = useRouter();
  // Held in memory only (not localStorage), so other scripts on the origin can't read it later.
  const csrf = useRef(csrfToken);

  const request = useCallback(
    async <T,>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<ApiResult<T>> => {
      let res: Response;
      try {
        res = await fetch(path, {
          method,
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            ...(body !== undefined && { "Content-Type": "application/json" }),
            ...(method !== "GET" && { "x-csrf-token": csrf.current }),
          },
          ...(body !== undefined && { body: JSON.stringify(body) }),
        });
      } catch {
        return { ok: false, status: 0, data: null, error: { code: "network", message: "Network error. Check your connection." } };
      }
      if (res.status === 401) {
        router.replace("/admin/login");
        return { ok: false, status: 401, data: null, error: { code: "unauthorized", message: "Your session ended. Sign in again." } };
      }
      const json: unknown = await res.json().catch(() => null);
      if (res.ok) return { ok: true, status: res.status, data: json as T, error: null };
      const error =
        json && typeof json === "object" && "error" in json
          ? (json as { error: ApiResult<T>["error"] }).error
          : { code: "unknown", message: `Request failed (${res.status})` };
      return { ok: false, status: res.status, data: null, error };
    },
    [router],
  );

  const setCsrfToken = useCallback((token: string) => {
    csrf.current = token;
  }, []);

  return <AdminContext value={{ admin, request, setCsrfToken }}>{children}</AdminContext>;
}

export function useAdmin(): Ctx {
  const ctx = use(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside <AdminProvider>");
  return ctx;
}
