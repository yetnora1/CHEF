import { ArrowLeft, ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { publicImageView } from "@/features/cms/components/public/cms-image";
import { ArticleView } from "@/features/cms/components/public/views";
import { SLUG_PATTERN } from "@/features/cms/content-types";
import { markupToPlainText } from "@/features/cms/markup";
import { getPublicService, getPublicServices } from "@/features/cms/public-data";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { resolveTranslation } from "@/lib/localization/translations";

// The page renders its content or the not-found page, nothing in between:
// navigations into it wait for the (cached) content instead of an instant shell.
export const instant = false;

// Cache Components needs at least one parameter at build time; before anything
// is published, a placeholder that resolves to "not found".
const NONE = "__none__";

export async function generateStaticParams() {
  const services = (await getPublicServices().catch(() => null)) ?? [];
  return (services.length ? services.map((service) => service.slug) : [NONE]).map((slug) => ({ slug }));
}

async function load(slug: string, locale: AppLocale) {
  if (!SLUG_PATTERN.test(slug)) return null;
  const service = await getPublicService(slug).catch(() => null);
  const translation = service ? resolveTranslation(service.translations, locale) : null;
  return service && translation ? { service, translation } : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/services/[slug]">): Promise<Metadata> {
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const found = await load(slug, locale);
  if (!found) return {};
  const { value } = found.translation;
  return {
    title: value.seo_title || value.title,
    description:
      value.seo_description ||
      value.summary ||
      (value.body ? markupToPlainText(value.body).slice(0, 170) : undefined),
    alternates: {
      canonical: `/${locale}/services/${slug}`,
      languages: { en: `/en/services/${slug}`, am: `/am/services/${slug}` },
    },
  };
}

export default async function ServicePage({ params }: PageProps<"/[locale]/services/[slug]">) {
  // Missing or unpublished: the not-found page (404). The first request for a slug
  // without a prerendered page streams from the shell, so it is a 200 with
  // noindex; Next.js caches the result and later requests get the 404.
  const [{ slug }, locale] = await Promise.all([params, getLocale()]);
  const found = await load(slug, locale);
  if (!found) notFound();
  const t = await getTranslations("PublicContent.services");
  const { value, lang } = found.translation;

  return (
    <ArticleView
      eyebrow={t("eyebrow")}
      title={{ text: value.title, lang }}
      summary={value.summary ? { text: value.summary, lang } : null}
      body={value.body ? { text: value.body, lang } : null}
      image={publicImageView(found.service.image, locale)}
      back={
        <Link
          href="/services"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("back")}
        </Link>
      }
      footer={
        <Button asChild size="lg" variant="primary">
          <Link href="/book">
            {t("inquire")}
            <ArrowRight aria-hidden />
          </Link>
        </Button>
      }
    />
  );
}
