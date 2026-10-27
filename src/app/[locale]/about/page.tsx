import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { AboutView, FallbackNote } from "@/features/cms/components/public/views";
import { getPublicPage } from "@/features/cms/public-data";
import { aboutSections, pageContent } from "@/features/cms/public-views";
import type { AppLocale } from "@/i18n/routing";

// The page renders its content or the not-found page, nothing in between:
// navigations into it wait for the (cached) content instead of an instant shell.
export const instant = false;

async function load(locale: AppLocale) {
  return pageContent(await getPublicPage("about").catch(() => null), "about", locale);
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const content = await load(locale);
  if (!content) return {};
  return {
    title: content.seoTitle || content.title,
    description: content.seoDescription ?? undefined,
    alternates: { canonical: `/${locale}/about`, languages: { en: "/en/about", am: "/am/about" } },
  };
}

export default async function AboutPage() {
  const locale = await getLocale();
  // Until the page is published, /about does not exist (navigation links to the homepage section).
  const content = await load(locale);
  if (!content) notFound();
  const t = await getTranslations("PublicContent.about");

  return (
    <section className="page-container py-14 md:py-20">
      <header className="max-w-3xl">
        <p className="eyebrow text-accent-ink">{t("eyebrow")}</p>
        <h1 className="mt-5 display-lg" lang={content.lang}>
          {content.title}
        </h1>
        <FallbackNote lang={content.lang} />
      </header>
      <AboutView sections={aboutSections(content)} />
    </section>
  );
}
