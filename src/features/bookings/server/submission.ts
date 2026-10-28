import "server-only";
import type { AppLocale } from "@/i18n/routing";
import { isSubmissionKey, parseInquiry, readLocale, type InquiryFieldErrors } from "../inquiry-schema";
import type { CaptchaResult } from "./captcha";
import type { InquiryConfig } from "./config";
import {
  CAPTCHA_TOKEN_RULE,
  captchaTokenBucket,
  checkRateLimits,
  POST_CAPTCHA_LIMITS,
  PRE_CAPTCHA_LIMITS,
  type ConsumeRateLimit,
  type RateLimitNamespace,
  type RateLimitRule,
} from "./rate-limit";
import { InquiryKeyConflictError, type InquiryStore } from "./store";

/*
 * The public submission pipeline shared by the event inquiry and contact
 * forms, independent of Next.js so every branch is unit-tested
 * (tests/unit/inquiry-submission.test.ts, tests/unit/contact-submission.test.ts):
 *
 *   configuration → honeypot → validation → IP limits → CAPTCHA (single use) → mailbox/site limits → insert → email (async)
 *
 * Responses never contain database errors, internal ids or user input.
 */

export type PublicFormState<FieldErrors> =
  | { status: "idle" }
  | { status: "invalid"; fieldErrors: FieldErrors }
  | { status: "success"; reference: string }
  | { status: "rate_limited"; retryAfterMinutes: number }
  | { status: "captcha_failed" }
  | { status: "conflict" }
  | { status: "unavailable" }
  | { status: "error" };

/** "paused": staff have paused new inquiries in Admin → Settings. */
export type InquiryFormState = PublicFormState<InquiryFieldErrors> | { status: "paused" };

/** What the shared pipeline needs, regardless of which form: whether it is open,
 *  the server secret (for hashing rate-limit identifiers) and whether to run a
 *  CAPTCHA. The contact form always passes "skip"; the inquiry form passes
 *  "turnstile" only when its optional Turnstile keys are set. */
export type FormConfig =
  | { available: false; reason: string }
  | { available: true; secretKey: string; captcha: "turnstile" | "skip" };

export type VerifyCaptcha = (
  token: string | undefined,
  remoteIp: string | null,
  idempotencyKey: string,
) => Promise<CaptchaResult>;

export type PublicSubmissionDeps = {
  config: FormConfig;
  consumeRateLimit: ConsumeRateLimit;
  /** Required only when config.captcha is "turnstile". */
  verifyCaptcha?: VerifyCaptcha;
  clientIp: string | null;
  log?: (event: string, detail?: string) => void;
};

export type PublicForm<Data extends { email: string }, FieldErrors> = {
  /** This form's own rate-limit buckets. */
  namespace: RateLimitNamespace;
  logPrefix: string;
  parse: (
    raw: Record<string, string>,
  ) => { success: true; data: Data } | { success: false; fieldErrors: FieldErrors };
  /** Stores a validated submission; throws InquiryKeyConflictError when the key was used for other content. */
  save: (submission: {
    submissionKey: string;
    data: Data;
    locale: AppLocale;
  }) => Promise<{ reference: string; replay: boolean }>;
};

export async function processPublicSubmission<Data extends { email: string }, FieldErrors>(
  raw: Record<string, string>,
  deps: PublicSubmissionDeps,
  form: PublicForm<Data, FieldErrors>,
): Promise<PublicFormState<FieldErrors>> {
  type State = PublicFormState<FieldErrors>;
  const log =
    deps.log ??
    ((event, detail) => console.info(`[${form.logPrefix}] ${event}${detail ? `: ${detail}` : ""}`));
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

  const parsed = form.parse(raw);
  if (!parsed.success) return { status: "invalid", fieldErrors: parsed.fieldErrors };

  const identity = { ip: deps.clientIp, email: parsed.data.email };
  const limited = async (rules: readonly RateLimitRule[]): Promise<State | null> => {
    let decision;
    try {
      decision = await checkRateLimits(
        identity,
        config.secretKey,
        deps.consumeRateLimit,
        rules,
        form.namespace,
      );
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

  if (config.captcha === "turnstile") {
    const token = raw["cf-turnstile-response"];
    const captcha = await deps.verifyCaptcha!(token, deps.clientIp, raw.submissionKey);
    if (!captcha.ok) {
      log("rejected", `captcha ${captcha.reason}`);
      return captcha.reason === "unavailable" ? { status: "error" } : { status: "captcha_failed" };
    }

    // A verified token is accepted once (see CAPTCHA_TOKEN_RULE); the form
    // requests a fresh token after every attempt.
    let firstUse;
    try {
      firstUse = await deps.consumeRateLimit(
        captchaTokenBucket(token ?? "", config.secretKey),
        CAPTCHA_TOKEN_RULE.limit,
        CAPTCHA_TOKEN_RULE.windowSeconds,
      );
    } catch {
      log("error", "rate limiter unavailable");
      return { status: "error" };
    }
    if (!firstUse.allowed) {
      log("rejected", "captcha token reused");
      return { status: "captcha_failed" };
    }
  }

  // Shared budgets (per mailbox, site-wide) count only verified requests, so
  // junk traffic cannot lock real customers out without solving a CAPTCHA.
  const sharedBlocked = await limited(POST_CAPTCHA_LIMITS);
  if (sharedBlocked) return sharedBlocked;

  try {
    const result = await form.save({
      submissionKey: raw.submissionKey,
      data: parsed.data,
      locale: readLocale(raw.locale),
    });
    log(result.replay ? "replayed" : "accepted", result.reference);
    return { status: "success", reference: result.reference };
  } catch (error) {
    if (error instanceof InquiryKeyConflictError) return { status: "conflict" };
    log("error", "insert failed");
    return { status: "error" };
  }
}

export type SubmissionDeps = {
  config: InquiryConfig;
  store: Pick<InquiryStore, "consumeRateLimit" | "submitInquiry">;
  verifyCaptcha: VerifyCaptcha;
  clientIp: string | null;
  /** Queues email delivery to run after the response (only called when email is enabled). */
  scheduleDelivery: () => void;
  log?: (event: string, detail?: string) => void;
};

/** Collapses the full inquiry configuration into what the shared pipeline needs. */
function inquiryFormConfig(config: InquiryConfig): FormConfig {
  if (!config.available) return { available: false, reason: config.reason };
  return {
    available: true,
    secretKey: config.secretKey,
    captcha: config.captcha.mode === "turnstile" ? "turnstile" : "skip",
  };
}

export function processInquirySubmission(
  raw: Record<string, string>,
  deps: SubmissionDeps,
): Promise<InquiryFormState> {
  const notify = deps.config.available && deps.config.email !== null;
  return processPublicSubmission(
    raw,
    {
      config: inquiryFormConfig(deps.config),
      consumeRateLimit: deps.store.consumeRateLimit,
      verifyCaptcha: deps.verifyCaptcha,
      clientIp: deps.clientIp,
      log: deps.log,
    },
    {
      namespace: "inquiry",
      logPrefix: "inquiries",
      parse: (values) => parseInquiry(values),
      save: async ({ submissionKey, data, locale }) => {
        const result = await deps.store.submitInquiry({ submissionKey, inquiry: data, locale, notify });
        if (notify && !result.replay) deps.scheduleDelivery();
        return result;
      },
    },
  );
}
