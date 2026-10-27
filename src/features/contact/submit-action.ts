"use server";

import { headers } from "next/headers";
import { formDataToRecord } from "@/features/bookings/inquiry-schema";
import { getContactConfig } from "@/features/bookings/server/config";
import { clientIpFrom } from "@/features/bookings/server/rate-limit";
import { createInquiryStore } from "@/features/bookings/server/store";
import { processContactSubmission, type ContactFormState } from "./server/submission";

/**
 * Public contact form submission. The form needs storage (and, in production,
 * a trusted client-IP header for rate limiting) but no CAPTCHA. Next.js checks
 * the Origin header of Server Action requests (CSRF) and caps the body size
 * (next.config.ts).
 */
export async function submitContactAction(
  _previous: ContactFormState,
  formData: FormData,
): Promise<ContactFormState> {
  const config = getContactConfig();
  const raw = formDataToRecord(formData);

  if (!config.available) {
    return processContactSubmission(raw, {
      config,
      store: { consumeRateLimit: unreachable, submitContactMessage: unreachable },
      clientIp: null,
    });
  }

  const store = createInquiryStore({ url: config.supabaseUrl, secretKey: config.secretKey });
  const clientIp = clientIpFrom(await headers(), config.clientIpHeader, config.clientIpTrustedHops);

  return processContactSubmission(raw, { config, store, clientIp });
}

async function unreachable(): Promise<never> {
  throw new Error("Contact submissions are not configured");
}
