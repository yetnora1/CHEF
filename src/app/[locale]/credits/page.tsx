import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { licenseUrl } from "@/features/content/licenses";
import { samplePhotos } from "@/features/content/sample-photos";
import { resolveLocalized } from "@/lib/localization/translations";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("Credits");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    alternates: { canonical: `/${locale}/credits`, languages: { en: "/en/credits", am: "/am/credits" } },
  };
}

/**
 * Credits for the sample photographs: the images themselves carry no caption, so
 * this page gives each one's photographer, licence and source (as CC BY and CC
 * BY-SA require) and says that they are not Chef Harena's work.
 */
export default async function CreditsPage() {
  const locale = await getLocale();
  const t = await getTranslations("Credits");

  return (
    <article className="page-container max-w-4xl py-14 md:py-20">
      <p className="eyebrow text-accent-ink">{t("eyebrow")}</p>
      <h1 className="mt-5 display-lg">{t("title")}</h1>
      <p className="mt-5 text-lg text-muted-foreground">{t("intro")}</p>
      <p className="mt-3 text-sm text-muted-foreground">{t("changes")}</p>

      <ul className="mt-10 divide-y divide-border rounded-2xl border border-border bg-surface">
        {Object.entries(samplePhotos).map(([key, photo]) => {
          const alt = resolveLocalized(photo.alt, locale);
          const deed = licenseUrl(photo.credit.license);
          return (
            <li key={key} className="flex items-center gap-4 p-4 sm:gap-5 sm:p-5">
              <Image
                src={photo.src}
                alt=""
                sizes="6rem"
                placeholder="blur"
                className="aspect-[4/3] w-24 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 space-y-1 text-sm">
                <p className="font-semibold" lang={alt?.lang}>
                  {alt?.text}
                </p>
                <p className="text-muted-foreground">
                  {t("by", { author: photo.credit.author })}
                  {" · "}
                  {t("license")}:{" "}
                  {deed ? (
                    <a href={deed} lang="en" className="underline underline-offset-2 hover:text-foreground">
                      {photo.credit.license}
                    </a>
                  ) : (
                    <span lang="en">{photo.credit.license}</span>
                  )}
                </p>
                <a
                  href={photo.credit.source}
                  className="inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
                >
                  {t("source")}
                  <ExternalLink aria-hidden className="size-3.5" />
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </article>
  );
}
