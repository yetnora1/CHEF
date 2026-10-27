import "server-only";

/*
 * Cloudflare Turnstile server-side verification.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 * Tokens are single-use and valid for 300 seconds. Any failure to reach
 * Cloudflare fails closed.
 */

export const TURNSTILE_ACTION = "inquiry";
export const CONTACT_TURNSTILE_ACTION = "contact";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_LENGTH = 2048;

export type CaptchaResult =
  { ok: true } | { ok: false; reason: "missing-token" | "rejected" | "unavailable" };

type SiteverifyResponse = {
  success?: unknown;
  action?: unknown;
  hostname?: unknown;
  "error-codes"?: unknown;
};

export async function verifyTurnstile({
  token,
  secretKey,
  remoteIp,
  idempotencyKey,
  expectedHostname = null,
  expectedAction = TURNSTILE_ACTION,
  fetchImpl = fetch,
  timeoutMs = 8000,
}: {
  token: string | null | undefined;
  secretKey: string;
  remoteIp: string | null;
  idempotencyKey: string;
  /** When set, a token solved on any other hostname is refused. */
  expectedHostname?: string | null;
  /** The action the form's widget was rendered with. */
  expectedAction?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<CaptchaResult> {
  if (!token || token.length > MAX_TOKEN_LENGTH) return { ok: false, reason: "missing-token" };

  const body = new URLSearchParams({ secret: secretKey, response: token, idempotency_key: idempotencyKey });
  if (remoteIp) body.set("remoteip", remoteIp);

  let data: SiteverifyResponse;
  try {
    const response = await fetchImpl(VERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, reason: "unavailable" };
    data = (await response.json()) as SiteverifyResponse;
  } catch {
    return { ok: false, reason: "unavailable" };
  }

  if (data.success !== true) {
    const codes = Array.isArray(data["error-codes"]) ? data["error-codes"] : [];
    // Configuration or Cloudflare-side problems are not the visitor's fault.
    const serverSide = codes.some(
      (code) =>
        code === "missing-input-secret" || code === "invalid-input-secret" || code === "internal-error",
    );
    return { ok: false, reason: serverSide ? "unavailable" : "rejected" };
  }

  // Each form renders its widget with its own action ("inquiry", "contact"); a
  // token minted for another form (or another site using this secret) is refused.
  if (typeof data.action === "string" && data.action !== "" && data.action !== expectedAction) {
    return { ok: false, reason: "rejected" };
  }

  if (expectedHostname && data.hostname !== expectedHostname) {
    return { ok: false, reason: "rejected" };
  }

  return { ok: true };
}
