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
