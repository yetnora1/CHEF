import "server-only";
import { z } from "zod";
import { isPrivilegedKey, parseSupabasePublicConfig } from "@/lib/supabase/config";

/*
 * Inquiry submission configuration. Resolution is a pure function so every
 * combination is unit-tested (tests/unit/inquiry-config.test.ts).
 *
 * Fail-closed rules:
 *  - Storage needs the Supabase URL and the server-only secret key.
 *  - Production needs CLIENT_IP_HEADER: a header the hosting proxy sets, so
 *    clients cannot pick their own rate-limit identity. Without a CAPTCHA the
 *    rate limits are the main defence, as for the contact form.
 *  - Cloudflare Turnstile is optional (owner's decision, 2026-10-28): with no
 *    keys the form relies on the honeypot and rate limits. Setting both keys
 *    switches the check on for every submission; then production refuses
 *    Cloudflare's published test keys and needs NEXT_PUBLIC_SITE_URL, whose
 *    hostname tokens are checked against. Only one of the two keys is a
 *    misconfiguration and closes the form rather than silently dropping the check.
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
  | { mode: "none" };

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
  | "captcha-partially-configured"
  | "captcha-test-key-in-production"
  | "site-url-not-configured"
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

// Each variable is parsed on its own: an invalid value disables only the
// feature that needs it (e.g. a malformed sender address disables email).
function parseEnv(rawEnv: Record<string, string | undefined>): z.infer<typeof envSchema> {
  return Object.fromEntries(
    Object.entries(envSchema.shape).map(([key, schema]) => {
      const result = schema.safeParse(rawEnv[key]);
      return [key, result.success ? result.data : undefined];
    }),
  ) as z.infer<typeof envSchema>;
}

export function resolveInquiryConfig(
  rawEnv: Record<string, string | undefined>,
  { production }: { production: boolean },
): InquiryConfig {
  const env = parseEnv(rawEnv);

  const supabase = parseSupabasePublicConfig({
    url: rawEnv.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: rawEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!supabase.ok || !env.SUPABASE_SECRET_KEY) return { available: false, reason: "storage-not-configured" };
  if (!isPrivilegedKey(env.SUPABASE_SECRET_KEY))
    return { available: false, reason: "storage-key-not-privileged" };

  let captcha: CaptchaConfig = { mode: "none" };
  if (Boolean(env.TURNSTILE_SECRET_KEY) !== Boolean(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)) {
    return { available: false, reason: "captcha-partially-configured" };
  }
  if (env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    if (production && isTurnstileTestSecret(env.TURNSTILE_SECRET_KEY)) {
      return { available: false, reason: "captcha-test-key-in-production" };
    }
    // Production tokens must have been solved on this site's hostname. Without
    // a (valid) site URL that check would silently disappear.
    if (production && !env.NEXT_PUBLIC_SITE_URL) {
      return { available: false, reason: "site-url-not-configured" };
    }
    captcha = {
      mode: "turnstile",
      siteKey: env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      secretKey: env.TURNSTILE_SECRET_KEY,
      expectedHostname:
        production && env.NEXT_PUBLIC_SITE_URL ? new URL(env.NEXT_PUBLIC_SITE_URL).hostname : null,
    };
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

/*
 * Contact form configuration. The contact form stores messages but sends no
 * email and does NOT use a CAPTCHA: a hidden honeypot and the per-IP, per-
 * mailbox and site-wide rate limits are its abuse protection. So it needs only
 * storage (and, in production, a trusted client-IP header for the rate limits);
 * it never requires Cloudflare Turnstile.
 */
export type ContactConfig =
  | {
      available: false;
      reason: "storage-not-configured" | "storage-key-not-privileged" | "client-ip-header-not-configured";
    }
  | {
      available: true;
      supabaseUrl: string;
      secretKey: string;
      clientIpHeader: string;
      clientIpTrustedHops: number;
    };

export function resolveContactConfig(
  rawEnv: Record<string, string | undefined>,
  { production }: { production: boolean },
): ContactConfig {
  const env = parseEnv(rawEnv);

  const supabase = parseSupabasePublicConfig({
    url: rawEnv.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: rawEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!supabase.ok || !env.SUPABASE_SECRET_KEY) return { available: false, reason: "storage-not-configured" };
  if (!isPrivilegedKey(env.SUPABASE_SECRET_KEY)) {
    return { available: false, reason: "storage-key-not-privileged" };
  }

  // Per-IP rate limits are only meaningful with a header the platform's proxy
  // sets; without CAPTCHA they are the main defence, so this stays required.
  if (production && !env.CLIENT_IP_HEADER) {
    return { available: false, reason: "client-ip-header-not-configured" };
  }

  return {
    available: true,
    supabaseUrl: supabase.config.url,
    secretKey: env.SUPABASE_SECRET_KEY,
    clientIpHeader: (env.CLIENT_IP_HEADER ?? "x-forwarded-for").toLowerCase(),
    clientIpTrustedHops: env.CLIENT_IP_TRUSTED_HOPS ?? 1,
  };
}

let warnedContactReason: string | null = null;

export function getContactConfig(): ContactConfig {
  const config = resolveContactConfig(process.env as Record<string, string | undefined>, {
    production: process.env.NODE_ENV === "production",
  });
  if (!config.available && config.reason !== warnedContactReason) {
    warnedContactReason = config.reason;
    console.warn(`[contact] ${config.reason}: see README → Event inquiries configuration`);
  }
  return config;
}
