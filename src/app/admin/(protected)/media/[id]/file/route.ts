import { getMediaAsset } from "@/features/cms/admin-data";
import { MEDIA_BUCKET } from "@/features/media/upload";
import { authorizeAdminRequest } from "@/lib/auth/staff-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
 * An image as staff see it (including drafts), for admin thumbnails and
 * previews. Read with the staff member's own session, so Storage policies
 * decide; never cached or shared.
 */

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

export async function GET(_request: Request, { params }: RouteContext<"/admin/media/[id]/file">) {
  const decision = await authorizeAdminRequest(["content.read", "media.write"]);
  if (decision.kind !== "allow") {
    return new Response(null, { status: decision.kind === "login" ? 401 : 403, headers: PRIVATE_HEADERS });
  }

  const { id } = await params;
  const asset = await getMediaAsset(id).catch(() => null);
  const supabase = await createSupabaseServerClient();
  if (!asset?.asset.storage_path || !asset.asset.mime_type || !supabase) {
    return new Response(null, { status: 404, headers: PRIVATE_HEADERS });
  }

  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(asset.asset.storage_path);
  if (error || !data) return new Response(null, { status: 404, headers: PRIVATE_HEADERS });

  return new Response(data, {
    headers: { ...PRIVATE_HEADERS, "Content-Type": asset.asset.mime_type, "Content-Disposition": "inline" },
  });
}
