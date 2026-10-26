"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setAdminLocale } from "@/features/localization/actions";
import { LOCALE_NATIVE_NAMES, routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";

export function AdminLocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("Language");
  const [pending, startTransition] = useTransition();

  return (
    <div
      role="group"
      aria-label={t("label")}
      aria-busy={pending || undefined}
      className={cn(
        "inline-flex items-center rounded-lg border border-border-strong/60 p-0.5 text-xs font-semibold",
        className,
      )}
    >
      {routing.locales.map((value) => {
        const active = value === locale;
        return (
          <button
            key={value}
            type="button"
            lang={value}
            aria-pressed={active}
            disabled={pending}
            onClick={() => startTransition(() => setAdminLocale(value))}
            className={cn(
              "rounded-md px-3 py-1.5 leading-none transition-colors disabled:cursor-wait [&:lang(am)]:text-[0.82rem]",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-surface-muted hover:text-foreground",
            )}
          >
            {LOCALE_NATIVE_NAMES[value]}
          </button>
        );
      })}
    </div>
  );
}
