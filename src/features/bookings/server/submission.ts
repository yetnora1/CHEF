import "server-only";
import { isSubmissionKey, parseInquiry, readLocale, type InquiryFieldErrors } from "../inquiry-schema";
import type { CaptchaResult } from "./captcha";
import type { InquiryConfig } from "./config";
import { checkRateLimits, POST_CAPTCHA_LIMITS, PRE_CAPTCHA_LIMITS, type RateLimitRule } from "./rate-limit";
import { InquiryKeyConflictError, type InquiryStore } from "./store";

/*
 * The public inquiry pipeline, independent of Next.js so every branch is
 * unit-tested (tests/unit/inquiry-submission.test.ts):
 *
 *   configuration → honeypot → validation → IP limits → CAPTCHA → mailbox/site limits → insert → email (async)
 *
 * Responses never contain database errors, internal ids or user input.
 */

export type InquiryFormState =
  | { status: "idle" }
  | { status: "invalid"; fieldErrors: InquiryFieldErrors }
  | { status: "success"; reference: string }
  | { status: "rate_limited"; retryAfterMinutes: number }
  | { status: "captcha_failed" }
  | { status: "conflict" }
  | { status: "unavailable" }
  | { status: "error" };

export type SubmissionDeps = {
  config: InquiryConfig;
  store: Pick<InquiryStore, "consumeRateLimit" | "submitInquiry">;
  verifyCaptcha: (
    token: string | undefined,
    remoteIp: string | null,
    idempotencyKey: string,
  ) => Promise<CaptchaResult>;
  clientIp: string | null;
  /** Queues email delivery to run after the response (only called when email is enabled). */
  scheduleDelivery: () => void;
  log?: (event: string, detail?: string) => void;
};

export async function processInquirySubmission(
  raw: Record<string, string>,
  deps: SubmissionDeps,
): Promise<InquiryFormState> {
  const log =
    deps.log ?? ((event, detail) => console.info(`[inquiries] ${event}${detail ? `: ${detail}` : ""}`));
  const { config } = deps;

  if (!config.available) {
    log("rejected", `unavailable (${config.reason})`);
    return { status: "unavailable" };
  }

  // Hidden field that people never see or fill; automated form-fillers do.
  if (raw.website) {
    log("rejected", "honeypot");
    return { status: "error" };
  }

  if (!isSubmissionKey(raw.submissionKey)) return { status: "error" };

  const parsed = parseInquiry(raw);
  if (!parsed.success) return { status: "invalid", fieldErrors: parsed.fieldErrors };

  const identity = { ip: deps.clientIp, email: parsed.data.email };
  const limited = async (rules: readonly RateLimitRule[]): Promise<InquiryFormState | null> => {
    let decision;
    try {
      decision = await checkRateLimits(identity, config.secretKey, deps.store.consumeRateLimit, rules);
    } catch {
      log("error", "rate limiter unavailable");
      return { status: "error" };
    }
    if (decision.allowed) return null;
    log("rejected", "rate limited");
    return {
      status: "rate_limited",
      retryAfterMinutes: Math.max(1, Math.ceil(decision.retryAfterSeconds / 60)),
    };
  };

  // Per-IP limits first: they also cap calls to the CAPTCHA provider.
  const ipBlocked = await limited(PRE_CAPTCHA_LIMITS);
  if (ipBlocked) return ipBlocked;

  if (config.captcha.mode === "turnstile") {
    const captcha = await deps.verifyCaptcha(raw["cf-turnstile-response"], deps.clientIp, raw.submissionKey);
    if (!captcha.ok) {
      log("rejected", `captcha ${captcha.reason}`);
      return captcha.reason === "unavailable" ? { status: "error" } : { status: "captcha_failed" };
    }
  }

  // Shared budgets (per mailbox, site-wide) count only verified requests, so
  // junk traffic cannot lock real customers out without solving a CAPTCHA.
  const sharedBlocked = await limited(POST_CAPTCHA_LIMITS);
  if (sharedBlocked) return sharedBlocked;

  try {
    const result = await deps.store.submitInquiry({
      submissionKey: raw.submissionKey,
      inquiry: parsed.data,
      locale: readLocale(raw.locale),
      notify: config.email !== null,
    });
    log(result.replay ? "replayed" : "accepted", result.reference);
    if (config.email !== null && !result.replay) deps.scheduleDelivery();
    return { status: "success", reference: result.reference };
  } catch (error) {
    if (error instanceof InquiryKeyConflictError) return { status: "conflict" };
    log("error", "insert failed");
    return { status: "error" };
  }
}
