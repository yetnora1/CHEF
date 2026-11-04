import { ExternalLink, Film } from "lucide-react";
import type { Metadata } from "next";
import Image, { type StaticImageData } from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { getSiteMedia } from "@/features/cms/public-data";
import { sampleMediaKey, videoMediaKey } from "@/features/content/bundled-media";
import { licenseUrl } from "@/features/content/licenses";
import { samplePhotos } from "@/features/content/sample-photos";
import { sampleVideos } from "@/features/content/sample-videos";
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
  thumbnail: StaticImageData | string | null;
  description: Localized;
  /** A sample's author, licence and source, or the credit recorded for an upload. */
  credit: { author: string; license: string; source: string } | string;
};

const SITES: Record<string, string> = {
  "commons.wikimedia.org": "Wikimedia Commons",
  "www.flickr.com": "Flickr",
  "www.pexels.com": "Pexels",
};

/**
 * Credits for the sample photographs and videos: the media carry no caption, so
 * this page gives each one's author, licence and source (CC BY and CC BY-SA
 * require it; CC0 and Pexels do not, but are credited too) and says that they are not
 * CHEF SIS's work. Only files on the site are listed: a sample that staff deleted or
 * replaced goes away, and an upload with a credit recorded for it joins the list.
 */
export default async function CreditsPage() {
  const locale = await getLocale();
  const [t, site] = await Promise.all([getTranslations("Credits"), getSiteMedia()]);
  const uploaded = site.uploadedCredits();
  const clips = site.videos();

  const photos: Entry[] = [
    ...Object.entries(samplePhotos)
      .filter(([key]) => site.bundledInUse(sampleMediaKey(key)))
      .map(([key, photo]) => ({
        key,
        thumbnail: photo.src,
        description: site.sample(key as keyof typeof samplePhotos)?.alt ?? photo.alt,
        credit: photo.credit,
      })),
    ...uploaded.filter((entry) => entry.kind === "image"),
  ];
  const videos: Entry[] = [
    ...sampleVideos
      .filter((video) => site.bundledInUse(videoMediaKey(video.key)))
      .map((video) => ({
        key: video.key,
        thumbnail: video.poster,
        description: clips.find((clip) => clip.key === video.key)?.description ?? video.description,
        credit: video.credit,
      })),
    ...uploaded.filter((entry) => entry.kind === "video"),
  ];

  return (
    <article className="page-container max-w-4xl py-14 md:py-20">
      <p className="eyebrow text-accent-ink">{t("eyebrow")}</p>
      <h1 className="mt-5 display-lg">{t("title")}</h1>
      <p className="mt-5 text-lg text-muted-foreground">{t("intro")}</p>
      <p className="mt-3 text-sm text-muted-foreground">{t("changes")}</p>

      {photos.length > 0 && <CreditList heading={t("photos")} entries={photos} locale={locale} />}
      {videos.length > 0 && <CreditList heading={t("videos")} entries={videos} locale={locale} />}
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
  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">{heading}</h2>
      <ul className="mt-4 divide-y divide-border rounded-2xl border border-border glass">
        {entries.map((entry) => {
          const description = resolveLocalized(entry.description, locale);
          return (
            <li key={entry.key} className="flex items-center gap-4 p-4 sm:gap-5 sm:p-5">
              {entry.thumbnail ? (
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
              ) : (
                <span className="flex aspect-[4/3] w-24 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted-foreground">
                  <Film aria-hidden className="size-5" />
                </span>
              )}
              <div className="min-w-0 space-y-1 text-sm">
                <p className="font-semibold" lang={description?.lang}>
                  {description?.text}
                </p>
                {typeof entry.credit === "string" ? (
                  <p className="text-muted-foreground">{entry.credit}</p>
                ) : (
                  <SampleCredit credit={entry.credit} />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

async function SampleCredit({ credit }: { credit: { author: string; license: string; source: string } }) {
  const t = await getTranslations("Credits");
  const deed = licenseUrl(credit.license);
  const host = new URL(credit.source).hostname;
  return (
    <>
      <p className="text-muted-foreground">
        {t("by", { author: credit.author })}
        {" · "}
        {t("license")}:{" "}
        {deed ? (
          <a href={deed} lang="en" className="underline underline-offset-2 hover:text-foreground">
            {credit.license}
          </a>
        ) : (
          <span lang="en">{credit.license}</span>
        )}
      </p>
      <a
        href={credit.source}
        className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
      >
        {t("source", { site: SITES[host] ?? host })}
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
    </>
  );
}
