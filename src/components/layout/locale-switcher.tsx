"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LOCALE_NATIVE_NAMES, routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/**
 * Switches the public site between /en/... and /am/... for the current page.
 * Visiting a locale route stores the choice in the NEXT_LOCALE cookie (set by
 * the proxy), which also drives the admin language.
 */
export function LocaleSwitcher({
  className,
  tone = "default",
}: {
  className?: string;
  tone?: "default" | "band";
}) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("Language");

  return (
    <div
      role="group"
      aria-label={t("label")}
      className={cn(
        "inline-flex items-center rounded-lg border p-0.5 text-xs font-semibold",
        tone === "band" ? "border-band-muted/40" : "border-border-strong/60",
        className,
      )}
    >
      {routing.locales.map((value) => {
        const active = value === locale;
        return (
          <Link
            key={value}
            href={pathname}
            locale={value}
            hrefLang={value}
            lang={value}
            aria-current={active ? "true" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 leading-none transition-colors [&:lang(am)]:text-[0.82rem]",
              active
                ? tone === "band"
                  ? "bg-band-foreground text-band"
                  : "bg-foreground text-background"
                : tone === "band"
                  ? "text-band-foreground/85 hover:bg-white/8 hover:text-band-foreground"
                  : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            {LOCALE_NATIVE_NAMES[value]}
          </Link>
        );
      })}
    </div>
  );
}
