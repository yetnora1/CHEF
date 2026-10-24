"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { hasPermission } from "@/lib/auth/access";
import { authorizeAdmin } from "@/lib/auth/staff-session";
import { cleanLine } from "@/lib/text";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEntry, getMediaAsset, listMedia, mediaCleanupCandidates } from "./admin-data";
import { CMS_CACHE_TAG } from "./cache-tags";
import {
  CONTENT,
  isContentType,
  isPublicationStatus,
  labelField,
  needsPublishPermission,
  STATUS_ACTIONS,
  type ContentType,
} from "./content-types";
import { cmsError, type CmsError } from "./errors";
import { isPageKey, PAGES } from "./pages";
import { formDataToValues, isUuid, parseFields, parseSections, type FieldError } from "./schemas";

/*
 * CMS server actions. Each one authorizes on the server first, then writes
 * with the staff member's own session, so RLS and the triggers in
 * supabase/migrations/2026102709* check everything again (publish rights,
 * Amharic review, versions, constraints). Results carry stable codes only.
 */

export type CmsActionState =
  | { status: "idle" }
  | { status: "success"; version: number; at: number }
  | { status: "error"; error: CmsError; fieldErrors?: Record<string, FieldError> };

const fail = (error: CmsError, fieldErrors?: Record<string, FieldError>): CmsActionState => ({
  status: "error",
  error,
  ...(fieldErrors ? { fieldErrors } : {}),
});

const done = (version: number): CmsActionState => ({ status: "success", version, at: Date.now() });

const read = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

const readVersion = (formData: FormData) => {
  const value = Number(read(formData, "version"));
  return Number.isInteger(value) && value >= 0 ? value : null;
};

const readLocale = (formData: FormData) => {
  const value = read(formData, "locale");
  return value === "en" || value === "am" ? value : null;
};

function entryId(type: ContentType, raw: string): string | null {
  if (CONTENT[type].idColumn === "key") return isPageKey(raw) ? raw : null;
  return isUuid(raw) ? raw : null;
}

/** Public pages and the admin read fresh data after every change. */
function invalidate() {
  updateTag(CMS_CACHE_TAG);
  refresh();
}

/**
 * A guarded update matched no row: the entry changed since the form loaded
 * (conflict), is gone or hidden (not found), or the write was not permitted.
 */
async function explainNoMatch(
  type: ContentType,
  id: string,
  locale: "en" | "am" | null,
  expected: number,
): Promise<CmsError> {
  const entry = await getEntry(type, id).catch(() => null);
  const current = locale ? entry?.translations[locale] : entry;
  if (!current) return "notFound";
  return Number(current.version) === expected ? "forbidden" : "conflict";
}

function slugError(error: CmsError): Record<string, FieldError> | undefined {
  return error === "slugTaken" ? { slug: "taken" } : undefined;
}

async function supabaseOrNull(): Promise<SupabaseClient | null> {
  return createSupabaseServerClient();
}

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

export async function createEntryAction(
  _previous: CmsActionState,
  formData: FormData,
): Promise<CmsActionState> {
  const decision = await authorizeAdmin("content.write");
  if (decision.kind !== "allow" || !hasPermission(decision.session, "translations.write"))
    return fail("forbidden");

  const type = read(formData, "type");
  if (!isContentType(type) || !CONTENT[type].creatable) return fail("generic");
  const def = CONTENT[type];
  const values = formDataToValues(formData);
  const entity = parseFields(def.entityFields, values);
  const label = parseFields([def.translationFields[0]!], values);
  if (!entity.success || !label.success) {
    return fail("invalid", {
      ...(entity.success ? {} : entity.errors),
      ...(label.success ? {} : label.errors),
    });
  }

  const supabase = await supabaseOrNull();
  if (!supabase) return fail("notConfigured");
  const { data, error } = await supabase.from(def.table).insert(entity.data).select("id").single();
  if (error || !data) {
    const code = error ? cmsError(error) : "generic";
    return fail(code, slugError(code));
  }
  const id = String((data as { id: string }).id);
  // The English version is created with the entry; if that fails the entry
  // still exists and the edit page shows English as missing.
  await supabase
    .from(def.translationTable)
    .insert({ [def.parentColumn]: id, locale: "en", [labelField(type)]: label.data[labelField(type)] });

  invalidate();
  redirect(`${def.basePath}/${id}`);
}

export async function saveEntityAction(
  _previous: CmsActionState,
  formData: FormData,
): Promise<CmsActionState> {
  const decision = await authorizeAdmin("content.write");
  if (decision.kind !== "allow") return fail("forbidden");

  const type = read(formData, "type");
  if (!isContentType(type)) return fail("generic");
  const def = CONTENT[type];
  const id = entryId(type, read(formData, "id"));
  const expected = readVersion(formData);
  if (!id || expected === null || def.entityFields.length === 0) return fail("generic");

  const parsed = parseFields(def.entityFields, formDataToValues(formData));
  if (!parsed.success) return fail("invalid", parsed.errors);

  const supabase = await supabaseOrNull();
  if (!supabase) return fail("notConfigured");
  const { data, error } = await supabase
    .from(def.table)
    .update(parsed.data)
    .eq(def.idColumn, id)
    .eq("version", expected)
    .select("version");
  if (error) {
    const code = cmsError(error);
    return fail(code, slugError(code));
  }
  if (!data?.length) return fail(await explainNoMatch(type, id, null, expected));
  invalidate();
  return done(Number((data[0] as { version: number }).version));
}

export async function saveTranslationAction(
  _previous: CmsActionState,
  formData: FormData,
): Promise<CmsActionState> {
  const decision = await authorizeAdmin("translations.write");
  if (decision.kind !== "allow") return fail("forbidden");

  const type = read(formData, "type");
  if (!isContentType(type)) return fail("generic");
  const def = CONTENT[type];
  const id = entryId(type, read(formData, "id"));
  const locale = readLocale(formData);
  const expected = readVersion(formData);
  if (!id || !locale || expected === null) return fail("generic");

  const values = formDataToValues(formData);
  const parsed = parseFields(def.translationFields, values);
  const sections = type === "page" && isPageKey(id) ? parseSections(PAGES[id], values) : null;
  if (!parsed.success || (sections && !sections.success)) {
    return fail("invalid", {
      ...(parsed.success ? {} : parsed.errors),
      ...(sections && !sections.success ? sections.errors : {}),
    });
  }

  const payload: Record<string, unknown> = { ...parsed.data };
  if (sections?.success) payload.sections = sections.data;
  // Amharic: ticking the box confirms a fluent speaker reviewed this text (the
  // database stamps who and when); unticking withdraws it.
  if (locale === "am")
    payload.language_reviewed_at = read(formData, "reviewed") === "on" ? new Date().toISOString() : null;

  const supabase = await supabaseOrNull();
  if (!supabase) return fail("notConfigured");

  const query =
    expected === 0
      ? supabase
          .from(def.translationTable)
          .insert({ ...payload, [def.parentColumn]: id, locale })
          .select("version")
      : supabase
          .from(def.translationTable)
          .update(payload)
          .eq(def.parentColumn, id)
          .eq("locale", locale)
          .eq("version", expected)
          .select("version");
  const { data, error } = await query;
  if (error) return fail(cmsError(error));
  if (!data?.length) return fail(await explainNoMatch(type, id, locale, expected));
  invalidate();
  return done(Number((data[0] as { version: number }).version));
}

export async function changeStatusAction(
  _previous: CmsActionState,
  formData: FormData,
): Promise<CmsActionState> {
  const type = read(formData, "type");
  const scope = read(formData, "scope");
  const from = read(formData, "from");
  const to = read(formData, "to");
  if (!isContentType(type) || !isPublicationStatus(from) || !isPublicationStatus(to)) return fail("generic");
  if (scope !== "entity" && scope !== "translation") return fail("generic");
  if (!STATUS_ACTIONS[from].includes(to)) return fail("invalid");

  const permission = needsPublishPermission(from, to)
    ? "content.publish"
    : scope === "entity"
      ? "content.write"
      : "translations.write";
  const decision = await authorizeAdmin(permission);
  if (decision.kind !== "allow") return fail("forbidden");

  const def = CONTENT[type];
  const id = entryId(type, read(formData, "id"));
  const locale = scope === "translation" ? readLocale(formData) : null;
  const expected = readVersion(formData);
  if (!id || expected === null || (scope === "translation" && !locale)) return fail("generic");

  const supabase = await supabaseOrNull();
  if (!supabase) return fail("notConfigured");
  const base =
    scope === "entity"
      ? supabase.from(def.table).update({ status: to }).eq(def.idColumn, id)
      : supabase
          .from(def.translationTable)
          .update({ status: to })
          .eq(def.parentColumn, id)
          .eq("locale", locale!);
  const { data, error } = await base.eq("version", expected).select("version");
  if (error) return fail(cmsError(error));
  if (!data?.length) return fail(await explainNoMatch(type, id, locale, expected));
  invalidate();
  return done(Number((data[0] as { version: number }).version));
}

export async function deleteEntryAction(
  _previous: CmsActionState,
  formData: FormData,
): Promise<CmsActionState> {
  const decision = await authorizeAdmin("content.publish");
  if (decision.kind !== "allow") return fail("forbidden");

  const type = read(formData, "type");
  const scope = read(formData, "scope");
  if (!isContentType(type) || (scope !== "entity" && scope !== "translation")) return fail("generic");
  const def = CONTENT[type];
  if (scope === "entity" && !def.creatable) return fail("forbidden");
  const id = entryId(type, read(formData, "id"));
  const locale = scope === "translation" ? readLocale(formData) : null;
  if (!id || (scope === "translation" && !locale)) return fail("generic");

  const supabase = await supabaseOrNull();
  if (!supabase) return fail("notConfigured");
  const { data, error } =
    scope === "entity"
      ? await supabase.from(def.table).delete().eq(def.idColumn, id).select(def.idColumn)
      : await supabase
          .from(def.translationTable)
          .delete()
          .eq(def.parentColumn, id)
          .eq("locale", locale!)
          .select("locale");
  if (error) return fail(cmsError(error, "delete"));
  if (!data?.length) {
    // Published rows must be unpublished first (RLS hides them from delete).
    const entry = await getEntry(type, id).catch(() => null);
    const current = scope === "entity" ? entry : locale ? entry?.translations[locale] : null;
    return fail(current?.status === "published" ? "unpublishFirst" : "notFound");
  }

  invalidate();
  if (scope === "entity") redirect(def.basePath);
  return done(0);
}

/** Sets or clears a page's image slot (home: hero, about; …). */
export async function setPageImageAction(
  _previous: CmsActionState,
  formData: FormData,
): Promise<CmsActionState> {
  const decision = await authorizeAdmin("content.write");
  if (decision.kind !== "allow") return fail("forbidden");

  const page = read(formData, "id");
  const slot = read(formData, "slot");
  const assetId = read(formData, "asset_id");
  if (!isPageKey(page) || !PAGES[page].imageSlots.includes(slot) || (assetId && !isUuid(assetId))) {
    return fail("generic");
  }

  const supabase = await supabaseOrNull();
  if (!supabase) return fail("notConfigured");
  if (!assetId) {
    const { error } = await supabase.from("page_images").delete().eq("page_key", page).eq("slot", slot);
    if (error) return fail(cmsError(error, "delete"));
  } else {
    const updated = await supabase
      .from("page_images")
      .update({ asset_id: assetId })
      .eq("page_key", page)
      .eq("slot", slot)
      .select("slot");
    if (updated.error) return fail(cmsError(updated.error));
    if (!updated.data?.length) {
      const inserted = await supabase
        .from("page_images")
        .insert({ page_key: page, slot, asset_id: assetId })
        .select("slot");
      if (inserted.error) return fail(cmsError(inserted.error));
    }
  }
  invalidate();
  return done(0);
}

// ---------------------------------------------------------------------------
// Media (uploads go through /api/admin/media)
// ---------------------------------------------------------------------------

export async function saveMediaDetailsAction(
  _previous: CmsActionState,
  formData: FormData,
): Promise<CmsActionState> {
  const decision = await authorizeAdmin("media.write");
  if (decision.kind !== "allow") return fail("forbidden");

  const id = read(formData, "id");
  const expected = readVersion(formData);
  const title = cleanLine(read(formData, "title"));
  const credit = cleanLine(read(formData, "credit"));
  if (!isUuid(id) || expected === null) return fail("generic");
  const fieldErrors: Record<string, FieldError> = {};
  if (!title) fieldErrors.title = "required";
  else if ([...title].length > 200) fieldErrors.title = "tooLong";
  if ([...credit].length > 200) fieldErrors.credit = "tooLong";
  if (Object.keys(fieldErrors).length) return fail("invalid", fieldErrors);

  const supabase = await supabaseOrNull();
  if (!supabase) return fail("notConfigured");
  const { data, error } = await supabase
    .from("media_assets")
    .update({ title, credit: credit || null })
    .eq("id", id)
    .eq("version", expected)
    .select("version");
  if (error) return fail(cmsError(error));
  if (!data?.length) {
    const asset = await getMediaAsset(id).catch(() => null);
    return fail(!asset ? "notFound" : asset.asset.version === expected ? "forbidden" : "conflict");
  }
  invalidate();
  return done(Number((data[0] as { version: number }).version));
}

/** Alt text for one language; an empty text removes it. */
export async function saveAltTextAction(
  _previous: CmsActionState,
  formData: FormData,
): Promise<CmsActionState> {
  const decision = await authorizeAdmin(["media.write", "translations.write"]);
  if (decision.kind !== "allow") return fail("forbidden");

  const id = read(formData, "id");
  const locale = readLocale(formData);
  const expected = readVersion(formData);
  const altText = cleanLine(read(formData, "alt_text"));
  if (!isUuid(id) || !locale || expected === null) return fail("generic");
  if ([...altText].length > 300) return fail("invalid", { alt_text: "tooLong" });

  const supabase = await supabaseOrNull();
  if (!supabase) return fail("notConfigured");
  const reviewed =
    locale === "am"
      ? { language_reviewed_at: read(formData, "reviewed") === "on" ? new Date().toISOString() : null }
      : {};

  if (!altText) {
    if (expected === 0) return done(0);
    const { error } = await supabase
      .from("media_asset_translations")
      .delete()
      .eq("asset_id", id)
      .eq("locale", locale);
    if (error) return fail(cmsError(error, "delete"));
    invalidate();
    return done(0);
  }

  const { data, error } =
    expected === 0
      ? await supabase
          .from("media_asset_translations")
          .insert({ asset_id: id, locale, alt_text: altText, ...reviewed })
          .select("version")
      : await supabase
          .from("media_asset_translations")
          .update({ alt_text: altText, ...reviewed })
          .eq("asset_id", id)
          .eq("locale", locale)
          .eq("version", expected)
          .select("version");
  if (error) return fail(cmsError(error));
  if (!data?.length) return fail("conflict");
  invalidate();
  return done(Number((data[0] as { version: number }).version));
}

export async function deleteMediaAction(
  _previous: CmsActionState,
  formData: FormData,
): Promise<CmsActionState> {
  const decision = await authorizeAdmin("media.write");
  if (decision.kind !== "allow") return fail("forbidden");

  const id = read(formData, "id");
  if (!isUuid(id)) return fail("generic");
  const asset = await getMediaAsset(id).catch(() => null);
  if (!asset) return fail("notFound");
  if (asset.usages.length > 0) return fail("inUse");

  const supabase = await supabaseOrNull();
  if (!supabase) return fail("notConfigured");
  // Database first: references block deletion (ON DELETE RESTRICT), and once
  // the row is gone the files are untracked, so Storage lets us remove them.
  const { data, error } = await supabase.from("media_assets").delete().eq("id", id).select("id");
  if (error) return fail(cmsError(error, "delete"));
  if (!data?.length) return fail("notFound");

  const files = [asset.asset.storage_path, asset.asset.pending_path].filter((path): path is string =>
    Boolean(path),
  );
  if (files.length) {
    // A failure leaves an untracked, private file that cleanup removes later.
    await supabase.storage
      .from("media")
      .remove(files)
      .catch(() => null);
  }
  invalidate();
  redirect("/admin/media");
}

/** Removes untracked files and abandoned uploads older than an hour. */
export async function cleanupMediaAction(): Promise<CmsActionState> {
  const decision = await authorizeAdmin("media.write");
  if (decision.kind !== "allow") return fail("forbidden");

  const supabase = await supabaseOrNull();
  if (!supabase) return fail("notConfigured");
  const candidates = await mediaCleanupCandidates().catch(() => null);
  if (!candidates) return fail("generic");

  let removed = 0;
  for (const candidate of candidates) {
    if (candidate.kind === "stale_upload" && candidate.asset_id) {
      const asset = await getMediaAsset(candidate.asset_id).catch(() => null);
      if (!asset) continue;
      const release =
        asset.asset.status === "pending"
          ? await supabase.from("media_assets").delete().eq("id", candidate.asset_id).select("id")
          : await supabase
              .from("media_assets")
              .update({ pending_path: null })
              .eq("id", candidate.asset_id)
              .eq("version", asset.asset.version)
              .select("id");
      if (release.error || !release.data?.length) continue;
    }
    // Storage reports the files it removed; RLS silently skips tracked ones.
    const { data, error } = await supabase.storage.from("media").remove([candidate.object_name]);
    if (!error) removed += data?.length ?? 0;
  }
  invalidate();
  return done(removed);
}

export type MediaPickerItem = {
  id: string;
  title: string;
  version: number;
  altEn: string | null;
  width: number | null;
  height: number | null;
};

/** Ready images for the picker in content forms. */
export async function searchMediaAction(
  query: string,
  page: number,
): Promise<{ items: MediaPickerItem[]; total: number } | null> {
  const decision = await authorizeAdmin(["content.write", "media.write"]);
  if (decision.kind !== "allow") return null;
  const q = cleanLine(String(query ?? "")).slice(0, 100);
  const pageNumber = Number.isInteger(page) && page >= 1 && page <= 500 ? page : 1;
  const { rows, total } = await listMedia({ q: q || undefined, filter: "ready", page: pageNumber }, 12);
  return {
    total,
    items: rows.map((r) => ({
      id: r.id,
      title: r.title,
      version: r.version,
      altEn: r.alt_en,
      width: r.width,
      height: r.height,
    })),
  };
}
