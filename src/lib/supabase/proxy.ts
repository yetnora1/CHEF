import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_LOGIN_PATH } from "@/lib/auth/redirect";
import { AUTH_COOKIE_OPTIONS, getSupabasePublicConfig } from "./config";

/**
 * Runs in the proxy for /admin routes: refreshes an expiring Supabase session
 * and writes the new cookies, then redirects visitors without a valid session
 * to the login page.
 *
 * The redirect is an optimisation, not the security boundary. Every admin page
 * and server action re-verifies the user and their permissions on the server
 * (src/lib/auth/staff-session.ts), and Postgres RLS enforces access to data.
 */
export async function refreshAdminSession(request: NextRequest): Promise<NextResponse> {
  const config = getSupabasePublicConfig();
  const isLoginPage = request.nextUrl.pathname === ADMIN_LOGIN_PATH;
  let response = NextResponse.next({ request });

  // Unconfigured: nobody can be signed in. The login page explains what is missing.
  if (!config) return isLoginPage ? noStore(response) : redirectToLogin(request, response);

  const supabase = createServerClient(config.url, config.publishableKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Validates the JWT and refreshes it if needed. Keep this immediately after
  // creating the client so refreshed cookies are written before responding.
  const { data } = await supabase.auth.getClaims();
  const signedIn = typeof data?.claims?.sub === "string";

  if (!signedIn && !isLoginPage) return redirectToLogin(request, response);

  return noStore(response);
}

function redirectToLogin(request: NextRequest, pending: NextResponse): NextResponse {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = ADMIN_LOGIN_PATH;
  loginUrl.search = "";
  loginUrl.searchParams.set("next", request.nextUrl.pathname);
  const redirect = NextResponse.redirect(loginUrl);
  // Carry over any cookie changes (e.g. a cleared, expired session).
  for (const cookie of pending.cookies.getAll()) redirect.cookies.set(cookie);
  return noStore(redirect);
}

function noStore(response: NextResponse): NextResponse {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
