import "server-only";
import type { ContactConfig } from "@/features/bookings/server/config";
import {
  processPublicSubmission,
  type FormConfig,
  type PublicFormState,
} from "@/features/bookings/server/submission";
import type { InquiryStore } from "@/features/bookings/server/store";
import { parseContactMessage, type ContactFieldErrors } from "../message-schema";

/*
 * The contact form runs the shared submission pipeline (honeypot, validation,
 * rate limits) with its own rate-limit buckets and NO CAPTCHA. No email is
 * queued: messages wait in the admin inbox.
 */

export type ContactFormState = PublicFormState<ContactFieldErrors>;

export type ContactSubmissionDeps = {
  config: ContactConfig;
  store: Pick<InquiryStore, "consumeRateLimit" | "submitContactMessage">;
  clientIp: string | null;
  log?: (event: string, detail?: string) => void;
};

export function processContactSubmission(
  raw: Record<string, string>,
  deps: ContactSubmissionDeps,
): Promise<ContactFormState> {
  const formConfig: FormConfig = deps.config.available
    ? { available: true, secretKey: deps.config.secretKey, captcha: "skip" }
    : { available: false, reason: deps.config.reason };

  return processPublicSubmission(
    raw,
    {
      config: formConfig,
      consumeRateLimit: deps.store.consumeRateLimit,
      clientIp: deps.clientIp,
      log: deps.log,
    },
    {
      namespace: "contact",
      logPrefix: "contact",
      parse: parseContactMessage,
      save: ({ submissionKey, data, locale }) =>
        deps.store.submitContactMessage({ submissionKey, message: data, locale }),
    },
  );
}
