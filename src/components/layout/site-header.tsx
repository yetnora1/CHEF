import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { HOME_SECTIONS } from "@/features/content/home-sections";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileNav } from "./mobile-nav";

export async function SiteHeader() {
  const t = await getTranslations("Navigation");
  const tBrand = await getTranslations("Brand");

  const links = [
    { hash: HOME_SECTIONS.about, label: t("about") },
    { hash: HOME_SECTIONS.services, label: t("services") },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95">
      <div className="page-container flex h-[4.5rem] items-center justify-between gap-4">
        <Link href="/" aria-label={tBrand("homeLink")} className="rounded-lg">
          <Wordmark tagline={tBrand("tagline")} />
        </Link>

        <nav aria-label={t("primaryLabel")} className="hidden md:block">
          <ul className="flex items-center gap-8 text-sm font-medium">
            {links.map((link) => (
              <li key={link.hash}>
                <Link
                  href={{ pathname: "/", hash: link.hash }}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <LocaleSwitcher className="hidden sm:inline-flex" />
          <ThemeToggle />
          <Button asChild size="sm" className="ml-1 hidden md:inline-flex">
            <Link href={{ pathname: "/", hash: HOME_SECTIONS.inquire }}>{t("planEvent")}</Link>
          </Button>
          <MobileNav
            links={[...links, { hash: HOME_SECTIONS.inquire, label: t("planEvent") }]}
            labels={{ open: t("openMenu"), close: t("closeMenu"), title: t("menuTitle") }}
          />
        </div>
      </div>
    </header>
  );
}
