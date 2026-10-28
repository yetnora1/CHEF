import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
 * The settings form's read, with the signed-in staff member's own client.
 * RLS answers only for settings.manage: anyone else gets no row (null).
 */

export class SettingsDataError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`Settings could not be loaded: ${operation}`, { cause });
    this.name = "SettingsDataError";
  }
}

const rowSchema = z.object({
  contact_email: z.string().nullable(),
  contact_phone: z.string().nullable(),
  whatsapp_phone: z.string().nullable(),
  telegram_username: z.string().nullable(),
  location_en: z.string().nullable(),
  location_am: z.string().nullable(),
  location_am_reviewed_at: z.string().nullable(),
  instagram_url: z.string().nullable(),
  facebook_url: z.string().nullable(),
  tiktok_url: z.string().nullable(),
  youtube_url: z.string().nullable(),
  inquiries_open: z.boolean(),
  version: z.number().int(),
  updated_at: z.string(),
  updated_by_name: z.string().nullable(),
});

export type SiteSettings = z.infer<typeof rowSchema>;

export async function getSiteSettings(): Promise<SiteSettings | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new SettingsDataError("client", "Supabase is not configured");
  const { data, error } = await supabase.rpc("get_site_settings");
  if (error) throw new SettingsDataError("get_site_settings", error);
  const rows = z
    .array(rowSchema)
    .max(1)
    .parse(data ?? []);
  return rows[0] ?? null;
}
