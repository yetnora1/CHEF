import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cmsError, type CmsError } from "@/features/cms/errors";
import type { ProcessedImage } from "./process-image";

/*
 * Upload orchestration, with the staff member's own Supabase session (Storage
 * policies apply; the server secret key is never used):
 *
 *   1. reserve: the asset row gets a server-generated pending path
 *   2. upload:  Storage accepts the file only at a reserved path, never overwrites
 *   3. finish:  the row points at the file (the database checks it exists)
 *   4. replace: the previous file, now untracked, is removed
 *
 * Every step can fail without leaving anything public: an unfinished asset or
 * an untracked file stays private and appears in the media cleanup list.
 */

export const MEDIA_BUCKET = "media";

export type UploadResult =
  { ok: true; id: string; version: number } | { ok: false; error: CmsError | "uploadFailed" };

const objectName = (assetId: string, ext: string) =>
  `assets/${assetId}/${randomBytes(16).toString("hex")}.${ext}`;

async function putFile(supabase: SupabaseClient, path: string, image: ProcessedImage) {
  return supabase.storage.from(MEDIA_BUCKET).upload(path, image.buffer, {
    contentType: image.mime,
    // Names are never reused (a replacement gets a new one), so caches may keep files.
    cacheControl: "31536000",
    upsert: false,
  });
}

function finish(image: ProcessedImage, path: string) {
  return {
    storage_path: path,
    pending_path: null,
    status: "ready",
    mime_type: image.mime,
    byte_size: image.byteSize,
    width: image.width,
    height: image.height,
  };
}

export async function createMediaAsset(
  supabase: SupabaseClient,
  input: { image: ProcessedImage; title: string; altEn: string | null },
): Promise<UploadResult> {
  const id = randomUUID();
  const path = objectName(id, input.image.ext);

  const reserved = await supabase.from("media_assets").insert({ id, title: input.title, pending_path: path });
  if (reserved.error) return { ok: false, error: cmsError(reserved.error) };

  const uploaded = await putFile(supabase, path, input.image);
  if (uploaded.error) {
    await supabase.from("media_assets").delete().eq("id", id);
    return { ok: false, error: "uploadFailed" };
  }

  const finished = await supabase
    .from("media_assets")
    .update(finish(input.image, path))
    .eq("id", id)
    .select("version");
  if (finished.error || !finished.data?.length) {
    // The pending asset and its file stay private; cleanup removes them.
    return { ok: false, error: finished.error ? cmsError(finished.error) : "uploadFailed" };
  }

  if (input.altEn) {
    await supabase
      .from("media_asset_translations")
      .insert({ asset_id: id, locale: "en", alt_text: input.altEn });
  }
  return { ok: true, id, version: Number((finished.data[0] as { version: number }).version) };
}

export async function replaceMediaFile(
  supabase: SupabaseClient,
  input: { id: string; expectedVersion: number; image: ProcessedImage; previousPath: string | null },
): Promise<UploadResult> {
  const path = objectName(input.id, input.image.ext);
  const reserved = await supabase
    .from("media_assets")
    .update({ pending_path: path })
    .eq("id", input.id)
    .eq("version", input.expectedVersion)
    .select("version");
  if (reserved.error) return { ok: false, error: cmsError(reserved.error) };
  if (!reserved.data?.length) return { ok: false, error: "conflict" };
  const reservedVersion = Number((reserved.data[0] as { version: number }).version);

  const uploaded = await putFile(supabase, path, input.image);
  if (uploaded.error) {
    await supabase
      .from("media_assets")
      .update({ pending_path: null })
      .eq("id", input.id)
      .eq("version", reservedVersion);
    return { ok: false, error: "uploadFailed" };
  }

  const finished = await supabase
    .from("media_assets")
    .update(finish(input.image, path))
    .eq("id", input.id)
    .eq("version", reservedVersion)
    .select("version");
  if (finished.error || !finished.data?.length) {
    return { ok: false, error: finished.error ? cmsError(finished.error) : "conflict" };
  }

  if (input.previousPath) {
    // Untracked now; a failure leaves a private file for cleanup.
    await supabase.storage.from(MEDIA_BUCKET).remove([input.previousPath]);
  }
  return { ok: true, id: input.id, version: Number((finished.data[0] as { version: number }).version) };
}
