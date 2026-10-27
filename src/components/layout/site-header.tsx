import { getLocale, getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { siteNavigation } from "@/features/cms/navigation";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileNav, type NavItem } from "./mobile-nav";
import { NavLink } from "./nav-link";

export async function SiteHeader() {
  const t = await getTranslations("Navigation");
  const tBrand = await getTranslations("Brand");

  const links: NavItem[] = (await siteNavigation(await getLocale())).map((link) => ({
    ...link,
    label: t(link.key),
  }));

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95">
      <div className="page-container flex h-[4.5rem] items-center justify-between gap-4">
        <Link href="/" aria-label={tBrand("homeLink")} className="rounded-lg">
          <Wordmark tagline={tBrand("tagline")} />
        </Link>

        {/* Inline from lg: with every section published, five links do not fit beside the actions on tablets. */}
        <nav aria-label={t("primaryLabel")} className="hidden lg:block">
          <ul className="flex items-center gap-8 text-sm font-medium">
            {links.map((link) => (
              <li key={link.key}>
                <NavLink
                  href={link.href}
                  className="text-muted-foreground decoration-accent decoration-2 underline-offset-[0.65em] transition-colors hover:text-foreground aria-[current]:text-foreground aria-[current]:underline"
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
