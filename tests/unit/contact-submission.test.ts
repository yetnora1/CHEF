import { describe, expect, it, vi } from "vitest";
import type { InquiryConfig } from "@/features/bookings/server/config";
import { InquiryKeyConflictError } from "@/features/bookings/server/store";
import { processContactSubmission, type ContactSubmissionDeps } from "@/features/contact/server/submission";

/*
 * The contact form shares the inquiry pipeline (every branch is covered in
 * inquiry-submission.test.ts); these tests pin what is specific to it.
 */

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
  subject: "Menu question",
  message: "Do you cater small family dinners at home?",
  consent: "on",
  "cf-turnstile-response": "token",
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
    verifyCaptcha: vi.fn().mockResolvedValue({ ok: true }),
    clientIp: "203.0.113.9",
    ...overrides,
    log: vi.fn(),
  };
  return all as typeof all & { store: typeof store };
}

describe("processContactSubmission", () => {
  it("stores a valid message and returns only the public reference", async () => {
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

  it("counts against its own rate-limit buckets, not the inquiry form's", async () => {
    const d = deps();
    await processContactSubmission(form(), d);
    const buckets = d.store.consumeRateLimit.mock.calls.map(([bucket]) => String(bucket));
    // ip ×2, the single-use CAPTCHA token, then mailbox and site-wide.
    expect(buckets.map((b) => b.split(":").slice(0, 2).join(":"))).toEqual([
      "contact:ip",
      "contact:ip",
      "inquiry:captcha",
      "contact:email",
      "contact:global",
    ]);
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

  it("stays closed when submissions are not configured", async () => {
    const d = deps({ config: { available: false, reason: "storage-not-configured" } });
    expect(await processContactSubmission(form(), d)).toEqual({ status: "unavailable" });
    expect(d.store.submitContactMessage).not.toHaveBeenCalled();
  });

  it("rejects the honeypot, a failed CAPTCHA and a reused key without leaking details", async () => {
    expect(await processContactSubmission(form({ website: "https://spam.test" }), deps())).toEqual({
      status: "error",
    });
    expect(
      await processContactSubmission(
        form(),
        deps({ verifyCaptcha: vi.fn().mockResolvedValue({ ok: false, reason: "rejected" }) }),
      ),
    ).toEqual({ status: "captcha_failed" });

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
