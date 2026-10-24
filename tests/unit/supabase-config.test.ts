import { describe, expect, it } from "vitest";
import { isPrivilegedKey, parseSupabasePublicConfig } from "@/lib/supabase/config";

const jwt = (payload: object) =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "signature",
  ].join(".");

describe("parseSupabasePublicConfig", () => {
  it("accepts a URL and publishable key", () => {
    expect(
      parseSupabasePublicConfig({
        url: "http://127.0.0.1:54321",
        publishableKey: "sb_publishable_abcdefghijklmnop",
      }),
    ).toEqual({
      ok: true,
      config: { url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_abcdefghijklmnop" },
    });
  });

  it("reports missing configuration", () => {
    expect(parseSupabasePublicConfig({ url: undefined, publishableKey: undefined })).toEqual({
      ok: false,
      problem: "missing",
    });
    expect(parseSupabasePublicConfig({ url: "", publishableKey: "x" })).toMatchObject({ ok: false });
  });

  it("rejects non-HTTP URLs", () => {
    expect(
      parseSupabasePublicConfig({
        url: "javascript:alert(1)",
        publishableKey: "sb_publishable_abcdefghijklmnop",
      }),
    ).toEqual({ ok: false, problem: "invalid" });
  });

  it("refuses a secret key placed in the public variable", () => {
    expect(
      parseSupabasePublicConfig({
        url: "https://x.supabase.co",
        publishableKey: "sb_secret_abcdefghijklmnopqrstu",
      }),
    ).toEqual({ ok: false, problem: "privileged-key-in-public-variable" });
  });

  it("refuses a legacy service_role JWT placed in the public variable", () => {
    expect(
      parseSupabasePublicConfig({
        url: "https://x.supabase.co",
        publishableKey: jwt({ role: "service_role" }),
      }),
    ).toEqual({ ok: false, problem: "privileged-key-in-public-variable" });
  });
});

describe("isPrivilegedKey", () => {
  it("allows publishable and legacy anon keys", () => {
    expect(isPrivilegedKey("sb_publishable_abcdefghijklmnop")).toBe(false);
    expect(isPrivilegedKey(jwt({ role: "anon" }))).toBe(false);
    expect(isPrivilegedKey("not.a.jwt")).toBe(false);
  });
});
