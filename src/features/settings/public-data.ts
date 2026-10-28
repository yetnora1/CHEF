import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { z } from "zod";
import type { AppLocale } from "@/i18n/routing";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";
import { SETTINGS_CACHE_TAG } from "./cache-tags";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "./schema";

/*
 * The public website's settings (contact details, social links, whether event
 * inquiries are open), read like published CMS content: anonymous client,
 * cached under one tag that every settings save updates, refreshed hourly.
 * Failures are not fatal: callers get null, show nothing, and keep inquiries
 * open, and the failed read is cached for minutes only.
 */

const rowSchema = z.object({
  contact_email: z.string().nullable(),
  contact_phone: z.string().nullable(),
  whatsapp_phone: z.string().nullable(),
  telegram_username: z.string().nullable(),
  location_en: z.string().nullable(),
  // Only once a fluent speaker's review is confirmed (public_site_settings).
  location_am: z.string().nullable(),
  instagram_url: z.string().nullable(),
  facebook_url: z.string().nullable(),
  tiktok_url: z.string().nullable(),
  youtube_url: z.string().nullable(),
  inquiries_open: z.boolean(),
});

export type PublicSiteSettings = {
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  telegram: string | null;
  location: Record<AppLocale, string | null>;
  social: { platform: SocialPlatform; url: string }[];
  inquiriesOpen: boolean;
};

export async function getPublicSiteSettings(): Promise<PublicSiteSettings | null> {
  "use cache";
  cacheTag(SETTINGS_CACHE_TAG);
  const supabase = createSupabaseAnonClient();
  if (!supabase) {
    cacheLife("max");
    return null;
  }
  const { data, error } = await supabase.rpc("public_site_settings");
  const parsed = error ? null : z.array(rowSchema).length(1).safeParse(data);
  if (!parsed?.success) {
    console.warn(
      `[settings] public read failed${error ? ` (${error.code ?? "network"})` : " (unexpected shape)"}`,
    );
    cacheLife("minutes");
    return null;
  }
  cacheLife("hours");
  const row = parsed.data[0]!;
  return {
    email: row.contact_email,
    phone: row.contact_phone,
    whatsapp: row.whatsapp_phone,
    telegram: row.telegram_username,
    location: { en: row.location_en, am: row.location_am },
    social: SOCIAL_PLATFORMS.flatMap((platform) => {
      const url = row[`${platform}_url`];
      return url ? [{ platform, url }] : [];
    }),
    inquiriesOpen: row.inquiries_open,
  };
}

/** The visitor's language, else English: an unreviewed Amharic location is never shown. */
export function localizedLocation(settings: PublicSiteSettings, locale: AppLocale): string | null {
  return settings.location[locale] ?? settings.location.en;
}
