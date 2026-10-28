import { describe, expect, it, vi } from "vitest";
import { eventDateBounds } from "@/features/bookings/inquiry-schema";
import type { InquiryConfig } from "@/features/bookings/server/config";
import {
  clientIpFrom,
  hashIdentifier,
  normaliseEmailForLimit,
  POST_CAPTCHA_LIMITS,
  PRE_CAPTCHA_LIMITS,
  rateLimitBuckets,
} from "@/features/bookings/server/rate-limit";
import { InquiryKeyConflictError, InquiryStoreError } from "@/features/bookings/server/store";
import { processInquirySubmission, type SubmissionDeps } from "@/features/bookings/server/submission";

const SECRET = "sb_secret_unit_test_secret_value";

const config = (overrides: Partial<Extract<InquiryConfig, { available: true }>> = {}): InquiryConfig => ({
  available: true,
  supabaseUrl: "https://project.supabase.co",
  secretKey: SECRET,
  captcha: { mode: "turnstile", siteKey: "site", secretKey: "captcha-secret", expectedHostname: null },
  email: null,
  emailProblem: null,
  clientIpHeader: "x-forwarded-for",
  clientIpTrustedHops: 1,
  ...overrides,
});

const form = (overrides: Record<string, string> = {}) => ({
  submissionKey: "6f1c9a52-3b0e-4f6e-9a6b-1d2c3e4f5a6b",
  locale: "am",
  fullName: "Selam Tesfaye",
  email: "selam@example.test",
  contactMethod: "email",
  eventType: "corporate",
  eventDate: eventDateBounds().min,
  guestCount: "80",
  requirements: "Lunch for a team offsite",
  consent: "on",
  "cf-turnstile-response": "token",
  ...overrides,
});

function deps(overrides: Partial<SubmissionDeps> = {}) {
  const store = {
    consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    submitInquiry: vi.fn().mockResolvedValue({ reference: "CH-0123456789", replay: false }),
  };
  const all = {
    config: config(),
    store,
    verifyCaptcha: vi.fn().mockResolvedValue({ ok: true }),
    clientIp: "203.0.113.9",
    scheduleDelivery: vi.fn(),
    ...overrides,
    log: vi.fn(),
  };
  return all as typeof all & { store: typeof store };
}

describe("processInquirySubmission", () => {
  it("stores a valid inquiry and returns only the public reference", async () => {
    const d = deps();
    expect(await processInquirySubmission(form(), d)).toEqual({
      status: "success",
      reference: "CH-0123456789",
    });
    expect(d.store.submitInquiry).toHaveBeenCalledWith({
      submissionKey: "6f1c9a52-3b0e-4f6e-9a6b-1d2c3e4f5a6b",
      inquiry: expect.objectContaining({ fullName: "Selam Tesfaye", guestCount: 80 }),
      locale: "am",
      notify: false,
    });
    expect(d.scheduleDelivery).not.toHaveBeenCalled();
  });

  it("fails closed when submissions are not configured", async () => {
    const d = deps({ config: { available: false, reason: "storage-not-configured" } });
    expect(await processInquirySubmission(form(), d)).toEqual({ status: "unavailable" });
    expect(d.store.consumeRateLimit).not.toHaveBeenCalled();
    expect(d.store.submitInquiry).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input without touching storage", async () => {
    const d = deps();
    const result = await processInquirySubmission(form({ email: "nope", guestCount: "0" }), d);
    expect(result).toEqual({
      status: "invalid",
      fieldErrors: { email: "invalidEmail", guestCount: "guestMin" },
    });
    expect(d.store.submitInquiry).not.toHaveBeenCalled();
  });

  it("rejects requests without a valid submission key", async () => {
    expect(await processInquirySubmission(form({ submissionKey: "1" }), deps())).toEqual({ status: "error" });
  });

  it("rejects honeypot submissions without storing them", async () => {
    const d = deps();
    expect(await processInquirySubmission(form({ website: "http://spam.example" }), d)).toEqual({
      status: "error",
    });
    expect(d.store.submitInquiry).not.toHaveBeenCalled();
  });

  it("refuses rate-limited sources before verifying CAPTCHA or storing", async () => {
    const d = deps();
    d.store.consumeRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 420 });
    expect(await processInquirySubmission(form(), d)).toEqual({
      status: "rate_limited",
      retryAfterMinutes: 7,
    });
    expect(d.verifyCaptcha).not.toHaveBeenCalled();
    expect(d.store.submitInquiry).not.toHaveBeenCalled();
  });

  it("charges only per-IP buckets until CAPTCHA succeeds", async () => {
    // Otherwise junk requests could use up a customer's mailbox budget or the
    // site-wide budget without ever solving a challenge.
    const d = deps({ verifyCaptcha: vi.fn().mockResolvedValue({ ok: false, reason: "rejected" }) });
    await processInquirySubmission(form(), d);
    const scopes = d.store.consumeRateLimit.mock.calls.map(([bucket]) => String(bucket).split(":")[1]);
    expect(scopes).toEqual(["ip", "ip"]);
  });

  it("applies mailbox and site-wide limits after CAPTCHA", async () => {
    const d = deps();
    d.store.consumeRateLimit
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 3000 });
    expect(await processInquirySubmission(form(), d)).toEqual({
      status: "rate_limited",
      retryAfterMinutes: 50,
    });
    expect(d.verifyCaptcha).toHaveBeenCalledTimes(1);
    expect(d.store.consumeRateLimit.mock.calls.map(([bucket]) => String(bucket).split(":")[1])).toEqual([
      "ip",
      "ip",
      "captcha",
      "email",
      "global",
    ]);
    expect(d.store.submitInquiry).not.toHaveBeenCalled();
  });

  it("accepts each solved CAPTCHA token only once", async () => {
    // Cloudflare repeats its first answer for a token resent with the same
    // idempotency key, so a replayed token still verifies.
    const d = deps();
    d.store.consumeRateLimit
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: true, retryAfterSeconds: 0 })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 86000 });
    expect(await processInquirySubmission(form(), d)).toEqual({ status: "captcha_failed" });
    const buckets = d.store.consumeRateLimit.mock.calls.map(([bucket]) => String(bucket));
    // The replay is refused before it can be charged to the mailbox or site-wide budgets.
    expect(buckets.map((b) => b.split(":")[1])).toEqual(["ip", "ip", "captcha"]);
    expect(d.store.consumeRateLimit.mock.calls[2]!.slice(1)).toEqual([1, 86400]);
    expect(d.store.submitInquiry).not.toHaveBeenCalled();
  });

  it("keys the CAPTCHA bucket on a hash of the token, never the token itself", async () => {
    const d = deps();
    await processInquirySubmission(form({ "cf-turnstile-response": "XXXX.DUMMY.TOKEN.XXXX" }), d);
    await processInquirySubmission(form({ "cf-turnstile-response": "another-token" }), d);
    const captchaBuckets = d.store.consumeRateLimit.mock.calls
      .map(([bucket]) => String(bucket))
      .filter((bucket) => bucket.startsWith("inquiry:captcha:"));
    expect(captchaBuckets).toHaveLength(2);
    expect(captchaBuckets[0]).not.toBe(captchaBuckets[1]);
    for (const bucket of captchaBuckets) expect(bucket).not.toMatch(/DUMMY|another-token/);
  });

  it("fails closed when the rate limiter is unavailable", async () => {
    const d = deps();
    d.store.consumeRateLimit.mockRejectedValue(
      new InquiryStoreError("consume_rate_limit", new Error("down")),
    );
    expect(await processInquirySubmission(form(), d)).toEqual({ status: "error" });
    expect(d.store.submitInquiry).not.toHaveBeenCalled();
  });

  it("rejects failed CAPTCHA verification", async () => {
    const d = deps({ verifyCaptcha: vi.fn().mockResolvedValue({ ok: false, reason: "rejected" }) });
    expect(await processInquirySubmission(form(), d)).toEqual({ status: "captcha_failed" });
    expect(d.store.submitInquiry).not.toHaveBeenCalled();
  });

  it("treats an unreachable CAPTCHA provider as an error, not a pass", async () => {
    const d = deps({ verifyCaptcha: vi.fn().mockResolvedValue({ ok: false, reason: "unavailable" }) });
    expect(await processInquirySubmission(form(), d)).toEqual({ status: "error" });
    expect(d.store.submitInquiry).not.toHaveBeenCalled();
  });

  it("without Turnstile keys skips the CAPTCHA but still applies every rate limit", async () => {
    const d = deps({ config: config({ captcha: { mode: "none" } }) });
    expect((await processInquirySubmission(form(), d)).status).toBe("success");
    expect(d.verifyCaptcha).not.toHaveBeenCalled();
    const scopes = d.store.consumeRateLimit.mock.calls.map(([bucket]) => String(bucket).split(":")[1]);
    expect(scopes).not.toContain("captcha");
    expect(new Set(scopes)).toEqual(new Set(["ip", "email", "global"]));
  });

  it("returns the original reference for a retried submission and does not re-send email", async () => {
    const d = deps({ config: config({ email: {} as never }) });
    d.store.submitInquiry.mockResolvedValue({ reference: "CH-0123456789", replay: true });
    expect(await processInquirySubmission(form(), d)).toEqual({
      status: "success",
      reference: "CH-0123456789",
    });
    expect(d.scheduleDelivery).not.toHaveBeenCalled();
  });

  it("reports a reused submission key with different content as a conflict", async () => {
    const d = deps();
    d.store.submitInquiry.mockRejectedValue(new InquiryKeyConflictError());
    expect(await processInquirySubmission(form(), d)).toEqual({ status: "conflict" });
  });

  it("hides storage errors from the visitor", async () => {
    const d = deps();
    d.store.submitInquiry.mockRejectedValue(
      new InquiryStoreError("submit_inquiry", { message: "relation does not exist" }),
    );
    const result = await processInquirySubmission(form(), d);
    expect(result).toEqual({ status: "error" });
    expect(JSON.stringify(result)).not.toMatch(/relation|submit_inquiry/);
  });

  it("queues email only after the inquiry is stored, when email is enabled", async () => {
    const d = deps({ config: config({ email: {} as never }) });
    await processInquirySubmission(form(), d);
    expect(d.store.submitInquiry).toHaveBeenCalledWith(expect.objectContaining({ notify: true }));
    expect(d.scheduleDelivery).toHaveBeenCalledTimes(1);
  });

  it("never logs personal data", async () => {
    const d = deps();
    await processInquirySubmission(form(), d);
    await processInquirySubmission(form({ email: "bad" }), d);
    const logged = JSON.stringify(d.log.mock.calls);
    expect(logged).not.toMatch(/Selam|selam@example|203\.0\.113/);
  });
});

describe("rate-limit buckets", () => {
  it("never contain raw IP or email addresses", () => {
    const buckets = rateLimitBuckets({ ip: "203.0.113.9", email: "selam@example.test" }, SECRET, [
      ...PRE_CAPTCHA_LIMITS,
      ...POST_CAPTCHA_LIMITS,
    ]);
    for (const { bucket } of buckets) expect(bucket).not.toMatch(/203\.0\.113|selam|example/);
    expect(buckets.map((b) => b.bucket.split(":").slice(0, 3).join(":"))).toEqual([
      "inquiry:ip:600",
      "inquiry:ip:86400",
      "inquiry:email:3600",
      "inquiry:global:3600",
    ]);
  });

  it("treat case and +tag variants of an address as one mailbox", () => {
    expect(normaliseEmailForLimit(" Selam+offsite@Example.Test ")).toBe("selam@example.test");
    const bucket = (email: string) =>
      rateLimitBuckets({ ip: null, email }, SECRET, POST_CAPTCHA_LIMITS)[0]!.bucket;
    expect(bucket("SELAM+a@example.test")).toBe(bucket("selam@example.test"));
    expect(bucket("other@example.test")).not.toBe(bucket("selam@example.test"));
  });

  it("hash identifiers with the server secret (different deployments, different hashes)", () => {
    expect(hashIdentifier("203.0.113.9", "secret-a")).not.toBe(hashIdentifier("203.0.113.9", "secret-b"));
    expect(hashIdentifier("203.0.113.9", "secret-a")).toBe(hashIdentifier("203.0.113.9", "secret-a"));
  });
});

describe("clientIpFrom", () => {
  const headers = (value: string) => new Headers({ "x-forwarded-for": value, "cf-connecting-ip": value });

  it("reads single-value proxy headers", () => {
    expect(clientIpFrom(headers("198.51.100.4"), "cf-connecting-ip")).toBe("198.51.100.4");
    expect(clientIpFrom(headers("2001:db8::1"), "cf-connecting-ip")).toBe("2001:db8::1");
  });

  it("uses the entry appended by the trusted proxy, not one the client sent", () => {
    // The client sent "1.1.1.1"; the platform proxy appended the real address.
    expect(clientIpFrom(headers("1.1.1.1, 198.51.100.4"), "x-forwarded-for")).toBe("198.51.100.4");
    // Two proxies you control: the outer one recorded the client, the inner one the outer proxy.
    expect(clientIpFrom(headers("1.1.1.1, 198.51.100.4, 10.0.0.2"), "x-forwarded-for", 2)).toBe(
      "198.51.100.4",
    );
  });

  it("returns null for missing, short or malformed values", () => {
    expect(clientIpFrom(new Headers(), "x-forwarded-for")).toBeNull();
    expect(clientIpFrom(headers("198.51.100.4"), "x-forwarded-for", 2)).toBeNull();
    expect(clientIpFrom(headers("not-an-ip"), "x-forwarded-for")).toBeNull();
    expect(clientIpFrom(headers("<script>"), "x-forwarded-for")).toBeNull();
  });
});
