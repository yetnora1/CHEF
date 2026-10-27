import { getLocale, getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { siteNavigation, type SiteNavKey } from "@/features/cms/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileNav, type NavItem } from "./mobile-nav";
import { NavLink } from "./nav-link";

// One colour per header link (the flag is teal and the theme toggle indigo, so the
// links visible today never share a colour with them).
const NAV_HUES: Record<string, string> = {
  about: "hue-rose",
  services: "hue-amber",
  menu: "hue-sky",
  gallery: "hue-teal",
  journal: "hue-indigo",
  contact: "hue-violet",
} satisfies Record<SiteNavKey, string>;

export async function SiteHeader() {
  const t = await getTranslations("Navigation");
  const tBrand = await getTranslations("Brand");

  const links: NavItem[] = (await siteNavigation(await getLocale())).map((link) => ({
    ...link,
    label: t(link.key),
  }));

  return (
    <header className="sticky top-0 z-40 border-b glass-wash">
      <div className="page-container flex h-[4.5rem] items-center justify-between gap-4">
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
          <Button asChild size="sm" variant="primary" className="ml-1 hidden sm:inline-flex">
            <NavLink href="/book">{t("planEvent")}</NavLink>
          </Button>
          <MobileNav
            links={[...links, { key: "book", href: "/book", label: t("planEvent") }]}
            labels={{ open: t("openMenu"), close: t("closeMenu"), title: t("menuTitle") }}
          />
        </div>
      </div>
    </header>
  );
}
