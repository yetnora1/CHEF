import { describe, expect, it } from "vitest";
import { isTurnstileTestSecret, resolveInquiryConfig } from "@/features/bookings/server/config";

const base = {
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abcdefghijklmnopqrst",
  SUPABASE_SECRET_KEY: "sb_secret_abcdefghijklmnopqrstuvwx",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAAreal-site-key",
  TURNSTILE_SECRET_KEY: "0x4AAAAAAAreal-secret-key-value",
  CLIENT_IP_HEADER: "CF-Connecting-IP",
  NEXT_PUBLIC_SITE_URL: "https://chefharena.example",
};

const emailEnv = {
  RESEND_API_KEY: "re_test_key",
  INQUIRY_EMAIL_FROM: "Chef Harena <inquiries@mail.example>",
  INQUIRY_NOTIFY_TO: "owner@example.test, events@example.test",
};

const PASS_SECRET = "1x0000000000000000000000000000000AA";
const PASS_SITE = "1x00000000000000000000AA";

describe("resolveInquiryConfig", () => {
  it("is available in production with storage and a real Turnstile key pair", () => {
    const config = resolveInquiryConfig(base, { production: true });
    expect(config).toMatchObject({
      available: true,
      captcha: { mode: "turnstile", expectedHostname: "chefharena.example" },
      email: null,
      clientIpHeader: "cf-connecting-ip",
      clientIpTrustedHops: 1,
    });
  });

  it("checks the CAPTCHA hostname only in production", () => {
    expect(resolveInquiryConfig(base, { production: false })).toMatchObject({
      captcha: { mode: "turnstile", expectedHostname: null },
    });
  });

  it("fails closed without the server secret key", () => {
    expect(resolveInquiryConfig({ ...base, SUPABASE_SECRET_KEY: "" }, { production: true })).toEqual({
      available: false,
      reason: "storage-not-configured",
    });
  });

  it("refuses a non-privileged key in the secret-key variable", () => {
    expect(
      resolveInquiryConfig(
        { ...base, SUPABASE_SECRET_KEY: "sb_publishable_abcdefghijklmnopqrst" },
        { production: true },
      ),
    ).toEqual({ available: false, reason: "storage-key-not-privileged" });
  });

  it("fails closed in production without CAPTCHA keys", () => {
    const env = { ...base, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "", TURNSTILE_SECRET_KEY: "" };
    expect(resolveInquiryConfig(env, { production: true })).toEqual({
      available: false,
      reason: "captcha-not-configured",
    });
  });

  it("never honours the local CAPTCHA bypass in production", () => {
    const env = {
      ...base,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
      TURNSTILE_SECRET_KEY: "",
      INQUIRY_LOCAL_CAPTCHA_BYPASS: "true",
    };
    expect(resolveInquiryConfig(env, { production: true })).toMatchObject({ available: false });
    expect(resolveInquiryConfig(env, { production: false })).toMatchObject({
      available: true,
      captcha: { mode: "local-bypass" },
    });
  });

  it("requires an explicit opt-in for the local bypass outside production", () => {
    const env = { ...base, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "", TURNSTILE_SECRET_KEY: "" };
    expect(resolveInquiryConfig(env, { production: false })).toMatchObject({ available: false });
  });

  it("refuses Cloudflare test keys in production but allows them locally", () => {
    const env = { ...base, NEXT_PUBLIC_TURNSTILE_SITE_KEY: PASS_SITE, TURNSTILE_SECRET_KEY: PASS_SECRET };
    expect(resolveInquiryConfig(env, { production: true })).toEqual({
      available: false,
      reason: "captcha-test-key-in-production",
    });
    expect(resolveInquiryConfig(env, { production: false })).toMatchObject({ available: true });
    expect(isTurnstileTestSecret(PASS_SECRET)).toBe(true);
    expect(isTurnstileTestSecret(base.TURNSTILE_SECRET_KEY)).toBe(false);
  });

  it("enables email only with a complete, valid configuration", () => {
    const email = emailEnv;
    expect(resolveInquiryConfig({ ...base, ...email }, { production: true })).toMatchObject({
      email: { staffRecipients: ["owner@example.test", "events@example.test"] },
      emailProblem: null,
    });
    expect(
      resolveInquiryConfig({ ...base, ...email, INQUIRY_NOTIFY_TO: "" }, { production: true }),
    ).toMatchObject({
      available: true,
      email: null,
      emailProblem: "partial-configuration",
    });
    expect(
      resolveInquiryConfig({ ...base, ...email, INQUIRY_NOTIFY_TO: "not-an-email" }, { production: true }),
    ).toMatchObject({ email: null, emailProblem: "partial-configuration" });
  });

  it("fails closed in production without the site URL whose hostname CAPTCHA tokens must match", () => {
    // Otherwise the hostname check would silently be skipped.
    for (const NEXT_PUBLIC_SITE_URL of ["", "not a url", "ftp://chefharena.example"]) {
      expect(resolveInquiryConfig({ ...base, NEXT_PUBLIC_SITE_URL }, { production: true })).toEqual({
        available: false,
        reason: "site-url-not-configured",
      });
      expect(resolveInquiryConfig({ ...base, NEXT_PUBLIC_SITE_URL }, { production: false })).toMatchObject({
        available: true,
        captcha: { mode: "turnstile", expectedHostname: null },
      });
    }
  });

  it("requires an https site URL for email in production (staff links point to it)", () => {
    expect(
      resolveInquiryConfig(
        { ...base, ...emailEnv, NEXT_PUBLIC_SITE_URL: "http://chefharena.example" },
        { production: true },
      ),
    ).toMatchObject({ available: true, email: null, emailProblem: "site-url-required" });
    expect(
      resolveInquiryConfig({ ...base, ...emailEnv, NEXT_PUBLIC_SITE_URL: "" }, { production: false }),
    ).toMatchObject({ email: { siteUrl: new URL("http://localhost:3000") }, emailProblem: null });
  });

  it("fails closed in production without a proxy-set client IP header", () => {
    // Defaulting to X-Forwarded-For would let each request pick its own identity.
    for (const CLIENT_IP_HEADER of ["", "x bad header"]) {
      expect(resolveInquiryConfig({ ...base, CLIENT_IP_HEADER }, { production: true })).toEqual({
        available: false,
        reason: "client-ip-header-not-configured",
      });
      expect(resolveInquiryConfig({ ...base, CLIENT_IP_HEADER }, { production: false })).toMatchObject({
        available: true,
        clientIpHeader: "x-forwarded-for",
      });
    }
  });

  it("reads the trusted proxy hop count within 1 to 5", () => {
    expect(
      resolveInquiryConfig({ ...base, CLIENT_IP_TRUSTED_HOPS: "2" }, { production: true }),
    ).toMatchObject({
      clientIpTrustedHops: 2,
    });
    for (const hops of ["0", "6", "two"]) {
      expect(
        resolveInquiryConfig({ ...base, CLIENT_IP_TRUSTED_HOPS: hops }, { production: true }),
      ).toMatchObject({ clientIpTrustedHops: 1 });
    }
  });
});
