import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "am"],
  defaultLocale: "en",
  // Every public URL carries its locale (/en/..., /am/...), so links, caches and
  // search engines always see one language per URL.
  localePrefix: "always",
  // Remember an explicit language choice for a year. The admin app (which has no
  // locale segment) reads the same cookie.
  localeCookie: { maxAge: 60 * 60 * 24 * 365 },
});

export type AppLocale = (typeof routing.locales)[number];

export const LOCALE_COOKIE = "NEXT_LOCALE";

/** Each language's own name, shown in that language regardless of the UI locale. */
export const LOCALE_NATIVE_NAMES: Record<AppLocale, string> = {
  en: "English",
  am: "አማርኛ",
};

export function isAppLocale(value: unknown): value is AppLocale {
  return (routing.locales as readonly unknown[]).includes(value);
}
