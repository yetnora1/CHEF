import "server-only";
import { getPublicServices } from "@/features/cms/public-data";
import { homeContent } from "@/features/content/home-content";
import type { AppLocale } from "@/i18n/routing";
import { resolveLocalized, type Localized } from "@/lib/localization/translations";
import { CONTACT_LIMITS } from "./message-schema";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** The contact page link for a service card: the form opens with that service as its subject. */
export function contactHrefFor(slug: string): string {
  return `/contact?service=${encodeURIComponent(slug)}`;
}

/**
 * The subject prefilled from `/contact?service=<slug>`: the service's name in the
 * visitor's language. Only a published service or one of the homepage's labelled
 * placeholders is accepted, so a link can never put arbitrary text into the form.
 */
export async function contactSubjectFor(
  service: string | string[] | undefined,
  locale: AppLocale,
): Promise<string | undefined> {
  if (typeof service !== "string" || service.length > 80 || !SLUG.test(service)) return undefined;

  const published = (await getPublicServices())?.find((entry) => entry.slug === service);
  const names: Localized | undefined = published
    ? { en: published.translations.en?.title, am: published.translations.am?.title }
    : homeContent.services.items.find((item) => item.slug === service)?.title;

  const name = names && resolveLocalized(names, locale);
  return name ? name.text.slice(0, CONTACT_LIMITS.subjectMax) : undefined;
}
