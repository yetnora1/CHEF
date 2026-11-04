import "server-only";
import { hashIdentifier } from "@/features/bookings/server/rate-limit";

/*
 * Limits for password checks that run on this server: signing in by username, and
 * re-entering a password to change sign-in details. Supabase Auth's own per-IP limit
 * sees only this server there, so these are what stops guessing. A visitor who hits
 * a username's limit can still sign in with their email, from the browser (ADR 0005).
 * Identifiers are hashed, as for the inquiry limits.
 */

const FIFTEEN_MINUTES = 15 * 60;

export const SIGN_IN_LIMITS = {
  ip: { limit: 20, windowSeconds: FIFTEEN_MINUTES },
  username: { limit: 10, windowSeconds: FIFTEEN_MINUTES },
  reauth: { limit: 10, windowSeconds: FIFTEEN_MINUTES },
} as const;

export type SignInLimitScope = keyof typeof SIGN_IN_LIMITS;

export const signInBucket = (scope: SignInLimitScope, identifier: string, secret: string) =>
  `sign-in:${scope}:${hashIdentifier(identifier, secret)}`;
