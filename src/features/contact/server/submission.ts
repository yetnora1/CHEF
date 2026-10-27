import "server-only";
import type { InquiryStore } from "@/features/bookings/server/store";
import {
  processPublicSubmission,
  type PublicFormState,
  type PublicSubmissionDeps,
} from "@/features/bookings/server/submission";
import { parseContactMessage, type ContactFieldErrors } from "../message-schema";

/*
 * The contact form runs the same pipeline as event inquiries (honeypot,
 * validation, rate limits, single-use CAPTCHA), with its own rate-limit
 * buckets. No email is queued: messages wait in the admin inbox.
 */

export type ContactFormState = PublicFormState<ContactFieldErrors>;

export type ContactSubmissionDeps = Omit<PublicSubmissionDeps, "consumeRateLimit"> & {
  store: Pick<InquiryStore, "consumeRateLimit" | "submitContactMessage">;
};

export function processContactSubmission(
  raw: Record<string, string>,
  deps: ContactSubmissionDeps,
): Promise<ContactFormState> {
  return processPublicSubmission(
    raw,
    { ...deps, consumeRateLimit: deps.store.consumeRateLimit },
    {
      namespace: "contact",
      logPrefix: "contact",
      parse: parseContactMessage,
      save: ({ submissionKey, data, locale }) =>
        deps.store.submitContactMessage({ submissionKey, message: data, locale }),
    },
  );
}
