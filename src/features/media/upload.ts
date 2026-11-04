import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cmsError, type CmsError } from "@/features/cms/errors";
import { cleanLine } from "@/lib/text";
import type { ProcessedImage } from "./process-image";
import { sniffVideoType, VIDEO_MAX_BYTES, VIDEO_TYPES, type VideoType } from "./video";

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
 *
 * A video takes the same steps, but the browser sends the file to Storage itself
 * between reserving and finishing: at up to 50 MB it would not fit in a request to
 * the server (Vercel Functions accept 4.5 MB). Finishing checks what arrived.
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

function finish(file: { mime: string; byteSize: number; width: number; height: number }, path: string) {
  return {
    storage_path: path,
    pending_path: null,
    status: "ready",
    mime_type: file.mime,
    byte_size: file.byteSize,
    width: file.width,
    height: file.height,
  };
}

/** A staff-facing title for a file uploaded without one. */
export function titleFromFileName(name: string, fallback: string): string {
  const base = cleanLine(name.replace(/\.[^.]*$/, "").replace(/[_-]+/g, " "));
  return [...base].slice(0, 200).join("") || fallback;
}

/** Reserves a new file name on an existing asset, guarded by its version. */
async function reserveReplacement(
  supabase: SupabaseClient,
  id: string,
  expectedVersion: number,
  path: string,
) {
  const reserved = await supabase
    .from("media_assets")
    .update({ pending_path: path })
    .eq("id", id)
    .eq("version", expectedVersion)
    .select("version");
  if (reserved.error) return { ok: false as const, error: cmsError(reserved.error) };
  if (!reserved.data?.length) return { ok: false as const, error: "conflict" as const };
  return { ok: true as const, version: Number((reserved.data[0] as { version: number }).version) };
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
  const reserved = await reserveReplacement(supabase, input.id, input.expectedVersion, path);
  if (!reserved.ok) return reserved;
  const reservedVersion = reserved.version;

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

export type VideoReservation =
  { ok: true; id: string; path: string; version: number } | { ok: false; error: CmsError };

export async function reserveVideo(
  supabase: SupabaseClient,
  input: { type: VideoType; title: string; altEn: string | null },
): Promise<VideoReservation> {
  const id = randomUUID();
  const path = objectName(id, VIDEO_TYPES[input.type]);
  const { data, error } = await supabase
    .from("media_assets")
    .insert({ id, title: input.title, kind: "video", pending_path: path })
    .select("version");
  if (error) return { ok: false, error: cmsError(error) };
  if (input.altEn) {
    await supabase
      .from("media_asset_translations")
      .insert({ asset_id: id, locale: "en", alt_text: input.altEn });
  }
  return { ok: true, id, path, version: Number((data?.[0] as { version: number }).version) };
}

export async function reserveVideoReplacement(
  supabase: SupabaseClient,
  input: { id: string; expectedVersion: number; type: VideoType },
): Promise<VideoReservation> {
  const path = objectName(input.id, VIDEO_TYPES[input.type]);
  const reserved = await reserveReplacement(supabase, input.id, input.expectedVersion, path);
  return reserved.ok ? { ok: true, id: input.id, path, version: reserved.version } : reserved;
}

/** The file's first bytes and total size, through Storage, so that a large file is not downloaded. */
async function readVideoHead(supabase: SupabaseClient, path: string) {
  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 60);
  if (error || !data) return null;
  const response = await fetch(data.signedUrl, { headers: { Range: "bytes=0-15" }, cache: "no-store" });
  if (!response.ok) return null;
  const byteSize = Number(response.headers.get("content-range")?.split("/")[1]);
  if (!Number.isInteger(byteSize)) return null;
  return { bytes: new Uint8Array(await response.arrayBuffer()), byteSize };
}

export type VideoCompletion = UploadResult | { ok: false; error: "typeMismatch" | "videoTooLarge" };

export async function completeVideo(
  supabase: SupabaseClient,
  input: {
    id: string;
    version: number;
    path: string;
    previousPath: string | null;
    width: number;
    height: number;
  },
): Promise<VideoCompletion> {
  const head = await readVideoHead(supabase, input.path);
  if (!head) return { ok: false, error: "uploadMissing" };
  const mime = sniffVideoType(head.bytes);
  if (!mime || VIDEO_TYPES[mime] !== input.path.split(".").pop()) return { ok: false, error: "typeMismatch" };
  if (head.byteSize > VIDEO_MAX_BYTES) return { ok: false, error: "videoTooLarge" };

  const finished = await supabase
    .from("media_assets")
    .update(finish({ mime, byteSize: head.byteSize, width: input.width, height: input.height }, input.path))
    .eq("id", input.id)
    .eq("version", input.version)
    .select("version");
  if (finished.error) return { ok: false, error: cmsError(finished.error) };
  if (!finished.data?.length) return { ok: false, error: "conflict" };

  if (input.previousPath) {
    // Untracked now; a failure leaves a private file for cleanup.
    await supabase.storage.from(MEDIA_BUCKET).remove([input.previousPath]);
  }
  return { ok: true, id: input.id, version: Number((finished.data[0] as { version: number }).version) };
}

/** Gives up an upload: a new asset goes away, a replacement keeps the file it had. */
export async function releaseVideo(
  supabase: SupabaseClient,
  input: { id: string; version: number; path: string; isNew: boolean },
) {
  const released = input.isNew
    ? await supabase.from("media_assets").delete().eq("id", input.id).select("id")
    : await supabase
        .from("media_assets")
        .update({ pending_path: null })
        .eq("id", input.id)
        .eq("version", input.version)
        .select("id");
  if (released.error || !released.data?.length) return;
  // A failure leaves a private file for cleanup.
  await supabase.storage.from(MEDIA_BUCKET).remove([input.path]);
}
