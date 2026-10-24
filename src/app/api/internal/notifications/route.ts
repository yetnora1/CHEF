import { createHash, timingSafeEqual } from "node:crypto";
import { getInquiryConfig } from "@/features/bookings/server/config";
import { deliverNotifications } from "@/features/bookings/server/notifications";
import { createInquiryStore } from "@/features/bookings/server/store";

/*
 * Retries queued inquiry emails. Intended for a scheduler (e.g. Vercel Cron,
 * which sends `Authorization: Bearer $CRON_SECRET`). Responds 404 unless both
 * CRON_SECRET (≥ 32 characters) and email delivery are configured, so the
 * endpoint does not exist on deployments that do not use it.
 */

function authorized(request: Request, secret: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`));
}

async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const config = getInquiryConfig();
  if (!secret || secret.length < 32 || !config.available || !config.email) {
    return new Response(null, { status: 404 });
  }
  if (!authorized(request, secret)) return new Response(null, { status: 401 });

  try {
    const report = await deliverNotifications({
      store: createInquiryStore({ url: config.supabaseUrl, secretKey: config.secretKey }),
      email: config.email,
      limit: 25,
    });
    return Response.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "delivery run failed" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export const GET = handle;
export const POST = handle;
