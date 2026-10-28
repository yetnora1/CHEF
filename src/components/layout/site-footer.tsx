import { cacheLife } from "next/cache";
import type { ComponentProps } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/wordmark";
import { Link } from "@/i18n/navigation";
import { siteNavigation } from "@/features/cms/navigation";
import { getPublicSiteSettings } from "@/features/settings/public-data";

async function currentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

/**
 * A compact floating glass footer: brand and links on one row; the copyright
 * and the social links set in Admin → Settings on another.
 */
export async function SiteFooter() {
  const [t, tNav, tBrand, year, settings] = await Promise.all([
    getTranslations("Footer"),
    getTranslations("Navigation"),
    getTranslations("Brand"),
    currentYear(),
    getPublicSiteSettings(),
  ]);
  const social = settings?.social ?? [];

  const links: { key: string; href: ComponentProps<typeof Link>["href"]; label: string }[] = [
    ...(await siteNavigation(await getLocale())).map((link) => ({ ...link, label: tNav(link.key) })),
    { key: "book", href: "/book", label: tNav("planEvent") },
    { key: "privacy", href: "/privacy", label: tNav("privacy") },
    { key: "credits", href: "/credits", label: tNav("credits") },
  ];

  return (
    <footer className="page-container pb-3">
      <div className="rounded-2xl border border-border glass">
        <div className="flex flex-col gap-4 px-5 py-5 md:flex-row md:items-center md:justify-between">
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
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <p>{t("copyright", { year })}</p>
          {social.length > 0 && (
            <nav aria-label={t("socialLabel")}>
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {social.map(({ platform, url }) => (
                  <li key={platform}>
                    <a
                      href={url}
                      rel="me"
                      className="underline-offset-4 transition-colors hover:text-foreground hover:underline"
                    >
                      {t(`social.${platform}`)}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </div>
      </div>
    </footer>
  );
}
