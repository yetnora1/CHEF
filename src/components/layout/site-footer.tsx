import { cacheLife } from "next/cache";
import type { ComponentProps } from "react";
import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/brand/wordmark";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { HOME_SECTIONS } from "@/features/content/home-sections";

async function currentYear() {
  "use cache";
  cacheLife("days");
  return new Date().getFullYear();
}

export async function SiteFooter() {
  const [t, tNav, tBrand, year] = await Promise.all([
    getTranslations("Footer"),
    getTranslations("Navigation"),
    getTranslations("Brand"),
    currentYear(),
  ]);

  const links: { key: string; href: ComponentProps<typeof Link>["href"]; label: string }[] = [
    { key: "about", href: { pathname: "/", hash: HOME_SECTIONS.about }, label: tNav("about") },
    { key: "services", href: { pathname: "/", hash: HOME_SECTIONS.services }, label: tNav("services") },
    { key: "book", href: "/book", label: tNav("planEvent") },
    { key: "privacy", href: "/privacy", label: tNav("privacy") },
  ];

  return (
    <footer className="border-t border-border bg-surface">
      <span aria-hidden className="tilet-rule text-accent/70" />
      <div className="page-container grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm space-y-4">
          <Wordmark tagline={tBrand("tagline")} />
          <p className="text-sm text-muted-foreground">{t("contactPending")}</p>
        </div>

        <nav aria-label={t("navigationLabel")}>
          <ul className="space-y-3 text-sm">
            {links.map((link) => (
              <li key={link.key}>
                <Link
                  href={link.href}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-4">
          <LocaleSwitcher />
          <p className="text-xs leading-relaxed text-muted-foreground">{t("photoCredit")}</p>
        </div>
      </div>
      <div className="border-t border-border">
        <p className="page-container py-5 text-xs text-muted-foreground">{t("copyright", { year })}</p>
      </div>
    </footer>
  );
}
