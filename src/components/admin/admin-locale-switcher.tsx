"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { LanguageFlags, languageToggleClassName } from "@/components/brand/language-flags";
import { setAdminLocale } from "@/features/localization/actions";
import { LOCALE_NATIVE_NAMES, routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

/** The same flag toggle as the public site; each click switches the admin language. */
export function AdminLocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("Language");
  const [pending, startTransition] = useTransition();
  const target = routing.locales.find((value) => value !== locale) ?? routing.defaultLocale;

  return (
    <div
      role="group"
      aria-label={t("label")}
      aria-busy={pending || undefined}
      className={cn("inline-flex", className)}
    >
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => setAdminLocale(target))}
        title={LOCALE_NATIVE_NAMES[target]}
        className={cn(languageToggleClassName, "disabled:cursor-wait")}
      >
        <LanguageFlags active={locale} />
        <span className="sr-only" lang={target}>
          {LOCALE_NATIVE_NAMES[target]}
        </span>
      </button>
    </div>
  );
}
