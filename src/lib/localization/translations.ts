import { routing, type AppLocale } from "@/i18n/routing";

/**
 * Business content (managed by staff, stored per locale) is kept separate from
 * interface messages (src/messages). This module applies the fallback policy:
 *
 *   requested locale → default locale (English) → nothing
 *
 * When fallback text is used, `lang` is returned so the element can be marked
 * with its real language (e.g. English shown on an Amharic page gets
 * lang="en"). Content is never relabelled as a language it is not.
 */

export type Localized<T = string> = Partial<Record<AppLocale, T>>;

export type ResolvedText = {
  text: string;
  /** Present only when the text is a fallback in a different language. */
  lang?: AppLocale;
};

const FALLBACKS: Record<AppLocale, readonly AppLocale[]> = {
  en: [],
  am: [routing.defaultLocale],
};

export function resolveLocalized(values: Localized<string>, requested: AppLocale): ResolvedText | null {
  for (const locale of [requested, ...FALLBACKS[requested]]) {
    const text = values[locale]?.trim();
    if (text) return locale === requested ? { text } : { text, lang: locale };
  }
  return null;
}
