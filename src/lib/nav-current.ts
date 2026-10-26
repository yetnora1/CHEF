/**
 * aria-current for a public navigation link: "page" on the page itself, "true"
 * on pages inside its section (a service page under Services), nothing
 * otherwise. Links to a homepage section (an object href or a "#hash") point
 * inside a page, so they are never current. The homepage is current only on
 * itself, not on every page below it.
 */
export function navCurrent(pathname: string, href: unknown): "page" | "true" | undefined {
  if (typeof href !== "string" || href.includes("#")) return undefined;
  if (pathname === href) return "page";
  if (href !== "/" && pathname.startsWith(`${href}/`)) return "true";
  return undefined;
}
