import { describe, expect, it, vi } from "vitest";
import type { ContactConfig } from "@/features/bookings/server/config";
import { InquiryKeyConflictError } from "@/features/bookings/server/store";
import { processContactSubmission, type ContactSubmissionDeps } from "@/features/contact/server/submission";

/*
 * The contact form shares the inquiry pipeline (every branch is covered in
 * inquiry-submission.test.ts); these tests pin what is specific to it: its own
 * rate-limit buckets and no CAPTCHA (honeypot + rate limits only).
 */

const SECRET = "sb_secret_unit_test_secret_value";

const config = (): ContactConfig => ({
  available: true,
  supabaseUrl: "https://project.supabase.co",
  secretKey: SECRET,
  clientIpHeader: "x-forwarded-for",
  clientIpTrustedHops: 1,
});

const form = (overrides: Record<string, string> = {}) => ({
  submissionKey: "6f1c9a52-3b0e-4f6e-9a6b-1d2c3e4f5a6b",
  locale: "am",
  fullName: "Selam Tesfaye",
  email: "selam@example.test",
  subject: "Menu question",
  message: "Do you cater small family dinners at home?",
  consent: "on",
  ...overrides,
});

function deps(overrides: Partial<ContactSubmissionDeps> = {}) {
  const store = {
    consumeRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterSeconds: 0 }),
    submitContactMessage: vi.fn().mockResolvedValue({ reference: "CM-0123456789", replay: false }),
  };
  const all = {
    config: config(),
    store,
    clientIp: "203.0.113.9",
    ...overrides,
    log: vi.fn(),
  };
  return all as typeof all & { store: typeof store };
}

describe("processContactSubmission", () => {
  it("stores a valid message without any CAPTCHA and returns only the public reference", async () => {
    const d = deps();
    expect(await processContactSubmission(form(), d)).toEqual({
      status: "success",
      reference: "CM-0123456789",
    });
    expect(d.store.submitContactMessage).toHaveBeenCalledWith({
      submissionKey: form().submissionKey,
      message: {
        fullName: "Selam Tesfaye",
        email: "selam@example.test",
        phone: null,
        subject: "Menu question",
        message: "Do you cater small family dinners at home?",
      },
      locale: "am",
    });
  });

  it("counts against its own rate-limit buckets and charges no CAPTCHA token", async () => {
    const d = deps();
    await processContactSubmission(form(), d);
    const buckets = d.store.consumeRateLimit.mock.calls.map(([bucket]) => String(bucket));
    // Per-IP twice, then mailbox and site-wide; never the inquiry form's, never a CAPTCHA bucket.
    expect(buckets.map((b) => b.split(":").slice(0, 2).join(":"))).toEqual([
      "contact:ip",
      "contact:ip",
      "contact:email",
      "contact:global",
    ]);
  });

  it("is still rate limited per IP, with a retry time and nothing stored", async () => {
    const d = deps();
    d.store.consumeRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 300 });
    expect(await processContactSubmission(form(), d)).toEqual({
      status: "rate_limited",
      retryAfterMinutes: 5,
    });
    expect(d.store.submitContactMessage).not.toHaveBeenCalled();
  });

  it("returns field codes and stores nothing for an invalid message", async () => {
    const d = deps();
    expect(await processContactSubmission(form({ message: "", consent: "" }), d)).toEqual({
      status: "invalid",
      fieldErrors: { message: "required", consent: "consentRequired" },
    });
    expect(d.store.consumeRateLimit).not.toHaveBeenCalled();
    expect(d.store.submitContactMessage).not.toHaveBeenCalled();
  });

  it("stays closed when storage is not configured", async () => {
    const d = deps({ config: { available: false, reason: "storage-not-configured" } });
    expect(await processContactSubmission(form(), d)).toEqual({ status: "unavailable" });
    expect(d.store.submitContactMessage).not.toHaveBeenCalled();
  });

  it("rejects the honeypot and a reused key without leaking details", async () => {
    const honeypot = deps();
    expect(await processContactSubmission(form({ website: "https://spam.test" }), honeypot)).toEqual({
      status: "error",
    });
    expect(honeypot.store.submitContactMessage).not.toHaveBeenCalled();

    const conflicting = deps();
    conflicting.store.submitContactMessage.mockRejectedValue(new InquiryKeyConflictError());
    expect(await processContactSubmission(form(), conflicting)).toEqual({ status: "conflict" });

    const failing = deps();
    failing.store.submitContactMessage.mockRejectedValue(new Error("connection refused at 10.0.0.5"));
    const result = await processContactSubmission(form(), failing);
    expect(result).toEqual({ status: "error" });
    expect(JSON.stringify(failing.log.mock.calls)).not.toContain("10.0.0.5");
  });
});
