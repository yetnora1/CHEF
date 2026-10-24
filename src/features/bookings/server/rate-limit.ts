import "server-only";
import { createHash, createHmac } from "node:crypto";

/*
 * Inquiry rate limits, enforced in Postgres (public.consume_rate_limit) so
 * every application instance shares the same counters. Identifiers are
 * HMAC-hashed: raw IP addresses and email addresses are never stored.
 *
 * Two phases, so nobody can exhaust a shared budget without solving a CAPTCHA:
 *  - before CAPTCHA: per-IP buckets only (they also cap calls to Cloudflare)
 *  - after CAPTCHA succeeds: per-email and site-wide buckets
 */

export type RateLimitRule = {
  scope: "ip" | "email" | "global";
  limit: number;
  windowSeconds: number;
};

export const PRE_CAPTCHA_LIMITS: readonly RateLimitRule[] = [
  { scope: "ip", limit: 5, windowSeconds: 10 * 60 },
  { scope: "ip", limit: 20, windowSeconds: 24 * 60 * 60 },
];

export const POST_CAPTCHA_LIMITS: readonly RateLimitRule[] = [
  { scope: "email", limit: 3, windowSeconds: 60 * 60 },
  { scope: "global", limit: 300, windowSeconds: 60 * 60 },
];

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export type ConsumeRateLimit = (
  bucket: string,
  limit: number,
  windowSeconds: number,
) => Promise<{ allowed: boolean; retryAfterSeconds: number }>;

/** Keyed hash: stable per deployment, irreversible without the server secret. */
export function hashIdentifier(value: string, secret: string): string {
  const key = createHash("sha256").update(`chief-harena:rate-limit:${secret}`).digest();
  return createHmac("sha256", key).update(value).digest("base64url").slice(0, 32);
}

/** One mailbox, one bucket: case and "+tag" sub-addressing are ignored. */
export function normaliseEmailForLimit(email: string): string {
  const [local = "", domain = ""] = email.trim().toLowerCase().split("@");
  return `${local.split("+")[0]}@${domain}`;
}

export function rateLimitBuckets(
  identity: { ip: string | null; email: string },
  secret: string,
  rules: readonly RateLimitRule[],
) {
  return rules.map((rule) => {
    const subject =
      rule.scope === "global"
        ? "all"
        : hashIdentifier(
            rule.scope === "ip" ? (identity.ip ?? "unknown") : normaliseEmailForLimit(identity.email),
            secret,
          );
    return { bucket: `inquiry:${rule.scope}:${rule.windowSeconds}:${subject}`, rule };
  });
}

export async function checkRateLimits(
  identity: { ip: string | null; email: string },
  secret: string,
  consume: ConsumeRateLimit,
  rules: readonly RateLimitRule[],
): Promise<RateLimitDecision> {
  const results = await Promise.all(
    rateLimitBuckets(identity, secret, rules).map(({ bucket, rule }) =>
      consume(bucket, rule.limit, rule.windowSeconds),
    ),
  );
  const blocked = results.filter((r) => !r.allowed);
  if (blocked.length === 0) return { allowed: true };
  return { allowed: false, retryAfterSeconds: Math.max(...blocked.map((r) => r.retryAfterSeconds)) };
}

/**
 * The client IP from a header set by a trusted proxy. Lists such as
 * X-Forwarded-For are read from the right: `trustedHops` is the number of
 * proxies you control, so the entry they appended (not one the client sent)
 * is used. Single-value headers (cf-connecting-ip, x-real-ip) use hops = 1.
 */
export function clientIpFrom(headers: Headers, headerName: string, trustedHops = 1): string | null {
  const entries = (headers.get(headerName) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const value = entries[entries.length - Math.max(1, trustedHops)];
  if (!value || value.length > 45 || !/^[0-9a-f:.]+$/i.test(value)) return null;
  return value;
}
