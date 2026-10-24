export const ADMIN_HOME_PATH = "/admin/overview";
export const ADMIN_LOGIN_PATH = "/admin/login";

/**
 * Validates a post-login `next` parameter. Only same-origin paths inside the
 * admin app are allowed, which prevents open redirects such as
 * `?next=//evil.example` or `?next=https://evil.example`.
 */
export function safeAdminRedirect(next: string | null | undefined): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 512) return ADMIN_HOME_PATH;

  // Reject protocol-relative URLs, backslash tricks and control characters.
  if (next.startsWith("//") || next.includes("\\") || /[\u0000-\u001f\u007f]/.test(next)) {
    return ADMIN_HOME_PATH;
  }

  let url: URL;
  try {
    url = new URL(next, "http://admin.invalid");
  } catch {
    return ADMIN_HOME_PATH;
  }

  if (url.origin !== "http://admin.invalid") return ADMIN_HOME_PATH;
  if (!(url.pathname === "/admin" || url.pathname.startsWith("/admin/"))) return ADMIN_HOME_PATH;
  if (url.pathname === ADMIN_LOGIN_PATH) return ADMIN_HOME_PATH;

  return `${url.pathname}${url.search}${url.hash}`;
}
