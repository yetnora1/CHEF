import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CardGrid, EmptyState, PageHeader } from "@/features/cms/components/public/views";
import { getPublicJournal } from "@/features/cms/public-data";
import { journalCards } from "@/features/cms/public-views";
import type { AppLocale } from "@/i18n/routing";
import { formatCalendarDate } from "@/lib/format";

async function cardsFor(locale: AppLocale) {
  const journal = await getPublicJournal(locale).catch(() => null);
  return journal ? journalCards(journal, locale, (iso) => formatCalendarDate(locale, iso)) : [];
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("PublicContent.journal")]);
  const cards = await cardsFor(locale);
  return {
    title: t("title"),
    description: t("intro"),
    alternates: { canonical: `/${locale}/journal`, languages: { en: "/en/journal", am: "/am/journal" } },
    robots: cards.length ? undefined : { index: false },
  };
}

export default async function JournalPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("PublicContent.journal")]);
  const cards = await cardsFor(locale);
  return (
    <section className="page-container py-14 md:py-20">
      <PageHeader eyebrow={t("eyebrow")} title={{ text: t("title") }} intro={{ text: t("intro") }} />
      {cards.length ? (
        <CardGrid items={cards} cta={t("read")} />
      ) : (
        <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />
      )}
    </section>
  );
}
