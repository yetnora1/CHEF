/**
 * CSRF guard for state-changing Route Handlers (Server Actions get Next.js's
 * own Origin check). Requires the browser's Fetch Metadata, when sent, to say
 * same-origin, and the Origin header to match the host the request came to.
 * Requests without either signal are refused.
 */
export function isSameOriginRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;

  const origin = request.headers.get("origin");
  if (!origin) return site === "same-origin";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}
