import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EmptyState, GalleryView, PageHeader } from "@/features/cms/components/public/views";
import { getPublicGallery } from "@/features/cms/public-data";
import { galleryView } from "@/features/cms/public-views";
import { isEventType } from "@/features/bookings/status";
import type { AppLocale } from "@/i18n/routing";

async function itemsFor(locale: AppLocale) {
  const tEvent = await getTranslations("EventType");
  return galleryView((await getPublicGallery().catch(() => null)) ?? [], locale, (type) =>
    isEventType(type) ? tEvent(type) : null,
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("PublicContent.gallery")]);
  const items = await itemsFor(locale);
  return {
    title: t("title"),
    description: t("intro"),
    alternates: { canonical: `/${locale}/gallery`, languages: { en: "/en/gallery", am: "/am/gallery" } },
    robots: items.length ? undefined : { index: false },
  };
}

export default async function GalleryPage() {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("PublicContent.gallery")]);
  const items = await itemsFor(locale);
  return (
    <section className="page-container py-14 md:py-20">
      <PageHeader eyebrow={t("eyebrow")} title={{ text: t("title") }} intro={{ text: t("intro") }} />
      {items.length ? (
        <GalleryView items={items} />
      ) : (
        <EmptyState title={t("emptyTitle")} body={t("emptyBody")} />
      )}
    </section>
  );
}
