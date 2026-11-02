import { ArrowRight } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { HOME_PHOTOS, galleryPhotos } from "@/features/content/chef-photos";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { PhotoMosaic } from "./photo-gallery";

/**
 * CHEF SIS's own photographs as a mosaic after "Meet CHEF SIS": any photo opens
 * larger, and the link leads to all of them on the gallery page.
 */
export async function PhotosSection() {
  const locale = (await getLocale()) as AppLocale;
  const t = await getTranslations("Photos");

  return (
    <section aria-labelledby="photos-heading" className="py-14 md:py-20">
      <div className="page-container">
        <div className="grid gap-6 md:grid-cols-[1fr_1fr] md:items-end">
          <div>
            <p className="eyebrow text-accent-ink">{t("eyebrow")}</p>
            <h2 id="photos-heading" className="mt-5 display-lg">
              {t("title")}
            </h2>
          </div>
          <p className="max-w-lg text-muted-foreground md:justify-self-end">{t("lede")}</p>
        </div>
        <PhotoMosaic
          photos={galleryPhotos(HOME_PHOTOS, locale)}
          labels={{ open: t("open"), close: t("close"), previous: t("previous"), next: t("next") }}
        />
        <div className="mt-6 flex sm:justify-end">
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link href="/gallery">
              {t("seeAll")}
              <ArrowRight aria-hidden className="motion-safe:group-hover/button:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
