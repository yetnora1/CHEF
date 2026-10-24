import type { NextRequest } from "next/server";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";
import { refreshAdminSession } from "@/lib/supabase/proxy";

const handleLocaleRouting = createIntlMiddleware(routing);

export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * - /admin/**: refresh the Supabase session (admin has no locale prefix).
 * - everything else: locale negotiation and redirects for the public site
 *   (e.g. / → /en or /am based on the saved choice, then Accept-Language).
 */
export async function proxy(request: NextRequest) {
  if (isAdminPath(request.nextUrl.pathname)) {
    return refreshAdminSession(request);
  }
  return handleLocaleRouting(request);
}

export const config = {
  // Skip Next.js internals, API routes and files with an extension (robots.txt, icon.svg…).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
