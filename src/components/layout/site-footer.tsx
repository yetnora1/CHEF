import { cacheLife } from "next/cache";
import type { ComponentProps } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/wordmark";
import { Link } from "@/i18n/navigation";
import { siteNavigation } from "@/features/cms/navigation";

async function currentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

/** A compact footer: brand and links on one row, the copyright on another. */
export async function SiteFooter() {
  const [t, tNav, tBrand, year] = await Promise.all([
    getTranslations("Footer"),
    getTranslations("Navigation"),
    getTranslations("Brand"),
    currentYear(),
  ]);

  const links: { key: string; href: ComponentProps<typeof Link>["href"]; label: string }[] = [
    ...(await siteNavigation(await getLocale())).map((link) => ({ ...link, label: tNav(link.key) })),
    { key: "book", href: "/book", label: tNav("planEvent") },
    { key: "privacy", href: "/privacy", label: tNav("privacy") },
    { key: "credits", href: "/credits", label: tNav("credits") },
  ];

  return (
    <footer className="border-t border-border bg-surface">
      <div className="page-container flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
        <Wordmark tagline={tBrand("tagline")} />
        <nav aria-label={t("navigationLabel")}>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {links.map((link) => (
              <li key={link.key}>
                <Link
                  href={link.href}
                  className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-border">
        <p className="page-container py-4 text-xs text-muted-foreground">{t("copyright", { year })}</p>
      </div>
    </footer>
  );
}
