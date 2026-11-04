import { MEDIA_BUCKET } from "@/features/media/upload";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";

/*
 * Public files: /media/assets/<asset id>/<file>. Read as an anonymous visitor,
 * so Storage serves a file only while the website uses it (policy
 * "chief_media: public read …"). Files are never renamed in place, so a short
 * cache is safe; after unpublishing, caches (including the image optimiser,
 * images.minimumCacheTTL) may keep a copy for up to five minutes.
 *
 * A video redirects to a short-lived Storage link instead of passing through here:
 * players need range requests, and a Vercel Function cannot send a response this
 * big. The link stays valid long enough to finish playing a clip, but a deleted
 * file is gone at once, because deleting removes it from Storage.
 */

const NAME =
  /^assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{32}\.(jpg|png|webp|mp4|webm)$/;
const IMAGE_TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
const VIDEO_LINK_SECONDS = 60 * 60;
const CACHE_CONTROL = "public, max-age=300, s-maxage=300";

const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

const notFound = () =>
  new Response(null, { status: 404, headers: { ...BASE_HEADERS, "Cache-Control": "no-store" } });

export async function GET(_request: Request, { params }: RouteContext<"/media/[...path]">) {
  const { path } = await params;
  const name = path.join("/");
  const match = NAME.exec(name);
  const supabase = createSupabaseAnonClient();
  if (!match || !supabase) return notFound();

  const type = IMAGE_TYPES[match[1] as keyof typeof IMAGE_TYPES];
  if (!type) {
    const { data, error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .createSignedUrl(name, VIDEO_LINK_SECONDS);
    if (error || !data) return notFound();
    return new Response(null, {
      status: 302,
      headers: { ...BASE_HEADERS, Location: data.signedUrl, "Cache-Control": CACHE_CONTROL },
    });
  }

  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(name);
  if (error || !data) return notFound();

  return new Response(data, {
    headers: {
      ...BASE_HEADERS,
      "Content-Type": type,
      "Content-Disposition": "inline",
      "Cache-Control": CACHE_CONTROL,
    },
  });
}
