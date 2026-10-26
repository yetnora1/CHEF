import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { isDietaryTag } from "../../content-types";
import { Markup } from "../../markup";
import { CmsFigure, CmsImage, type ImageView } from "./cms-image";

/*
 * Public views of CMS content, shared by the website and the admin preview.
 * Text props carry `lang` when they fall back to another language (English on
 * an Amharic page), so the element is marked with its real language.
 */

type Text = { text: string; lang?: AppLocale };

export async function PageHeader({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: Text;
  intro?: Text | null;
}) {
  return (
    <header className="max-w-3xl">
      <p className="eyebrow text-accent-ink">{eyebrow}</p>
      <h1 className="mt-5 display-lg" lang={title.lang}>
        {title.text}
      </h1>
      <span aria-hidden className="mt-7 tilet-rule block w-28 text-accent" />
      {intro && (
        <p className="mt-7 text-lg text-muted-foreground" lang={intro.lang}>
          {intro.text}
        </p>
      )}
    </header>
  );
}

/** Shown on an Amharic page when the content is only available in English. */
export async function FallbackNote({ lang }: { lang?: AppLocale }) {
  if (!lang) return null;
  const t = await getTranslations("PublicContent");
  return (
    <p className="mt-4 inline-flex rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-muted-foreground">
      {t("englishOnly")}
    </p>
  );
}

export async function EmptyState({ title, body }: { title: string; body: string }) {
  const t = await getTranslations("PublicContent");
  return (
    <div className="mt-12 rounded-[1.75rem] border border-dashed border-border-strong bg-surface p-8 text-center sm:p-12">
      <p className="display-md">{title}</p>
      <p className="mx-auto mt-3 max-w-xl text-muted-foreground">{body}</p>
      <Button asChild className="mt-6">
        <Link href="/book">
          {t("planEvent")}
          <ArrowRight aria-hidden />
        </Link>
      </Button>
    </div>
  );
}

export async function ArticleView({
  eyebrow,
  title,
  summary,
  body,
  image,
  meta,
  back,
  footer,
}: {
  eyebrow: string;
  title: Text;
  summary?: Text | null;
  body?: Text | null;
  image?: ImageView | null;
  meta?: string | null;
  back?: ReactNode;
  footer?: ReactNode;
}) {
  const t = await getTranslations("PublicContent");
  return (
    <article className="page-container py-12 md:py-16">
      <div className="mx-auto max-w-3xl">
        {back}
        <p className="mt-6 eyebrow text-accent-ink">{eyebrow}</p>
        <h1 className="mt-5 display-lg" lang={title.lang}>
          {title.text}
        </h1>
        {meta && <p className="mt-3 text-sm text-muted-foreground">{meta}</p>}
        <FallbackNote lang={title.lang} />
        {summary && (
          <p className="mt-6 text-lg text-muted-foreground" lang={summary.lang}>
            {summary.text}
          </p>
        )}
      </div>
      {image && (
        <CmsFigure
          image={image}
          sizes="(min-width: 64rem) 56rem, 100vw"
          className="mx-auto mt-10 max-w-4xl"
          frameClassName="aspect-[16/9] rounded-[1.75rem]"
          creditLabel={t("credit")}
          preload
        />
      )}
      {body && <Markup text={body.text} lang={body.lang} className="mx-auto mt-10 max-w-3xl" />}
      {footer && <div className="mx-auto mt-12 max-w-3xl">{footer}</div>}
    </article>
  );
}

export type CardItem = {
  key: string;
  href: string;
  title: Text;
  summary?: Text | null;
  image?: ImageView | null;
  meta?: string;
};

export async function CardGrid({ items, cta }: { items: CardItem[]; cta: string }) {
  return (
    <ul className="mt-12 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.key} className="flex flex-col">
          <Link
            href={item.href}
            className="group flex flex-col rounded-[1.75rem] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            <div className="aspect-[4/3] overflow-hidden rounded-[1.75rem] bg-surface-muted">
              {item.image ? (
                <CmsImage
                  image={item.image}
                  sizes="(min-width: 64rem) 24rem, (min-width: 40rem) 50vw, 100vw"
                  className="transition-transform duration-500 group-hover:scale-[1.02]"
                />
              ) : (
                <span aria-hidden className="block h-full w-full dot-texture" />
              )}
            </div>
            {item.meta && <p className="mt-5 text-xs text-muted-foreground">{item.meta}</p>}
            <h2 className={item.meta ? "mt-2 display-md" : "mt-6 display-md"} lang={item.title.lang}>
              {item.title.text}
            </h2>
            {item.summary && (
              <p className="mt-3 text-sm text-muted-foreground" lang={item.summary.lang}>
                {item.summary.text}
              </p>
            )}
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-ink">
              {cta}
              <ArrowRight aria-hidden className="size-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export type MenuCategoryView = {
  key: string;
  name: Text;
  description?: Text | null;
  items: { key: string; name: Text; description?: Text | null; tags: string[]; image?: ImageView | null }[];
};

export async function MenuView({ categories }: { categories: MenuCategoryView[] }) {
  const [t, tDiet] = await Promise.all([getTranslations("PublicContent"), getTranslations("DietaryTag")]);
  return (
    // A menu reads as one column at a comfortable line length.
    <div className="mt-12 max-w-3xl space-y-14">
      {categories.map((category) => (
        <section key={category.key} aria-labelledby={`menu-${category.key}`}>
          <h2 id={`menu-${category.key}`} className="display-md" lang={category.name.lang}>
            {category.name.text}
          </h2>
          {category.description && (
            <p className="mt-3 max-w-2xl text-muted-foreground" lang={category.description.lang}>
              {category.description.text}
            </p>
          )}
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {category.items.map((item) => (
              <li key={item.key} className="flex gap-5 py-5">
                {item.image && (
                  <div className="size-20 shrink-0 overflow-hidden rounded-2xl bg-surface-muted sm:size-24">
                    <CmsImage image={item.image} sizes="6rem" />
                  </div>
                )}
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold" lang={item.name.lang}>
                    {item.name.text}
                  </h3>
                  {item.description && (
                    <p className="mt-1.5 text-muted-foreground" lang={item.description.lang}>
                      {item.description.text}
                    </p>
                  )}
                  {item.tags.length > 0 && (
                    <ul aria-label={t("dietaryLabel")} className="mt-3 flex flex-wrap gap-1.5">
                      {item.tags.map((tag) => (
                        <li
                          key={tag}
                          className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground"
                        >
                          {isDietaryTag(tag) ? tDiet(tag) : tag}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export type GalleryItemView = { key: string; image: ImageView; caption?: Text | null; event?: string | null };

export async function GalleryView({ items }: { items: GalleryItemView[] }) {
  const t = await getTranslations("PublicContent");
  return (
    <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.key}>
          {/* One figure: the occasion and caption describe the image; the credit comes last. */}
          <figure>
            <div className="aspect-[4/3] overflow-hidden rounded-[1.5rem] bg-surface-muted">
              <CmsImage image={item.image} sizes="(min-width: 64rem) 24rem, (min-width: 40rem) 50vw, 100vw" />
            </div>
            {(item.caption || item.event || item.image.credit) && (
              <figcaption className="mt-3 space-y-1">
                {item.event && <p className="text-xs font-semibold text-accent-ink">{item.event}</p>}
                {item.caption && (
                  <p className="text-sm text-muted-foreground" lang={item.caption.lang}>
                    {item.caption.text}
                  </p>
                )}
                {item.image.credit && (
                  <p className="text-xs text-muted-foreground">
                    {t("credit")}: {item.image.credit}
                  </p>
                )}
              </figcaption>
            )}
          </figure>
        </li>
      ))}
    </ul>
  );
}

export type AboutSectionView = {
  key: string;
  heading?: Text | null;
  body?: Text | null;
  image?: ImageView | null;
};

export async function AboutView({ sections }: { sections: AboutSectionView[] }) {
  const t = await getTranslations("PublicContent");
  return (
    <div className="mt-12 space-y-16">
      {sections.map((section, index) => (
        <section
          key={section.key}
          aria-labelledby={section.heading ? `about-${section.key}` : undefined}
          className={section.image ? "grid items-start gap-10 md:grid-cols-[0.8fr_1fr]" : "max-w-3xl"}
        >
          {section.image && (
            <CmsFigure
              image={section.image}
              sizes="(min-width: 48rem) 40vw, 100vw"
              frameClassName="aspect-[4/5] rounded-[1.75rem]"
              creditLabel={t("credit")}
              className={index % 2 === 1 ? "md:order-2" : undefined}
              preload={index === 0}
            />
          )}
          <div className="max-w-2xl">
            {section.heading && (
              <h2 id={`about-${section.key}`} className="display-md" lang={section.heading.lang}>
                {section.heading.text}
              </h2>
            )}
            {section.body && (
              <Markup text={section.body.text} lang={section.body.lang} headingBase={3} className="mt-5" />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
