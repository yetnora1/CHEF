import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import type { AppLocale } from "@/i18n/routing";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";
import { CMS_CACHE_TAG } from "./cache-tags";

/*
 * Published content for the public website.
 *
 *   * Only the anonymous (publishable-key) client is used: no cookies, no
 *     session, so a cached entry can never contain drafts or one person's data.
 *     The SQL functions also filter on publication status themselves.
 *   * Every read is cached ("use cache") under one tag, invalidated by every CMS
 *     change (updateTag in the admin actions), and otherwise refreshed hourly.
 *   * Failures are not fatal: the caller shows its fallback, and the failed
 *     result is cached for minutes only, so the site recovers on its own.
 *   * Not configured (no Supabase): null, and the site shows its placeholders.
 */

const MEDIA_PATH = /^assets\/[0-9a-f-]{36}\/[0-9a-f]{32}\.(jpg|png|webp)$/;
const locales = z.enum(["en", "am"]);

export const publicImageSchema = z.object({
  path: z.string().regex(MEDIA_PATH),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  credit: z.string().nullable(),
  alt: z.partialRecord(locales, z.string()),
});

export type PublicImage = z.infer<typeof publicImageSchema>;

const image = publicImageSchema.nullable();
const translations = <T extends z.ZodType>(schema: T) => z.partialRecord(locales, schema);

const pageSchema = z
  .object({
    key: z.string(),
    translations: translations(
      z.object({
        title: z.string(),
        seo_title: z.string().nullable(),
        seo_description: z.string().nullable(),
        sections: z.unknown(),
      }),
    ),
    images: z.record(z.string(), publicImageSchema),
  })
  .nullable();

const servicesSchema = z.array(
  z.object({
    slug: z.string(),
    image,
    translations: translations(z.object({ title: z.string(), summary: z.string().nullable() })),
  }),
);

const serviceSchema = z
  .object({
    slug: z.string(),
    image,
    translations: translations(
      z.object({
        title: z.string(),
        summary: z.string().nullable(),
        body: z.string().nullable(),
        seo_title: z.string().nullable(),
        seo_description: z.string().nullable(),
      }),
    ),
  })
  .nullable();

const nameAndDescription = z.object({ name: z.string(), description: z.string().nullable() });

const menuSchema = z.array(
  z.object({
    slug: z.string(),
    translations: translations(nameAndDescription),
    items: z.array(
      z.object({
        id: z.string(),
        dietary_tags: z.array(z.string()),
        image,
        translations: translations(nameAndDescription),
      }),
    ),
  }),
);

const gallerySchema = z.array(
  z.object({
    id: z.string(),
    event_type: z.string().nullable(),
    image: publicImageSchema,
    translations: translations(z.object({ caption: z.string() })),
  }),
);

const journalSchema = z.object({
  total: z.number().int(),
  posts: z.array(
    z.object({
      slug: z.string(),
      published_at: z.string().nullable(),
      image,
      translations: translations(z.object({ title: z.string(), excerpt: z.string().nullable() })),
    }),
  ),
});

const journalPostSchema = z
  .object({
    slug: z.string(),
    published_at: z.string().nullable(),
    image,
    translations: translations(
      z.object({
        title: z.string(),
        excerpt: z.string().nullable(),
        body: z.string().nullable(),
        seo_title: z.string().nullable(),
        seo_description: z.string().nullable(),
      }),
    ),
  })
  .nullable();

const sections = z.object({
  about: z.boolean(),
  services: z.boolean(),
  menu: z.boolean(),
  gallery: z.boolean(),
  journal: z.boolean(),
});
const navigationSchema = z.object({ en: sections, am: sections });

export type PublicPage = NonNullable<z.infer<typeof pageSchema>>;
export type PublicServiceCard = z.infer<typeof servicesSchema>[number];
export type PublicService = NonNullable<z.infer<typeof serviceSchema>>;
export type PublicMenuCategory = z.infer<typeof menuSchema>[number];
export type PublicGalleryItem = z.infer<typeof gallerySchema>[number];
export type PublicJournal = z.infer<typeof journalSchema>;
export type PublicJournalPost = NonNullable<z.infer<typeof journalPostSchema>>;
export type PublicNavigation = z.infer<typeof navigationSchema>;

/** Calls a public SQL function inside the caller's cache scope. */
async function read<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T | null> {
  cacheTag(CMS_CACHE_TAG);
  const supabase = createSupabaseAnonClient();
  if (!supabase) {
    cacheLife("max");
    return null;
  }
  const { data, error } = await supabase.rpc(fn, args);
  const parsed = error ? null : schema.safeParse(data);
  if (!parsed?.success) {
    // Logged without content; retried soon instead of being cached for hours.
    console.warn(
      `[cms] public read failed: ${fn}${error ? ` (${error.code ?? "network"})` : " (unexpected shape)"}`,
    );
    cacheLife("minutes");
    return null;
  }
  cacheLife("hours");
  return parsed.data;
}

export async function getPublicPage(key: "home" | "about") {
  "use cache";
  return read("public_page", { p_key: key }, pageSchema);
}

export async function getPublicServices() {
  "use cache";
  return read("public_services", {}, servicesSchema);
}

export async function getPublicService(slug: string) {
  "use cache";
  return read("public_service", { p_slug: slug }, serviceSchema);
}

export async function getPublicMenu() {
  "use cache";
  return read("public_menu", {}, menuSchema);
}

export async function getPublicGallery() {
  "use cache";
  return read("public_gallery", {}, gallerySchema);
}

export async function getPublicJournal(locale: AppLocale) {
  "use cache";
  return read("public_journal", { p_locale: locale, p_limit: 50, p_offset: 0 }, journalSchema);
}

export async function getPublicJournalPost(slug: string) {
  "use cache";
  return read("public_journal_post", { p_slug: slug }, journalPostSchema);
}

export async function getPublicNavigation() {
  "use cache";
  return read("public_navigation", {}, navigationSchema);
}
