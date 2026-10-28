import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { licenseUrl } from "@/features/content/licenses";
import { samplePhotos } from "@/features/content/sample-photos";
import { kitchenVideo, sampleVideos } from "@/features/content/sample-videos";
import type { AppLocale } from "@/i18n/routing";
import { resolveLocalized, type Localized } from "@/lib/localization/translations";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("Credits");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: `/${locale}/credits`, languages: { en: "/en/credits", am: "/am/credits" } },
  };
}

type Entry = {
  key: string;
  thumbnail: StaticImageData | string;
  description: Localized;
  credit: { author: string; license: string; source: string };
};

const SITES: Record<string, string> = {
  "commons.wikimedia.org": "Wikimedia Commons",
  "www.pexels.com": "Pexels",
};

/**
 * Credits for the sample photographs and videos: the media carry no caption, so
 * this page gives each one's author, licence and source (CC BY and CC BY-SA
 * require it; Pexels does not, but is credited too) and says that they are not
 * CHEF SIS's work.
 */
export default async function CreditsPage() {
  const locale = await getLocale();
  const t = await getTranslations("Credits");

  const photos: Entry[] = Object.entries(samplePhotos).map(([key, photo]) => ({
    key,
    thumbnail: photo.src,
    description: photo.alt,
    credit: photo.credit,
  }));
  const videos: Entry[] = [
    {
      key: kitchenVideo.key,
      thumbnail: kitchenVideo.narrow.poster,
      description: kitchenVideo.description,
      credit: kitchenVideo.credit,
    },
    ...sampleVideos.map((video) => ({
      key: video.key,
      thumbnail: video.poster,
      description: video.description,
      credit: video.credit,
    })),
  ];

  return (
    <article className="page-container max-w-4xl py-14 md:py-20">
      <p className="eyebrow text-accent-ink">{t("eyebrow")}</p>
      <h1 className="mt-5 display-lg">{t("title")}</h1>
      <p className="mt-5 text-lg text-muted-foreground">{t("intro")}</p>
      <p className="mt-3 text-sm text-muted-foreground">{t("changes")}</p>

      <CreditList heading={t("photos")} entries={photos} locale={locale} />
      <CreditList heading={t("videos")} entries={videos} locale={locale} />
    </article>
  );
}

async function CreditList({
  heading,
  entries,
  locale,
}: {
  heading: string;
  entries: Entry[];
  locale: AppLocale;
}) {
  const t = await getTranslations("Credits");
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{heading}</h2>
      <ul className="mt-4 divide-y divide-border rounded-2xl border border-border glass">
        {entries.map((entry) => {
          const description = resolveLocalized(entry.description, locale);
          const deed = licenseUrl(entry.credit.license);
          const site = SITES[new URL(entry.credit.source).hostname] ?? new URL(entry.credit.source).hostname;
          return (
            <li key={entry.key} className="flex items-center gap-4 p-4 sm:gap-5 sm:p-5">
              <Image
                src={entry.thumbnail}
                alt=""
                width={192}
                height={144}
                sizes="6rem"
                // Video posters are plain files in public/videos, outside the optimiser's allow-list.
                unoptimized={typeof entry.thumbnail === "string"}
                className="aspect-[4/3] w-24 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 space-y-1 text-sm">
                <p className="font-semibold" lang={description?.lang}>
                  {description?.text}
                </p>
                <p className="text-muted-foreground">
                  {t("by", { author: entry.credit.author })}
                  {" · "}
                  {t("license")}:{" "}
                  {deed ? (
                    <a href={deed} lang="en" className="underline underline-offset-2 hover:text-foreground">
                      {entry.credit.license}
                    </a>
                  ) : (
                    <span lang="en">{entry.credit.license}</span>
                  )}
                </p>
                <a
                  href={entry.credit.source}
                  className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
                >
                  {t("source", { site })}
                  <ExternalLink aria-hidden className="size-3.5" />
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
