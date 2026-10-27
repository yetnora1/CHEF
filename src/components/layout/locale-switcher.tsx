"use client";

import { useLocale, useTranslations } from "next-intl";
import { LanguageFlag, languageToggleClassName } from "@/components/brand/language-flags";
import { Link, usePathname } from "@/i18n/navigation";
import { LOCALE_NATIVE_NAMES, routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * One flag toggle showing the current language: each click switches the
 * current page between /en/... and /am/... and keeps the scroll position (the
 * locale is the root segment, so a normal navigation would jump to the top).
 * Visiting a locale route stores the choice in the NEXT_LOCALE cookie (set by
 * the proxy), which also drives the admin language.
 */
export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("Language");
  const target = routing.locales.find((value) => value !== locale) ?? routing.defaultLocale;

  return (
    <div role="group" aria-label={t("label")} className={cn("inline-flex", className)}>
      <Link
        href={pathname}
        locale={target}
        hrefLang={target}
        scroll={false}
        title={LOCALE_NATIVE_NAMES[target]}
        className={languageToggleClassName}
      >
        <LanguageFlag locale={locale} />
        <span className="sr-only" lang={target}>
          {LOCALE_NATIVE_NAMES[target]}
        </span>
      </Link>
    </div>
  );
}
