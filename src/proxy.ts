import { NextResponse, type NextRequest } from "next/server";

/* Runs only for /admin pages (see matcher).
 * 1. Strict, nonce-based Content-Security-Policy. Admin pages are rendered per
 *    request anyway (they read the session), so a fresh nonce costs nothing.
 *    Public pages keep the static CSP from next.config.ts so they stay prerendered.
 * 2. Early redirect to the login page when there is no session cookie. This is a
 *    UX shortcut only; every admin page and API call still checks the session in
 *    src/lib/auth/dal.ts. */

const SESSION_COOKIE = "__Host-admin_session";

function adminCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Dev injects styles without a nonce for hot reload.
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isLogin = pathname === "/admin/login";

  if (!isLogin && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64");
  const csp = adminCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // Next.js reads the nonce from the request CSP header and applies it to its own scripts.
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/admin/:path*",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    "/admin",
  ],
};
