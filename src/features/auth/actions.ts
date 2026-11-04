"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidUsername, normaliseUsername } from "@/features/account/rules";
import { getContactConfig } from "@/features/bookings/server/config";
import { clientIpFrom } from "@/features/bookings/server/rate-limit";
import { createInquiryStore } from "@/features/bookings/server/store";
import { ADMIN_LOGIN_PATH } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SIGN_IN_LIMITS, signInBucket } from "./sign-in-limits";

/** Ends this browser's session (other devices stay signed in). */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut({ scope: "local" });
  redirect(ADMIN_LOGIN_PATH);
}

export type UsernameSignInResult = { status: "ok" | "invalid" | "rateLimited" | "error" };

// Nobody has this address (.invalid is reserved): an unknown username takes the same
// steps as a known one and gets the same answer as a wrong password.
const NO_SUCH_ACCOUNT = "no-such-account@chef-sis.invalid";

/**
 * Signs in by username on the server, which alone can turn it into an email address
 * (docs/SECURITY_MODEL.md): the browser never learns the address, nor whether the
 * username exists. Next.js checks the Origin of Server Action requests. Open to
 * anyone by nature, like the sign-in form itself; signing in with an email address
 * stays in the browser (features/auth/login-form.tsx).
 */
export async function signInWithUsernameAction(input: {
  username: string;
  password: string;
}): Promise<UsernameSignInResult> {
  const username = normaliseUsername(String(input?.username ?? ""));
  const password = String(input?.password ?? "");
  if (!isValidUsername(username) || !password || password.length > 256) return { status: "invalid" };

  const config = getContactConfig();
  const supabase = await createSupabaseServerClient();
  if (!config.available || !supabase) return { status: "error" };

  try {
    const store = createInquiryStore({ url: config.supabaseUrl, secretKey: config.secretKey });
    const clientIp = clientIpFrom(await headers(), config.clientIpHeader, config.clientIpTrustedHops);
    const limits = await Promise.all([
      store.consumeRateLimit(
        signInBucket("username", username, config.secretKey),
        SIGN_IN_LIMITS.username.limit,
        SIGN_IN_LIMITS.username.windowSeconds,
      ),
      ...(clientIp
        ? [
            store.consumeRateLimit(
              signInBucket("ip", clientIp, config.secretKey),
              SIGN_IN_LIMITS.ip.limit,
              SIGN_IN_LIMITS.ip.windowSeconds,
            ),
          ]
        : []),
    ]);
    if (limits.some((limit) => !limit.allowed)) return { status: "rateLimited" };

    const email = (await store.staffLoginEmail(username)) ?? NO_SUCH_ACCOUNT;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return { status: "ok" };
    if (error.status === 429) return { status: "rateLimited" };
    // Every refusal looks the same, whatever Auth made of the account.
    return { status: error.status && error.status < 500 ? "invalid" : "error" };
  } catch {
    return { status: "error" };
  }
}
