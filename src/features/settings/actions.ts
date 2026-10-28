"use server";

import { refresh, updateTag } from "next/cache";
import { authorizeAdmin } from "@/lib/auth/staff-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSiteSettings } from "./admin-data";
import { SETTINGS_CACHE_TAG } from "./cache-tags";
import { parseSettingsForm, type SettingsFieldError, type SettingsTextField } from "./schema";

/*
 * Saves the site settings with the staff member's own session: RLS
 * (settings.manage), the column grants and the CHECK constraints apply again,
 * and the triggers stamp the version, the editor, the Amharic review and the
 * audit entry. The update is guarded by the version the form was loaded with.
 */

export type SettingsActionError = "generic" | "forbidden" | "invalid" | "conflict";

export type SettingsActionState =
  | { status: "idle" }
  | { status: "success"; version: number; at: number }
  | {
      status: "error";
      error: SettingsActionError;
      fieldErrors?: Partial<Record<SettingsTextField, SettingsFieldError>>;
    };

export async function saveSettingsAction(
  _previous: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const decision = await authorizeAdmin("settings.manage");
  if (decision.kind !== "allow") return { status: "error", error: "forbidden" };

  const version = Number(formData.get("version"));
  if (!Number.isInteger(version) || version < 1) return { status: "error", error: "generic" };
  const parsed = parseSettingsForm(formData);
  if (!parsed.success) return { status: "error", error: "invalid", fieldErrors: parsed.fieldErrors };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", error: "generic" };
  const current = await getSiteSettings().catch(() => null);
  if (!current) return { status: "error", error: "forbidden" };
  if (current.version !== version) return { status: "error", error: "conflict" };

  const { location_am_reviewed, ...values } = parsed.values;
  const { data, error } = await supabase
    .from("site_settings")
    .update({ ...values, ...amharicReview(location_am_reviewed, values.location_am, current) })
    .eq("id", true)
    .eq("version", version)
    .select("version");
  if (error) return { status: "error", error: error.code === "23514" ? "invalid" : "generic" };
  // No row: someone saved in between (RLS was checked by the read above).
  const saved = data?.[0];
  if (!saved) return { status: "error", error: "conflict" };

  updateTag(SETTINGS_CACHE_TAG);
  refresh();
  return { status: "success", version: Number(saved.version), at: Date.now() };
}

/**
 * The review column to send. A review counts only when this save confirms it
 * (a new value, which the trigger replaces with the time and the reviewer);
 * an unchanged, already reviewed text keeps its review by leaving the column
 * out; an unticked box clears it. Changing the text without ticking the box
 * again clears it too (trigger).
 */
function amharicReview(
  reviewed: boolean,
  text: string | null,
  current: { location_am: string | null; location_am_reviewed_at: string | null },
): { location_am_reviewed_at?: string | null } {
  if (!reviewed || !text) return { location_am_reviewed_at: null };
  if (current.location_am_reviewed_at && current.location_am === text) return {};
  return { location_am_reviewed_at: new Date().toISOString() };
}
