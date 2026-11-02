import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { PhotoGallery } from "@/components/public/photo-gallery";
import { GalleryView, PageHeader } from "@/features/cms/components/public/views";
import { getPublicGallery } from "@/features/cms/public-data";
import { galleryView } from "@/features/cms/public-views";
import { isEventType } from "@/features/bookings/status";
import { GALLERY_PHOTOS, galleryPhotos } from "@/features/content/chef-photos";
import type { AppLocale } from "@/i18n/routing";

async function itemsFor(locale: AppLocale) {
  const tEvent = await getTranslations("EventType");
  return galleryView((await getPublicGallery().catch(() => null)) ?? [], locale, (type) =>
    isEventType(type) ? tEvent(type) : null,
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const [locale, t] = await Promise.all([getLocale(), getTranslations("PublicContent.gallery")]);
  return {
    title: t("title"),
    description: t("intro"),
    alternates: { canonical: `/${locale}/gallery`, languages: { en: "/en/gallery", am: "/am/gallery" } },
  };
}

/**
 * Published gallery items once there are any; until then CHEF SIS's own
 * photographs (features/content/chef-photos.ts), so the page is never empty.
 */
export default async function GalleryPage() {
  const [locale, t, tPhotos] = await Promise.all([
    getLocale(),
    getTranslations("PublicContent.gallery"),
    getTranslations("Photos"),
  ]);
  const items = await itemsFor(locale);
  const photos = items.length ? [] : galleryPhotos(GALLERY_PHOTOS, locale);
  return (
    <section className="page-container py-14 md:py-20">
      <PageHeader eyebrow={t("eyebrow")} title={{ text: t("title") }} intro={{ text: t("intro") }} />
      {items.length ? (
        <GalleryView items={items} />
      ) : (
        <PhotoGallery
          photos={photos}
          labels={{
            open: tPhotos("open"),
            close: tPhotos("close"),
            previous: tPhotos("previous"),
            next: tPhotos("next"),
            filter: tPhotos("filter"),
            all: tPhotos("all"),
            event: tPhotos("events"),
            dish: tPhotos("dishes"),
            showing: Array.from({ length: photos.length + 1 }, (_, count) => tPhotos("showing", { count })),
          }}
        />
      )}
    </section>
  );
}
