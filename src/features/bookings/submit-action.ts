"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { getPublicSiteSettings } from "@/features/settings/public-data";
import { formDataToRecord } from "./inquiry-schema";
import { verifyTurnstile } from "./server/captcha";
import { getInquiryConfig } from "./server/config";
import { deliverNotifications } from "./server/notifications";
import { clientIpFrom } from "./server/rate-limit";
import { createInquiryStore } from "./server/store";
import { processInquirySubmission, type InquiryFormState } from "./server/submission";

/**
 * Public event inquiry submission. Next.js checks the Origin header of Server
 * Action requests (CSRF) and caps the body size (next.config.ts). Everything
 * else happens in processInquirySubmission.
 *
 * Staff can pause new inquiries in Admin → Settings. This server action is the
 * only way to submit one (submit_inquiry is granted to service_role only), so
 * the check here holds. It is a business switch, not a security control: if
 * the setting cannot be read, the form stays open.
 */
export async function submitInquiryAction(
  _previous: InquiryFormState,
  formData: FormData,
): Promise<InquiryFormState> {
  const config = getInquiryConfig();
  const raw = formDataToRecord(formData);

  if (!config.available) {
    return processInquirySubmission(raw, {
      config,
      store: { consumeRateLimit: unreachable, submitInquiry: unreachable },
      verifyCaptcha: unreachable,
      clientIp: null,
      scheduleDelivery: () => {},
    });
  }

  const settings = await getPublicSiteSettings();
  if (settings?.inquiriesOpen === false) return { status: "paused" };

  const store = createInquiryStore({ url: config.supabaseUrl, secretKey: config.secretKey });
  const clientIp = clientIpFrom(await headers(), config.clientIpHeader, config.clientIpTrustedHops);
  const captcha = config.captcha;
  const email = config.email;

  return processInquirySubmission(raw, {
    config,
    store,
    clientIp,
    verifyCaptcha: (token, remoteIp, idempotencyKey) =>
      captcha.mode === "turnstile"
        ? verifyTurnstile({
            token,
            secretKey: captcha.secretKey,
            remoteIp,
            idempotencyKey,
            expectedHostname: captcha.expectedHostname,
          })
        : Promise.resolve({ ok: true }),
    scheduleDelivery: () => {
      if (!email) return;
      after(async () => {
        try {
          await deliverNotifications({ store, email });
        } catch {
          console.warn("[notifications] delivery run failed; messages stay queued for retry");
        }
      });
    },
  });
}

async function unreachable(): Promise<never> {
  throw new Error("Inquiry submissions are not configured");
}
