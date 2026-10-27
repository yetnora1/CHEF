import { ArrowLeft, EyeOff } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AboutSection } from "@/components/public/about-section";
import { Hero } from "@/components/public/hero";
import type { AppLocale } from "@/i18n/routing";
import { resolveLocalized, resolveTranslation } from "@/lib/localization/translations";
import { getEntry } from "../../admin-data";
import { CONTENT, type ContentType, type EntryImage } from "../../content-types";
import { adminImageUrl } from "../../media-urls";
import { PAGES } from "../../pages";
import { readSections } from "../../schemas";
import type { ImageView } from "../public/cms-image";
import { AboutView, ArticleView, GalleryView, MenuView, PageHeader } from "../public/views";

/*
 * Draft preview for signed-in staff. It renders the entry with the public view
 * components, but only under /admin: the staff member's own session reads the
 * draft (RLS), nothing goes through the public cache, and admin responses are
 * never cached (`no-store`) and `noindex` (proxy, Next.js and next.config.ts).
 */

function previewImage(image: EntryImage | null | undefined, locale: AppLocale): ImageView | null {
  if (!image || image.status !== "ready" || !image.width || !image.height) return null;
  const alt = resolveLocalized(image.alt, locale);
  return {
    src: adminImageUrl(image.id, image.version),
    width: image.width,
    height: image.height,
    alt: alt?.text ?? "",
    altLang: alt?.lang,
    unoptimized: true,
  };
}

const str = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

export async function PreviewScreen({
  type,
  id,
  locale,
}: {
  type: ContentType;
  id: string;
  locale: AppLocale;
}) {
  const entry = await getEntry(type, id);
  if (!entry) notFound();
  const [t, tStatus] = await Promise.all([getTranslations("AdminCms"), getTranslations("PublicationStatus")]);
  const resolved = resolveTranslation(entry.translations, locale);
  const lang = resolved?.lang;
  const values = (resolved?.value ?? {}) as Record<string, unknown>;
  const text = (name: string) => {
    const value = str(values[name]);
    return value ? { text: value, lang } : null;
  };
  const def = CONTENT[type];
  const label = str(values[def.translationFields[0]!.name]) ?? t("untitled");

  let body;
  switch (type) {
    case "service":
    case "journal_post":
      body = (
        <ArticleView
          eyebrow={t(`types.${type}.singular`)}
          title={{ text: label, lang }}
          summary={text(type === "service" ? "summary" : "excerpt")}
          body={text("body")}
          image={previewImage(entry.image, locale)}
        />
      );
      break;
    case "menu_category":
      body = (
        <div className="page-container py-12">
          <PageHeader
            eyebrow={t("types.menu_category.singular")}
            title={{ text: label, lang }}
            intro={text("description")}
          />
        </div>
      );
      break;
    case "menu_item":
      body = (
        <div className="page-container py-12">
          <MenuView
            categories={[
              {
                key: "preview",
                name: { text: t("types.menu_item.singular") },
                items: [
                  {
                    key: entry.id,
                    name: { text: label, lang },
                    description: text("description"),
                    tags: Array.isArray(entry.entity.dietary_tags)
                      ? (entry.entity.dietary_tags as string[])
                      : [],
                    image: previewImage(entry.image, locale),
                  },
                ],
              },
            ]}
          />
        </div>
      );
      break;
    case "gallery_item": {
      const image = previewImage(entry.image, locale);
      body = (
        <div className="page-container py-12">
          {image ? (
            <GalleryView items={[{ key: entry.id, image, caption: text("caption") }]} />
          ) : (
            <p className="text-muted-foreground">{t("image.none")}</p>
          )}
        </div>
      );
      break;
    }
    case "page": {
      const page = PAGES[entry.id as keyof typeof PAGES];
      const sections = readSections(page, values.sections);
      const field = (section: string, name: string) => {
        const value = sections[section]?.[name];
        return value ? { text: value, lang } : null;
      };
      const image = (slot: string) => previewImage(entry.images[slot], locale);
      body =
        page.key === "home" ? (
          <>
            <Hero
              eyebrow={field("hero", "eyebrow")}
              headline={field("hero", "headline") ?? { text: label, lang }}
              lede={field("hero", "lede")}
              photoSubject={{ text: t("image.none") }}
              image={image("hero")}
            />
            <AboutSection
              title={field("about", "heading") ?? { text: "" }}
              body={field("about", "body") ?? { text: "" }}
              formatted
              pending={false}
              photoSubject={{ text: t("image.none") }}
              image={image("about")}
            />
            {(field("services", "heading") || field("services", "lede")) && (
              <section className="page-container py-12">
                <PageHeader
                  eyebrow={t("pageSections.home.services.title")}
                  title={field("services", "heading") ?? { text: "" }}
                  intro={field("services", "lede")}
                />
              </section>
            )}
          </>
        ) : (
          <section className="page-container py-12">
            <PageHeader eyebrow={t("pageNames.about")} title={{ text: label, lang }} />
            <AboutView
              sections={page.sections.map((section) => ({
                key: section.key,
                heading: field(section.key, "heading"),
                body: field(section.key, "body"),
                image:
                  section.key === "intro"
                    ? image("portrait")
                    : section.key === "story"
                      ? image("story")
                      : null,
              }))}
            />
          </section>
        );
      break;
    }
  }

  const translationStatus = resolved ? entry.translations[lang ?? locale]?.status : null;

  return (
    <div className="max-w-6xl space-y-6">
      <div
        role="note"
        className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-warning/60 bg-surface p-4"
      >
        <div className="space-y-1">
          <p className="inline-flex items-center gap-2 font-semibold">
            <EyeOff aria-hidden className="size-4" />
            {t("previewBanner.title", { language: t(`languages.${locale}`) })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("previewBanner.body")}{" "}
            {t("previewBanner.status", {
              item: tStatus(entry.status),
              language: translationStatus ? tStatus(translationStatus) : t("missing"),
            })}
          </p>
          {lang && <p className="text-sm font-semibold text-terracotta">{t("previewBanner.fallback")}</p>}
          {!resolved && <p className="text-sm font-semibold text-terracotta">{t("previewBanner.noText")}</p>}
        </div>
        <Link
          href={`${def.basePath}/${entry.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
        >
          <ArrowLeft aria-hidden className="size-4" />
          {t("previewBanner.back")}
        </Link>
      </div>
      <div lang={locale} className="overflow-hidden rounded-3xl border border-border bg-background">
        {body}
      </div>
    </div>
  );
}
