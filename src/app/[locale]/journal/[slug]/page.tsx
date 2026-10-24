import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { publicImageView } from "@/features/cms/components/public/cms-image";
import { ArticleView } from "@/features/cms/components/public/views";
import { SLUG_PATTERN } from "@/features/cms/content-types";
import { markupToPlainText } from "@/features/cms/markup";
import { getPublicJournal, getPublicJournalPost } from "@/features/cms/public-data";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { formatCalendarDate } from "@/lib/format";
import { resolveTranslation } from "@/lib/localization/translations";

// The page renders its content or the not-found page, nothing in between:
// navigations into it wait for the (cached) content instead of an instant shell.
export const instant = false;

// Cache Components needs at least one parameter at build time; before anything
// is published, a placeholder that resolves to "not found".
const NONE = "__none__";

export async function generateStaticParams() {
  const journal = await getPublicJournal("en").catch(() => null);
  const slugs = journal?.posts.map((post) => post.slug) ?? [];
  return (slugs.length ? slugs : [NONE]).map((slug) => ({ slug }));
}

async function load(slug: string, locale: AppLocale) {
  if (!SLUG_PATTERN.test(slug)) return null;
  const post = await getPublicJournalPost(slug).catch(() => null);
  const translation = post ? resolveTranslation(post.translations, locale) : null;
  return post && translation ? { post, translation } : null;
}

export async function generateMetadata({ params }: PageProps<"/[locale]/journal/[slug]">): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const found = await load(slug, locale);
  if (!found) return {};
  const { value } = found.translation;
  return {
    title: value.seo_title || value.title,
    description:
      value.seo_description ||
      value.excerpt ||
      (value.body ? markupToPlainText(value.body).slice(0, 170) : undefined),
    alternates: {
      canonical: `/${locale}/journal/${slug}`,
      languages: { en: `/en/journal/${slug}`, am: `/am/journal/${slug}` },
    },
    openGraph: { type: "article", publishedTime: found.post.published_at ?? undefined },
  };
}

export default async function JournalPostPage({ params }: PageProps<"/[locale]/journal/[slug]">) {
  // Missing or unpublished: the not-found page (404). The first request for a slug
  // without a prerendered page streams from the shell, so it is a 200 with
  // noindex; Next.js caches the result and later requests get the 404.
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const found = await load(slug, locale);
  if (!found) notFound();
  const t = await getTranslations("PublicContent.journal");
  const { value, lang } = found.translation;

  return (
    <ArticleView
      eyebrow={t("eyebrow")}
      title={{ text: value.title, lang }}
      summary={value.excerpt ? { text: value.excerpt, lang } : null}
      body={value.body ? { text: value.body, lang } : null}
      image={publicImageView(found.post.image, locale)}
      meta={found.post.published_at ? formatCalendarDate(locale, found.post.published_at) : null}
      back={
        <Link
          href="/journal"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("back")}
        </Link>
      }
    />
  );
}
