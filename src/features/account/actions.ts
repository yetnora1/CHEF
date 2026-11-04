"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { refresh } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { getContactConfig } from "@/features/bookings/server/config";
import { createInquiryStore } from "@/features/bookings/server/store";
import { SIGN_IN_LIMITS, signInBucket } from "@/features/auth/sign-in-limits";
import { authorizeAdmin } from "@/lib/auth/staff-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidUsername, normaliseUsername, passwordProblem, type PasswordProblem } from "./rules";

/*
 * A staff member's own sign-in details. Every action authorizes on the server, and
 * changing a password or email asks for the current password first, so a session
 * left open on a shared computer cannot take the account over. Results carry stable
 * codes only.
 */

export type AccountError =
  | PasswordProblem
  | "usernameInvalid"
  | "usernameTaken"
  | "emailInvalid"
  | "sameEmail"
  | "emailTaken"
  | "emailNotSent"
  | "emailLimit"
  | "currentPasswordRequired"
  | "wrongPassword"
  | "passwordMismatch"
  | "samePassword"
  | "passwordWeak"
  | "rateLimited"
  | "forbidden"
  | "notConfigured"
  | "generic";

export type AccountActionState =
  | { status: "idle" }
  | { status: "error"; error: AccountError }
  | { status: "saved" | "removed"; at: number }
  | { status: "passwordChanged"; cancelledEmail: string | null; at: number }
  | { status: "emailSent" | "emailChanged"; email: string; at: number };

const fail = (error: AccountError): AccountActionState => ({ status: "error", error });

const read = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};

async function staffAndClient() {
  const decision = await authorizeAdmin("admin.access");
  if (decision.kind !== "allow") return { failure: fail("forbidden") } as const;
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { failure: fail("notConfigured") } as const;
  return { supabase, user: decision.session.user } as const;
}

/**
 * Checks the current password by signing in again on this session's own client, so
 * the session is recent, as Auth's secure password change asks. A failed attempt
 * leaves the session as it was.
 */
async function confirmCurrentPassword(
  supabase: SupabaseClient,
  user: { id: string; email: string | null },
  password: string,
): Promise<AccountError | null> {
  if (!password) return "currentPasswordRequired";
  if (!user.email) return "generic";

  const config = getContactConfig();
  if (config.available) {
    const store = createInquiryStore({ url: config.supabaseUrl, secretKey: config.secretKey });
    const limit = await store
      .consumeRateLimit(
        signInBucket("reauth", user.id, config.secretKey),
        SIGN_IN_LIMITS.reauth.limit,
        SIGN_IN_LIMITS.reauth.windowSeconds,
      )
      .catch(() => null);
    if (!limit) return "generic";
    if (!limit.allowed) return "rateLimited";
  }

  const { error } = await supabase.auth.signInWithPassword({ email: user.email, password });
  if (!error) return null;
  if (error.status === 429) return "rateLimited";
  return error.status && error.status < 500 ? "wrongPassword" : "generic";
}

export async function saveUsernameAction(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const staff = await staffAndClient();
  if (staff.failure) return staff.failure;

  const username = normaliseUsername(read(formData, "username"));
  if (username && !isValidUsername(username)) return fail("usernameInvalid");

  const { data, error } = await staff.supabase
    .from("profiles")
    .update({ username: username || null })
    .eq("id", staff.user.id)
    .select("id");
  if (error) {
    if (error.code === "23505") return fail("usernameTaken");
    if (error.code === "23514") return fail("usernameInvalid");
    return fail("generic");
  }
  if (!data?.length) return fail("generic");
  refresh();
  return { status: username ? "saved" : "removed", at: Date.now() };
}

export async function changePasswordAction(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const staff = await staffAndClient();
  if (staff.failure) return staff.failure;

  const current = read(formData, "current_password");
  const next = read(formData, "new_password");
  const problem = passwordProblem(next);
  if (problem) return fail(problem);
  if (next !== read(formData, "repeat_password")) return fail("passwordMismatch");
  if (next === current) return fail("samePassword");

  const refused = await confirmCurrentPassword(staff.supabase, staff.user, current);
  if (refused) return fail(refused);

  // Auth keeps this session, ends the account's sessions on other devices and cancels
  // any email change still waiting for its link. That is a safety rule (the old password
  // may be what asked for it), so the change is not sent again without being asked.
  const { error } = await staff.supabase.auth.updateUser({ password: next });
  if (error) {
    if (error.code === "same_password") return fail("samePassword");
    if (error.code === "weak_password") return fail("passwordWeak");
    return fail("generic");
  }
  await staff.supabase.rpc("record_account_change", { p_kind: "password_changed" });
  refresh();
  return { status: "passwordChanged", cancelledEmail: staff.user.pendingEmail, at: Date.now() };
}

const emailSchema = z.email().max(254);

export async function changeEmailAction(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const staff = await staffAndClient();
  if (staff.failure) return staff.failure;

  const parsed = emailSchema.safeParse(read(formData, "email").trim().toLowerCase());
  if (!parsed.success) return fail("emailInvalid");
  const email = parsed.data;
  if (email === staff.user.email?.toLowerCase()) return fail("sameEmail");

  const refused = await confirmCurrentPassword(
    staff.supabase,
    staff.user,
    read(formData, "current_password"),
  );
  if (refused) return fail(refused);

  // Next.js has already checked this header against the host for a Server Action.
  const origin = (await headers()).get("origin");
  const { data, error } = await staff.supabase.auth.updateUser(
    { email },
    origin ? { emailRedirectTo: `${origin}/admin/account/email-confirmed` } : undefined,
  );
  if (error) {
    if (error.code === "email_exists") return fail("emailTaken");
    if (error.code === "email_address_invalid") return fail("emailInvalid");
    if (error.code === "email_address_not_authorized") return fail("emailNotSent");
    if (error.status === 429 || error.code === "over_email_send_rate_limit") return fail("emailLimit");
    return fail("generic");
  }
  await staff.supabase.rpc("record_account_change", { p_kind: "email_change_requested" });
  refresh();
  // A project that does not ask for confirmation changes the address at once.
  return {
    status: data.user?.email?.toLowerCase() === email ? "emailChanged" : "emailSent",
    email,
    at: Date.now(),
  };
}
