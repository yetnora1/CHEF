import { getLocale, getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { siteNavigation } from "@/features/cms/navigation";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
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
    <header className="sticky top-0 z-40 border-b border-border/60 glass-wash">
      <div className="page-container flex h-[4.5rem] items-center justify-between gap-4">
        <Link href="/" aria-label={tBrand("homeLink")} className="rounded-lg">
          <Wordmark tagline={tBrand("tagline")} />
        </Link>

        {/* Inline from lg: with every section published, five links do not fit beside the actions on tablets. */}
        <nav aria-label={t("primaryLabel")} className="hidden lg:block">
          {/* A shaded segmented control: the current page is raised, the others rise on hover. */}
          <ul className="flex items-center gap-1 rounded-xl border border-border/70 bg-surface/50 p-1 shadow-xs inset-shadow-2xs inset-shadow-shine/12">
            {links.map((link) => (
              <li key={link.key}>
                <NavLink
                  href={link.href}
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "sm" }),
                    "h-8 px-3.5 font-medium text-muted-foreground hover:text-foreground aria-[current]:from-control-top aria-[current]:to-control-bottom aria-[current]:text-foreground aria-[current]:shadow-xs aria-[current]:ring-1 aria-[current]:ring-border",
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
