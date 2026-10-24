import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CardGrid, EmptyState, PageHeader } from "@/features/cms/components/public/views";
import { getPublicServices } from "@/features/cms/public-data";
import { serviceCards } from "@/features/cms/public-views";
import type { AppLocale } from "@/i18n/routing";

async function cardsFor(locale: AppLocale) {
  return serviceCards((await getPublicServices().catch(() => null)) ?? [], locale);
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("PublicContent.services")]);
  const cards = await cardsFor(locale);
  return {
    title: t("title"),
    description: t("intro"),
    alternates: { canonical: `/${locale}/services`, languages: { en: "/en/services", am: "/am/services" } },
    // Not indexed until there is something to show.
    robots: cards.length ? undefined : { index: false },
  };
}

export default async function ServicesPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("PublicContent.services")]);
  const cards = await cardsFor(locale);
  return (
    <section className="page-container py-14 md:py-20">
      <PageHeader eyebrow={t("eyebrow")} title={{ text: t("title") }} intro={{ text: t("intro") }} />
      {cards.length ? (
        <CardGrid items={cards} cta={t("more")} />
      ) : (
        <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />
      )}
    </section>
  );
}
