import "server-only";
import type { AppLocale } from "@/i18n/routing";
import { resolveTranslation } from "@/lib/localization/translations";
import { publicImageView } from "./components/public/cms-image";
import type {
  AboutSectionView,
  CardItem,
  GalleryItemView,
  MenuCategoryView,
} from "./components/public/views";
import { PAGES } from "./pages";
import type {
  PublicGalleryItem,
  PublicJournal,
  PublicMenuCategory,
  PublicPage,
  PublicServiceCard,
} from "./public-data";
import { readSections } from "./schemas";

/*
 * Published data → view models, applying the language fallback policy
 * (docs/LOCALIZATION.md): the requested language, else English (marked
 * lang="en"), else the entry is not shown. Amharic is never shown on an
 * English page.
 */

type Text = { text: string; lang?: AppLocale };

const text = (value: string | null | undefined, lang?: AppLocale): Text | null =>
  value && value.trim() ? { text: value, lang } : null;

export function serviceCards(services: PublicServiceCard[], locale: AppLocale): CardItem[] {
  return services.flatMap((service) => {
    const tr = resolveTranslation(service.translations, locale);
    if (!tr) return [];
    return [
      {
        key: service.slug,
        href: `/services/${service.slug}`,
        title: { text: tr.value.title, lang: tr.lang },
        summary: text(tr.value.summary, tr.lang),
        image: publicImageView(service.image, locale),
      },
    ];
  });
}

export function menuView(menu: PublicMenuCategory[], locale: AppLocale): MenuCategoryView[] {
  return menu.flatMap((category) => {
    const tr = resolveTranslation(category.translations, locale);
    if (!tr) return [];
    const items = category.items.flatMap((item) => {
      const itemTr = resolveTranslation(item.translations, locale);
      if (!itemTr) return [];
      return [
        {
          key: item.id,
          name: { text: itemTr.value.name, lang: itemTr.lang },
          description: text(itemTr.value.description, itemTr.lang),
          tags: item.dietary_tags,
          image: publicImageView(item.image, locale),
        },
      ];
    });
    if (items.length === 0) return [];
    return [
      {
        key: category.slug,
        name: { text: tr.value.name, lang: tr.lang },
        description: text(tr.value.description, tr.lang),
        items,
      },
    ];
  });
}

export function galleryView(
  gallery: PublicGalleryItem[],
  locale: AppLocale,
  eventLabel: (eventType: string) => string | null,
): GalleryItemView[] {
  return gallery.flatMap((item) => {
    const image = publicImageView(item.image, locale);
    if (!image) return [];
    const tr = resolveTranslation(item.translations, locale);
    return [
      {
        key: item.id,
        image,
        caption: tr ? text(tr.value.caption, tr.lang) : null,
        event: item.event_type ? eventLabel(item.event_type) : null,
      },
    ];
  });
}

export function journalCards(
  journal: PublicJournal,
  locale: AppLocale,
  formatDate: (iso: string) => string,
): CardItem[] {
  return journal.posts.flatMap((post) => {
    const tr = resolveTranslation(post.translations, locale);
    if (!tr) return [];
    return [
      {
        key: post.slug,
        href: `/journal/${post.slug}`,
        title: { text: tr.value.title, lang: tr.lang },
        summary: text(tr.value.excerpt, tr.lang),
        image: publicImageView(post.image, locale),
        meta: post.published_at ? formatDate(post.published_at) : undefined,
      },
    ];
  });
}

/** A published page in the requested language (or English), with its sections. */
export function pageContent(page: PublicPage | null, key: "home" | "about", locale: AppLocale) {
  if (!page) return null;
  const tr = resolveTranslation(page.translations, locale);
  if (!tr) return null;
  return {
    lang: tr.lang,
    title: tr.value.title,
    seoTitle: tr.value.seo_title,
    seoDescription: tr.value.seo_description,
    sections: readSections(PAGES[key], tr.value.sections),
    image: (slot: string) => publicImageView(page.images[slot], locale),
  };
}

export function aboutSections(content: NonNullable<ReturnType<typeof pageContent>>): AboutSectionView[] {
  const slots: Record<string, string> = { intro: "portrait", story: "story" };
  return PAGES.about.sections.flatMap((section) => {
    const values = content.sections[section.key];
    if (!values) return [];
    return [
      {
        key: section.key,
        heading: text(values.heading, content.lang),
        body: text(values.body, content.lang),
        image: slots[section.key] ? content.image(slots[section.key]!) : null,
      },
    ];
  });
}
