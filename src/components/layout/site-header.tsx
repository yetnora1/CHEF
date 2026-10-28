import { getLocale, getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { siteNavigation, type SiteNavKey } from "@/features/cms/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileNav, type NavItem } from "./mobile-nav";
import { NavLink } from "./nav-link";

// The header links are all light green (owner's request); the flag and theme toggle keep their own hues.
const NAV_HUES: Record<string, string> = {
  about: "hue-green",
  services: "hue-green",
  menu: "hue-green",
  gallery: "hue-green",
  journal: "hue-green",
  contact: "hue-green",
} satisfies Record<SiteNavKey, string>;

export async function SiteHeader() {
  const t = await getTranslations("Navigation");
  const tBrand = await getTranslations("Brand");

  const links: NavItem[] = (await siteNavigation(await getLocale())).map((link) => ({
    ...link,
    label: t(link.key),
  }));

  // A floating glass bar, aligned with the page content below it.
  return (
    <header className="sticky top-0 z-40 pt-3">
      <div className="page-container">
        <div className="flex h-16 items-center justify-between gap-4 rounded-2xl border border-border glass-thick pr-2 pl-3 sm:pr-3 sm:pl-4">
          <Link href="/" aria-label={tBrand("homeLink")} className="rounded-lg">
            <Wordmark tagline={tBrand("tagline")} />
          </Link>

          {/* Inline from lg: with every section published, five links do not fit beside the actions on tablets. */}
          <nav aria-label={t("primaryLabel")} className="hidden lg:block">
            {/* Each link is a tinted button in its own colour; the current page carries a ring. */}
            <ul className="flex items-center gap-2">
              {links.map((link) => (
                <li key={link.key}>
                  <NavLink
                    href={link.href}
                    className={cn(
                      buttonVariants({ variant: "tint", size: "sm" }),
                      NAV_HUES[link.key] ?? "hue-sky",
                      "aria-[current]:ring-2 aria-[current]:ring-(--tint-border) aria-[current]:ring-offset-2 aria-[current]:ring-offset-transparent",
                    )}
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <LocaleSwitcher className="hidden sm:inline-flex" />
            <ThemeToggle />
            {/* No "Plan an event" button here (owner's request, 2026-10-28): the event form is
                reached from the homepage's call to action, this phone menu and the footer. */}
            <MobileNav
              links={[...links, { key: "book", href: "/book", label: t("planEvent") }]}
              labels={{ open: t("openMenu"), close: t("closeMenu"), title: t("menuTitle") }}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
