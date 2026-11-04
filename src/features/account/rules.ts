/*
 * Rules for staff usernames and passwords, shared by the forms and the server.
 * The username rule equals the database constraint profiles_username_format; the
 * password rule is the policy in docs/SECURITY_MODEL.md, checked here because a
 * hosted Supabase project does not enforce its config.toml.
 */

// No "@": that is how the sign-in form tells a username from an email address.
const USERNAME = /^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$/;

export const normaliseUsername = (value: string) => value.trim().toLowerCase();

export const isValidUsername = (value: string) => USERNAME.test(value);

export const PASSWORD_MIN_LENGTH = 12;
/** Supabase Auth hashes with bcrypt, which reads no further than this. */
const PASSWORD_MAX_BYTES = 72;

export type PasswordProblem = "passwordTooShort" | "passwordTooLong" | "passwordNeedsMix";

export function passwordProblem(password: string): PasswordProblem | null {
  if ([...password].length < PASSWORD_MIN_LENGTH) return "passwordTooShort";
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) return "passwordTooLong";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "passwordNeedsMix";
  }
  return null;
}

// How long a confirmation link is worth waiting for: Auth's limit is shorter or equal.
const EMAIL_LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;

/**
 * Where an email change stands. Auth keeps the new address after its link can no
 * longer work: links expire, and a password change cancels them, for safety, since
 * the old password may be what asked for the change. So a stored address alone does
 * not mean a change is waiting; only a link sent recently and not cancelled does.
 */
export function emailChangeStatus(
  user: { email?: string; new_email?: string; email_change_sent_at?: string },
  now = Date.now(),
): { pendingEmail: string | null; lapsedEmail: string | null } {
  const address = user.new_email && user.new_email !== user.email ? user.new_email : null;
  if (!address) return { pendingEmail: null, lapsedEmail: null };
  const sentAt = user.email_change_sent_at ? Date.parse(user.email_change_sent_at) : NaN;
  return now - sentAt < EMAIL_LINK_LIFETIME_MS
    ? { pendingEmail: address, lapsedEmail: null }
    : { pendingEmail: null, lapsedEmail: address };
}
