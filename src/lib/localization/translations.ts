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

/**
 * The same policy for a whole translation record (e.g. a published service in
 * each language): the requested language, else English, else nothing.
 */
export function resolveTranslation<T>(
  values: Partial<Record<AppLocale, T>>,
  requested: AppLocale,
): { value: T; lang?: AppLocale } | null {
  for (const locale of [requested, ...FALLBACKS[requested]]) {
    const value = values[locale];
    if (value) return locale === requested ? { value } : { value, lang: locale };
  }
  return null;
}
