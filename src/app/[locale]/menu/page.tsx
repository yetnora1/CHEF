import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState, MenuView, PageHeader } from "@/features/cms/components/public/views";
import { getPublicMenu } from "@/features/cms/public-data";
import { menuView } from "@/features/cms/public-views";
import type { AppLocale } from "@/i18n/routing";

async function categoriesFor(locale: AppLocale) {
  return menuView((await getPublicMenu().catch(() => null)) ?? [], locale);
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("PublicContent.menu")]);
  const categories = await categoriesFor(locale);
  return {
    title: t("title"),
    description: t("intro"),
    alternates: { canonical: `/${locale}/menu`, languages: { en: "/en/menu", am: "/am/menu" } },
    robots: categories.length ? undefined : { index: false },
  };
}

export default async function MenuPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("PublicContent.menu")]);
  const categories = await categoriesFor(locale);
  return (
    <section className="page-container py-14 md:py-20">
      <PageHeader eyebrow={t("eyebrow")} title={{ text: t("title") }} intro={{ text: t("intro") }} />
      {categories.length ? (
        <MenuView categories={categories} />
      ) : (
        <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />
      )}
    </section>
  );
}
