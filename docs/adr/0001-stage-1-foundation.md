# ADR 0001 — Stage 1 foundation decisions

- **Status:** accepted
- **Date:** 2026-10-24

Short records of the choices that shape later stages. New decisions get new ADR files.

## 1. Next.js 16 with Cache Components enabled

**Context.** `create-next-app@16.4.3` enables `cacheComponents` and `partialPrefetching`. Next.js
documents both as becoming the default (with the flags removed) in the next major.
**Decision.** Keep them. Public pages prerender statically; admin routes opt into blocking
(`instant = false`, `connection()`).
**Consequences.** Request-time APIs must stay out of public layouts. CMS reads will use
`use cache` + tags (`updateTag`/`revalidateTag` from admin actions), so content updates need no
redeploy. Avoids a future migration.

## 2. One app, two root layouts, URL locales for the public site only

**Context.** The public site needs crawlable per-language URLs; the brief's admin routes have no
locale segment.
**Decision.** `app/[locale]` (root param read through `next/root-params`) and `app/admin` as
separate root layouts. The admin language comes from the `NEXT_LOCALE` cookie the public site
already writes. The `(public)` route group from the initial sketch was dropped: the `[locale]`
segment already scopes the public site.
**Consequences.** No pass-through `app/layout.tsx` (it would become the only root layout).
Unknown paths are handled by `[...rest]` catch-alls with localized `not-found` pages
(`global-not-found` is still experimental).

## 3. Authorization: roles in tables, permissions checked in Postgres and in the server

**Options.** (a) Roles as JWT custom claims via an Auth hook; (b) roles in tables, looked up per
request.
**Decision.** (b): `user_roles` × `role_permissions`, `private.has_permission()` in RLS, and
`get_my_access()` for the Next.js Data Access Layer.
**Consequences.** Revoking a role takes effect on the next request (JWT claims would stay valid
until token expiry). The cost is one indexed lookup per statement (cached via `(select …)`
initplans). The matrix changes only via migrations, mirrored by a TypeScript specification that is
tested against the database.

## 4. Role changes only through audited SECURITY DEFINER functions

**Decision.** API roles have no write privileges on `user_roles`; `assign_role`/`revoke_role`
enforce no-self-change, owner-only privileged changes and a last-owner guard, and write audit logs.
The first owner is bootstrapped by the database owner only.
**Consequences.** No path exists for a user to raise their own privileges through the Data API.
The Stage 4 staff UI will call these functions; it adds no new trust.

## 5. Staff sign-in from the browser (not a server action)

**Context.** Supabase Auth rate-limits sign-in per client IP. Signing in from a server action
would make every attempt appear to come from the app server's IP: brute force would share one
budget and an attacker could lock out all staff.
**Decision.** `signInWithPassword` runs in the browser via `@supabase/ssr`'s browser client
(session in cookies); the server validates every request with `getUser()`. Sign-out is a server
action.
**Consequences.** The login form needs JavaScript (acceptable for an admin). CAPTCHA can be added
through Supabase Auth's built-in Turnstile/hCaptcha support.

## 6. Public inquiries will be inserted by trusted server code, not by `anon`

**Decision.** `bookings` has no `anon` privileges. The Stage 2 inquiry form will post to a server
action that validates with Zod, applies abuse controls and inserts with the server-only secret key.
**Consequences.** Clients can never bypass validation and rate limits by calling the Data API
directly. Requires `SUPABASE_SECRET_KEY` on the server from Stage 2.

## 7. Theme without flash, without cookies

**Decision.** `light-dark()` tokens and `color-scheme`; an explicit choice is stored in
`localStorage` and applied by a tiny inline `<head>` script (the pattern in Next.js's
"Preventing flash before hydration" guide).
**Consequences.** Public pages stay statically prerendered (a cookie-based theme would make every
page dynamic). The OS preference works without JavaScript. A future strict CSP must allow this
script by hash or nonce.

## 8. Database tests on PGlite while Docker is unavailable

**Context.** The development machine has no Docker, so `supabase start` cannot run.
**Decision.** Run migrations and RLS tests on PGlite (Postgres in WebAssembly) with a small shim
that recreates Supabase's API roles, `auth.uid()` and default privileges.
**Consequences.** Real Postgres semantics for grants, RLS, triggers and SECURITY DEFINER, in about
4 seconds and with no infrastructure. It does not cover GoTrue, PostgREST or Storage behaviour, and
PGlite is Postgres 18 while Supabase runs 17. Run on the real stack whenever Docker is available.

## 9. Fake Supabase HTTP double for admin e2e tests

**Decision.** Playwright starts a minimal fake of the Auth/PostgREST endpoints the app calls
(`tests/e2e/support/fake-supabase.ts`) and points a dev server at it.
**Consequences.** The real proxy, DAL, redirects and role-based UI are exercised end to end
without a bypass in application code. Database authorization remains covered by the PGlite suite.

## 10. Honest placeholders

**Decision.** No stock photography and no invented business facts. Photography slots name the
intended shot; a site-wide preview notice is shown; unconfirmed offerings are marked; navigation
links only to destinations that exist.
**Consequences.** The site looks intentional but is clearly pre-launch until real content and
photography arrive through the CMS.
