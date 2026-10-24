# Security model

## Principles

- **Identity** comes from Supabase Auth. Passwords never touch application tables.
- **Authority** comes from the database: `public.user_roles` × `public.role_permissions`.
  Nothing a client sends (cookies, JWT `user_metadata`, form fields, URL ids) is trusted as a role.
- **Two enforcement points**: server-side checks in Next.js (`authorizeAdmin`) decide what to render
  and which actions to run; Postgres RLS decides what data any request can read or write.
  Hiding a link or route is never treated as security.
- **Least privilege**: Supabase grants `ALL` on new objects to `anon`/`authenticated` by default.
  Every migration revokes that and grants back only what a policy needs.
- **No public registration**: `enable_signup = false`; staff accounts are created by an operator.
  Even if sign-up were enabled, a new account has no role and therefore no access.

## Roles and permissions

Source of truth at runtime: `public.role_permissions` (migration `20261024100000`).
Reviewed specification: `src/lib/permissions/matrix.ts`. A database test fails if they differ.

| Permission                                    | Owner | Admin | Content editor | Event manager | Analyst |
| --------------------------------------------- | :---: | :---: | :------------: | :-----------: | :-----: |
| `admin.access` — enter the admin app          |   ✓   |   ✓   |       ✓        |       ✓       |    ✓    |
| `reports.read` — dashboards and summaries     |   ✓   |   ✓   |                |               |    ✓    |
| `content.read` — unpublished content          |   ✓   |   ✓   |       ✓        |               |         |
| `content.write` — create/edit content         |   ✓   |   ✓   |       ✓        |               |         |
| `content.publish` — publish/unpublish/delete  |   ✓   |   ✓   |       ✓        |               |         |
| `media.write`                                 |   ✓   |   ✓   |       ✓        |               |         |
| `translations.write`                          |   ✓   |   ✓   |       ✓        |               |         |
| `bookings.read_all`                           |   ✓   |   ✓   |                |               |         |
| `bookings.read_assigned`                      |   ✓   |       |                |       ✓       |         |
| `bookings.write_all`                          |   ✓   |   ✓   |                |               |         |
| `bookings.write_assigned`                     |   ✓   |       |                |       ✓       |         |
| `bookings.assign`                             |   ✓   |   ✓   |                |               |         |
| `bookings.delete` — privacy erasure           |   ✓   |       |                |               |         |
| `users.read` — staff list and roles           |   ✓   |   ✓   |                |               |         |
| `users.manage` — non-privileged roles         |   ✓   |   ✓   |                |               |         |
| `users.manage_privileged` — owner/admin roles |   ✓   |       |                |               |         |
| `settings.manage` — public site settings      |   ✓   |   ✓   |                |               |         |
| `audit.read`                                  |   ✓   |   ✓   |                |               |         |

Users may hold several roles; effective permissions are the union.

## Role management rules

Role changes happen only through `public.assign_role(target, role)` and
`public.revoke_role(target, role)` (SECURITY DEFINER, `search_path = ''`). They enforce:

1. The caller is authenticated and holds `users.manage`.
2. **Nobody can change their own roles**, in either direction (blocks self-escalation and
   accidental self-lockout).
3. Granting or revoking `owner`/`admin`, **or changing anything about an account that currently
   holds `owner`/`admin`**, requires `users.manage_privileged` (owners only).
4. The last owner can never be removed.
5. Every effective change writes an `audit_logs` row (`role.assigned` / `role.revoked`) with the
   actor, target and role.
6. All role changes are serialised by one transaction-scoped advisory lock taken **before** the
   authorization check, so the check reads committed state: an owner or admin demoted by a
   concurrent transaction cannot complete a change, and two owners cannot remove each other.

`anon`, `authenticated` **and `service_role`** (the server secret key) have no
INSERT/UPDATE/DELETE/TRUNCATE privilege on `user_roles`, `role_permissions` or `audit_logs`, so
these functions are the only write path. A leaked secret key or a server bug therefore cannot
grant roles outside these rules or forge/erase audit entries through the Data API.

**First owner**: `private.bootstrap_first_owner(email)` can be run only by the database owner
(SQL editor/psql), only while no owner exists, and is audited.

## Table access summary

| Table                              | anon                                                                                                                                                              | authenticated (by policy)                                                                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                         | none                                                                                                                                                              | read own (all with `users.read`); update own `display_name`, `preferred_locale` only                                                                                                                                                |
| `user_roles`                       | none                                                                                                                                                              | read own (all with `users.read`); **no writes**                                                                                                                                                                                     |
| `role_permissions`                 | none                                                                                                                                                              | read with `users.read`; **no writes** (migrations only)                                                                                                                                                                             |
| `audit_logs`                       | none                                                                                                                                                              | read with `audit.read`; **no writes**; triggers block UPDATE, DELETE and TRUNCATE even for the DB owner                                                                                                                             |
| `services`, `service_translations` | published rows only (translation visible only if it and its service are published); **public columns only** (no `updated_by`/timestamps, so `select *` is denied) | all rows with `content.read`; write drafts with `content.write` / `translations.write`; publishing, unpublishing, editing live rows and deleting (unpublished rows only) require `content.publish`; `updated_by` stamped by trigger |
| `bookings`                         | **none**                                                                                                                                                          | all with `bookings.read_all`; only rows assigned to them with `bookings.read_assigned`; assignee changes require `bookings.assign`; delete with `bookings.delete`                                                                   |

Helper `private.has_permission(p)` is SECURITY DEFINER (so policies on `user_roles` don't recurse),
`STABLE`, has a fixed empty `search_path`, and only ever answers for `auth.uid()`. Policies call it
as `(select private.has_permission(...))` so Postgres evaluates it once per statement. The `private`
schema is not exposed through the Data API.

## Application-side controls

| Control                                                                                                                                                           | Where                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Session validation on every admin request (`getUser()` against Supabase Auth)                                                                                     | `src/lib/auth/staff-session.ts`                       |
| Permission check in protected layout **and** each page (and future server actions)                                                                                | `authorizeAdmin()`                                    |
| Fail closed: unconfigured Supabase, missing session, or failed permission lookup ⇒ no access                                                                      | DAL + `(protected)/error.tsx`                         |
| Post-login redirect restricted to same-origin `/admin/*` paths                                                                                                    | `src/lib/auth/redirect.ts`                            |
| Generic sign-in errors (no account enumeration)                                                                                                                   | `src/features/auth/login-form.tsx`                    |
| Sign-in from the browser, so Supabase Auth's per-IP rate limits apply to the visitor, not the server                                                              | ADR 0001 §5                                           |
| Secret/`service_role` key in a `NEXT_PUBLIC_` variable is refused                                                                                                 | `src/lib/supabase/config.ts`                          |
| `server-only` on server modules; bundle scan for leaked secrets                                                                                                   | `npm run check:bundle`                                |
| Security headers (frame-ancestors/X-Frame-Options, nosniff, referrer policy, COOP, permissions policy, HSTS), `X-Robots-Tag: noindex` on admin, no `X-Powered-By` | `next.config.ts`                                      |
| Admin responses `Cache-Control: private, no-store`                                                                                                                | proxy                                                 |
| Auth cookies `Secure` in production, `SameSite=Lax`, path `/`                                                                                                     | `AUTH_COOKIE_OPTIONS` in `src/lib/supabase/config.ts` |
| Password policy ≥ 12 chars with upper/lower/digits; refresh-token rotation; secure password change                                                                | `supabase/config.toml`                                |

## Verification

- `npm run test:db`: 67 tests on real Postgres covering anon, roleless, editor, event manager,
  analyst, admin, owner and service-role behaviour, privileges, definer hygiene and the matrix.
- Independent review (Stage 1): a separate read-only security review of the migrations and
  auth code found no critical, high or medium issues. All five low-severity findings were fixed
  with regression tests: Secure cookie flag, TRUNCATE/service_role on audit and privilege
  tables, anon reading `updated_by`, the role-change race, and publish gating for translations.
- `npm run test:e2e`: forged session cookies, wrong credentials, open redirect, unconfigured
  admin, and role-specific admin rendering.
- `npm run check:bundle`: canary-secret scan of build output.

## Known gaps (planned)

| Gap                                                                                                               | Plan                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| No `script-src` CSP yet (baseline CSP covers framing, `<base>`, plugins, form targets)                            | Nonce-based CSP in the hardening stage                                                                    |
| No application-level rate limiting or CAPTCHA                                                                     | Turnstile/hCaptcha via Supabase Auth and on the inquiry form (Stage 2/5)                                  |
| MFA not enforced for owners/admins                                                                                | Enable TOTP and require AAL2 for privileged roles (Stage 4)                                               |
| RLS verified on PGlite with an auth shim, not yet on the real Supabase stack                                      | Run `supabase db reset` + tests against the local stack once Docker is available                          |
| Session revocation lag in the proxy (JWT validity ≤ 1 h)                                                          | Mitigated: the DAL calls `getUser()` on every admin render; data requests re-check roles in RLS           |
| `bookings` column-level edit rules for event managers (e.g. contact details)                                      | Decide with the inquiry workflow (Stage 2)                                                                |
| Concurrency of role changes reasoned about, not load-tested (PGlite is single-connection)                         | Add a two-connection test against the real local stack                                                    |
| A signed-in account with no role can read `updated_by` on published content (column grants are per database role) | Acceptable while sign-up is disabled; move public reads to a view if self-service accounts are ever added |
