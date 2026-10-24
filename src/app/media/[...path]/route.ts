import { MEDIA_BUCKET } from "@/features/media/upload";
import { createSupabaseAnonClient } from "@/lib/supabase/anon";

/*
 * Public images: /media/assets/<asset id>/<file>. Read as an anonymous visitor,
 * so Storage serves a file only while published content uses it (policy
 * "chief_media: public read …"). Files are never renamed in place, so a short
 * cache is safe; after unpublishing, caches (including the image optimiser,
 * images.minimumCacheTTL) may keep a copy for up to five minutes.
 */

const NAME =
  /^assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{32}\.(jpg|png|webp)$/;
const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;

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

  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).download(name);
  if (error || !data) return notFound();

  return new Response(data, {
    headers: {
      ...BASE_HEADERS,
      "Content-Type": TYPES[match[1] as keyof typeof TYPES],
      "Content-Disposition": "inline",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
