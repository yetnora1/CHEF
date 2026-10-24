import "server-only";
import { z } from "zod";
import { isPrivilegedKey, parseSupabasePublicConfig } from "@/lib/supabase/config";

/*
 * Inquiry submission configuration. Resolution is a pure function so every
 * combination is unit-tested (tests/unit/inquiry-config.test.ts).
 *
 * Fail-closed rules:
 *  - Storage needs the Supabase URL and the server-only secret key.
 *  - Production needs a real Cloudflare Turnstile key pair. Cloudflare's
 *    published test keys are refused in production.
 *  - Production needs CLIENT_IP_HEADER: a header the hosting proxy sets, so
 *    clients cannot pick their own rate-limit identity.
 *  - Outside production, a developer may opt out of CAPTCHA with
 *    INQUIRY_LOCAL_CAPTCHA_BYPASS=true. NODE_ENV is "production" for every
 *    `next build`/`next start`, so the bypass cannot apply to a deployed build.
 *  - Email is optional: without a complete provider configuration, inquiries
 *    are still stored and no email is claimed.
 */

export type CaptchaConfig =
  | {
      mode: "turnstile";
      siteKey: string;
      secretKey: string;
      /** In production, tokens must have been issued for this hostname. */
      expectedHostname: string | null;
    }
  | { mode: "local-bypass" };

export type EmailConfig = {
  provider: "resend";
  apiKey: string;
  from: string;
  staffRecipients: string[];
  siteUrl: URL;
};

export type UnavailableReason =
  | "storage-not-configured"
  | "storage-key-not-privileged"
  | "captcha-not-configured"
  | "captcha-test-key-in-production"
  | "client-ip-header-not-configured";

export type InquiryConfig =
  | { available: false; reason: UnavailableReason }
  | {
      available: true;
      supabaseUrl: string;
      secretKey: string;
      captcha: CaptchaConfig;
      email: EmailConfig | null;
      emailProblem: "partial-configuration" | "site-url-required" | null;
      clientIpHeader: string;
      clientIpTrustedHops: number;
    };

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());

const emailAddress = z.string().trim().pipe(z.email());

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optional(z.string()),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optional(z.string()),
  SUPABASE_SECRET_KEY: optional(z.string().trim()),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optional(z.string().trim()),
  TURNSTILE_SECRET_KEY: optional(z.string().trim()),
  INQUIRY_LOCAL_CAPTCHA_BYPASS: optional(z.string().trim()),
  RESEND_API_KEY: optional(z.string().trim()),
  // A plain address or `Display Name <address>`.
  INQUIRY_EMAIL_FROM: optional(
    z
      .string()
      .trim()
      .regex(/^(?:[^<>]+<[^<>\s]+@[^<>\s]+>|[^<>\s]+@[^<>\s]+)$/),
  ),
  // Comma-separated business recipients for new-inquiry notifications.
  INQUIRY_NOTIFY_TO: optional(z.string()),
  NEXT_PUBLIC_SITE_URL: optional(z.url({ protocol: /^https?$/ })),
  CLIENT_IP_HEADER: optional(
    z
      .string()
      .trim()
      .regex(/^[a-z0-9-]{1,64}$/i),
  ),
  // Proxies you control in front of the app (for comma-separated IP headers).
  CLIENT_IP_TRUSTED_HOPS: optional(z.coerce.number().int().min(1).max(5)),
});

/** Cloudflare's documented always-pass/always-fail/spent test secrets. */
export function isTurnstileTestSecret(secret: string): boolean {
  return /^[123]x0{20,}AA$/.test(secret);
}

export function resolveInquiryConfig(
  rawEnv: Record<string, string | undefined>,
  { production }: { production: boolean },
): InquiryConfig {
  // Each variable is parsed on its own: an invalid value disables only the
  // feature that needs it (e.g. a malformed sender address disables email).
  const env = Object.fromEntries(
    Object.entries(envSchema.shape).map(([key, schema]) => {
      const result = schema.safeParse(rawEnv[key]);
      return [key, result.success ? result.data : undefined];
    }),
  ) as z.infer<typeof envSchema>;

  const supabase = parseSupabasePublicConfig({
    url: rawEnv.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: rawEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!supabase.ok || !env.SUPABASE_SECRET_KEY) return { available: false, reason: "storage-not-configured" };
  if (!isPrivilegedKey(env.SUPABASE_SECRET_KEY))
    return { available: false, reason: "storage-key-not-privileged" };

  let captcha: CaptchaConfig;
  if (env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    if (production && isTurnstileTestSecret(env.TURNSTILE_SECRET_KEY)) {
      return { available: false, reason: "captcha-test-key-in-production" };
    }
    captcha = {
      mode: "turnstile",
      siteKey: env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      secretKey: env.TURNSTILE_SECRET_KEY,
      expectedHostname:
        production && env.NEXT_PUBLIC_SITE_URL ? new URL(env.NEXT_PUBLIC_SITE_URL).hostname : null,
    };
  } else if (!production && env.INQUIRY_LOCAL_CAPTCHA_BYPASS === "true") {
    captcha = { mode: "local-bypass" };
  } else {
    return { available: false, reason: "captcha-not-configured" };
  }

  // Per-IP limits are only meaningful with a header the platform's proxy sets.
  // A default would let clients choose their own "IP" (e.g. X-Forwarded-For).
  if (production && !env.CLIENT_IP_HEADER) {
    return { available: false, reason: "client-ip-header-not-configured" };
  }

  const recipients = (env.INQUIRY_NOTIFY_TO ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const recipientsValid = recipients.length > 0 && recipients.every((r) => emailAddress.safeParse(r).success);
  const emailParts = [env.RESEND_API_KEY, env.INQUIRY_EMAIL_FROM, env.INQUIRY_NOTIFY_TO];
  const emailConfigured = Boolean(env.RESEND_API_KEY && env.INQUIRY_EMAIL_FROM && recipientsValid);
  // Staff emails link to the admin, so production needs the real https origin.
  const siteUrlOk =
    !production ||
    (env.NEXT_PUBLIC_SITE_URL !== undefined && new URL(env.NEXT_PUBLIC_SITE_URL).protocol === "https:");
  const emailComplete = emailConfigured && siteUrlOk;

  return {
    available: true,
    supabaseUrl: supabase.config.url,
    secretKey: env.SUPABASE_SECRET_KEY,
    captcha,
    email: emailComplete
      ? {
          provider: "resend",
          apiKey: env.RESEND_API_KEY!,
          from: env.INQUIRY_EMAIL_FROM!,
          staffRecipients: recipients,
          siteUrl: new URL(env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
        }
      : null,
    emailProblem:
      emailConfigured && !siteUrlOk
        ? "site-url-required"
        : !emailComplete && emailParts.some(Boolean)
          ? "partial-configuration"
          : null,
    clientIpHeader: (env.CLIENT_IP_HEADER ?? "x-forwarded-for").toLowerCase(),
    clientIpTrustedHops: env.CLIENT_IP_TRUSTED_HOPS ?? 1,
  };
}

let warnedReason: string | null = null;

export function getInquiryConfig(): InquiryConfig {
  const config = resolveInquiryConfig(process.env as Record<string, string | undefined>, {
    production: process.env.NODE_ENV === "production",
  });

  const warning = !config.available ? config.reason : config.emailProblem;
  if (warning && warning !== warnedReason) {
    warnedReason = warning;
    console.warn(`[inquiries] ${warning}: see README → Event inquiries configuration`);
  }
  return config;
}
