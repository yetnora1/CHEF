import { revalidateTag } from "next/cache";
import { getMediaAsset } from "@/features/cms/admin-data";
import { CMS_CACHE_TAG } from "@/features/cms/cache-tags";
import { MEDIA_LIMITS, processImage } from "@/features/media/process-image";
import { createMediaAsset, replaceMediaFile } from "@/features/media/upload";
import { authorizeAdminRequest } from "@/lib/auth/staff-session";
import { isSameOriginRequest } from "@/lib/http";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cleanLine } from "@/lib/text";

/*
 * Media upload (new image, or a replacement file for an existing one).
 * A Route Handler rather than a Server Action: server actions are capped at
 * 64 KB (next.config.ts) to protect the inquiry form, and files need more.
 * Order: CSRF guard → size cap → permission (media.write) → content
 * validation and re-encoding (process-image.ts) → Storage with the user's own
 * session (upload.ts). Responses carry stable error codes only.
 */

const MAX_BODY = MEDIA_LIMITS.maxBytes + 64 * 1024;

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function titleFromFileName(name: string): string {
  const base = cleanLine(name.replace(/\.[^.]*$/, "").replace(/[_-]+/g, " "));
  return [...base].slice(0, 200).join("") || "Image";
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return json(403, { ok: false, error: "forbidden" });

  const length = Number(request.headers.get("content-length"));
  if (!Number.isFinite(length) || length <= 0) return json(411, { ok: false, error: "invalid" });
  if (length > MAX_BODY) return json(413, { ok: false, error: "tooLarge" });

  const decision = await authorizeAdminRequest("media.write");
  if (decision.kind === "login") return json(401, { ok: false, error: "signedOut" });
  if (decision.kind === "forbidden") return json(403, { ok: false, error: "forbidden" });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { ok: false, error: "invalid" });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json(400, { ok: false, error: "invalid" });
  if (file.size > MEDIA_LIMITS.maxBytes) return json(413, { ok: false, error: "tooLarge" });

  const processed = await processImage({
    bytes: new Uint8Array(await file.arrayBuffer()),
    declaredType: file.type,
    fileName: file.name,
  });
  if (!processed.ok) return json(422, { ok: false, error: processed.reason });

  const supabase = await createSupabaseServerClient();
  if (!supabase) return json(503, { ok: false, error: "notConfigured" });

  const replace = form.get("replace");
  if (typeof replace === "string" && replace) {
    const asset = await getMediaAsset(replace).catch(() => null);
    if (!asset) return json(404, { ok: false, error: "notFound" });
    const result = await replaceMediaFile(supabase, {
      id: asset.asset.id,
      expectedVersion: Number(form.get("version")),
      image: processed.image,
      previousPath: asset.asset.storage_path,
    });
    if (!result.ok) return json(result.error === "conflict" ? 409 : 500, result);
    // Pages may show this image: refresh public content now.
    revalidateTag(CMS_CACHE_TAG, { expire: 0 });
    return json(200, result);
  }

  const title = cleanLine(String(form.get("title") ?? "")) || titleFromFileName(file.name);
  const altEn = cleanLine(String(form.get("alt_en") ?? ""));
  if ([...title].length > 200 || [...altEn].length > 300) return json(400, { ok: false, error: "invalid" });

  const result = await createMediaAsset(supabase, { image: processed.image, title, altEn: altEn || null });
  return json(result.ok ? 201 : 500, result);
}
