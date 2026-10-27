"use server";

import { headers } from "next/headers";
import { formDataToRecord } from "@/features/bookings/inquiry-schema";
import { CONTACT_TURNSTILE_ACTION, verifyTurnstile } from "@/features/bookings/server/captcha";
import { getInquiryConfig } from "@/features/bookings/server/config";
import { clientIpFrom } from "@/features/bookings/server/rate-limit";
import { createInquiryStore } from "@/features/bookings/server/store";
import { processContactSubmission, type ContactFormState } from "./server/submission";

/**
 * Public contact form submission. Uses the inquiry form's configuration
 * (storage, CAPTCHA, client IP header), so both forms open and close together.
 * Next.js checks the Origin header of Server Action requests (CSRF) and caps
 * the body size (next.config.ts).
 */
export async function submitContactAction(
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const config = getInquiryConfig();
  const raw = formDataToRecord(formData);

  if (!config.available) {
    return processContactSubmission(raw, {
      config,
      store: { consumeRateLimit: unreachable, submitContactMessage: unreachable },
      verifyCaptcha: unreachable,
      clientIp: null,
    });
  }

  const store = createInquiryStore({ url: config.supabaseUrl, secretKey: config.secretKey });
  const clientIp = clientIpFrom(await headers(), config.clientIpHeader, config.clientIpTrustedHops);
  const captcha = config.captcha;

  return processContactSubmission(raw, {
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
            expectedAction: CONTACT_TURNSTILE_ACTION,
          })
        : Promise.resolve({ ok: true }),
  });
}

async function unreachable(): Promise<never> {
  throw new Error("Contact submissions are not configured");
}
