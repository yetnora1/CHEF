import "server-only";
import type { ComponentProps } from "react";
import { HOME_SECTIONS } from "@/features/content/home-sections";
import type { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { getPublicNavigation } from "./public-data";

type Href = ComponentProps<typeof Link>["href"];
export type SiteNavKey = "about" | "services" | "menu" | "gallery" | "journal" | "contact";

/**
 * Public navigation links. A section's own page is linked only once it has
 * published content (in this language or English); until then About and
 * Services keep pointing at the homepage sections, and the others are hidden.
 * Contact is a static page and always linked.
 */
export async function siteNavigation(locale: AppLocale): Promise<{ key: SiteNavKey; href: Href }[]> {
  const available = (await getPublicNavigation().catch(() => null))?.[locale];
  return [
    { key: "about", href: available?.about ? "/about" : { pathname: "/", hash: HOME_SECTIONS.about } },
    {
      key: "services",
      href: available?.services ? "/services" : { pathname: "/", hash: HOME_SECTIONS.services },
    },
    ...(available?.menu ? [{ key: "menu" as const, href: "/menu" }] : []),
    ...(available?.gallery ? [{ key: "gallery" as const, href: "/gallery" }] : []),
    ...(available?.journal ? [{ key: "journal" as const, href: "/journal" }] : []),
    { key: "contact", href: "/contact" },
  ];
}
