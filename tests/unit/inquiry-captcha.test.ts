import { describe, expect, it, vi } from "vitest";
import { verifyTurnstile } from "@/features/bookings/server/captcha";

const respond = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));

const verify = (fetchImpl: typeof fetch, token: string | undefined) =>
  verifyTurnstile({
    token,
    secretKey: "secret",
    remoteIp: "203.0.113.7",
    idempotencyKey: "key-1",
    fetchImpl,
  });

describe("verifyTurnstile", () => {
  it("accepts a successful verification for the inquiry action", async () => {
    const fetchImpl = respond({ success: true, action: "inquiry" });
    expect(await verify(fetchImpl, "token-123")).toEqual({ ok: true });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const body = init!.body as URLSearchParams;
    expect(body.get("secret")).toBe("secret");
    expect(body.get("response")).toBe("token-123");
    expect(body.get("remoteip")).toBe("203.0.113.7");
    expect(body.get("idempotency_key")).toBe("key-1");
  });

  it("rejects a missing or oversized token without calling Cloudflare", async () => {
    const fetchImpl = respond({ success: true });
    expect(await verify(fetchImpl, undefined)).toEqual({ ok: false, reason: "missing-token" });
    expect(await verify(fetchImpl, "x".repeat(3000))).toEqual({ ok: false, reason: "missing-token" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects a failed challenge", async () => {
    expect(
      await verify(respond({ success: false, "error-codes": ["invalid-input-response"] }), "token-123"),
    ).toEqual({
      ok: false,
      reason: "rejected",
    });
    expect(
      await verify(respond({ success: false, "error-codes": ["timeout-or-duplicate"] }), "token-123"),
    ).toEqual({
      ok: false,
      reason: "rejected",
    });
  });

  it("rejects a token minted for a different action", async () => {
    expect(await verify(respond({ success: true, action: "login" }), "token-123")).toEqual({
      ok: false,
      reason: "rejected",
    });
  });

  it("rejects a token solved on another hostname when one is expected", async () => {
    const check = (hostname: string | undefined) =>
      verifyTurnstile({
        token: "token-123",
        secretKey: "secret",
        remoteIp: null,
        idempotencyKey: "key-1",
        expectedHostname: "chefharena.example",
        fetchImpl: respond({ success: true, action: "inquiry", hostname }),
      });
    expect(await check("chefharena.example")).toEqual({ ok: true });
    expect(await check("evil.example")).toEqual({ ok: false, reason: "rejected" });
    expect(await check(undefined)).toEqual({ ok: false, reason: "rejected" });
  });

  it("fails closed when Cloudflare cannot be reached or misbehaves", async () => {
    expect(
      await verify(vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network")), "token-123"),
    ).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(await verify(respond({}, 500), "token-123")).toEqual({ ok: false, reason: "unavailable" });
    expect(
      await verify(vi.fn<typeof fetch>().mockResolvedValue(new Response("not json")), "token-123"),
    ).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(
      await verify(respond({ success: false, "error-codes": ["invalid-input-secret"] }), "token-123"),
    ).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });
});
