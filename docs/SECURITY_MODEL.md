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
| `messages.read` — contact-form inbox          |   ✓   |   ✓   |                |               |         |
| `messages.write` — mark messages handled      |   ✓   |   ✓   |                |               |         |
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

**Staff screen** (Stage 4): `/admin/users` changes one person's roles with
`public.set_user_roles(target, roles)`, SECURITY INVOKER: it takes the same advisory lock and calls
`assign_role` / `revoke_role` for each difference, so every rule above and every audit entry still
applies, and one refused change rolls back the whole save. `public.list_staff()` (SECURITY DEFINER,
`users.read`) returns each account's email, name, roles and sign-in times, because `auth.users` is
not readable through the Data API. New accounts cannot be created from the admin: that needs the
secret key's Auth admin rights, which the application uses only for inquiry storage. The owner
creates them in the Supabase dashboard; they appear with no role.

## Table access summary

| Table                                                                                     | anon                                                                                                                                                              | authenticated (by policy)                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                                                                                | none                                                                                                                                                              | read own (all with `users.read`); update own `display_name`, `preferred_locale` only                                                                                                                                                |
| `user_roles`                                                                              | none                                                                                                                                                              | read own (all with `users.read`); **no writes**                                                                                                                                                                                     |
| `role_permissions`                                                                        | none                                                                                                                                                              | read with `users.read`; **no writes** (migrations only)                                                                                                                                                                             |
| `audit_logs`                                                                              | none                                                                                                                                                              | read with `audit.read`; **no writes**; triggers block UPDATE, DELETE and TRUNCATE even for the DB owner                                                                                                                             |
| `services`, `service_translations`                                                        | published rows only (translation visible only if it and its service are published); **public columns only** (no `updated_by`/timestamps, so `select *` is denied) | all rows with `content.read`; write drafts with `content.write` / `translations.write`; publishing, unpublishing, editing live rows and deleting (unpublished rows only) require `content.publish`; `updated_by` stamped by trigger |
| `pages`, `page_translations`, `page_images`, `menu_*`, `gallery_*`, `journal_*` (Stage 3) | same rule as services (a dish also needs its category published; page images only of published pages); public columns only                                        | same rule as services; pages cannot be created or deleted; changing a live page's images needs `content.publish`; Amharic translations publish only with a confirmed review                                                         |
| `media_assets`, `media_asset_translations` (Stage 3)                                      | only images used by published content (`ready`); Amharic alt text only once reviewed; public columns only                                                         | read with `content.read` or `media.write`; write and delete with `media.write` (alt text also with `translations.write`); lifecycle enforced by trigger; delete refused while referenced                                            |
| `storage.objects`, bucket `media` (Stage 3)                                               | read only objects of images used by published content                                                                                                             | read with `content.read`/`media.write`; upload only to server-reserved names (`media.write`), never overwrite; remove only untracked objects ([MEDIA.md](MEDIA.md))                                                                 |
| `bookings`                                                                                | **none**                                                                                                                                                          | all with `bookings.read_all`; only rows assigned to them with `bookings.read_assigned`; **no direct INSERT or UPDATE** (status, assignee and notes only via audited functions); delete with `bookings.delete` (audited)             |
| `booking_status_history`, `booking_notes`                                                 | **none**                                                                                                                                                          | readable exactly when the parent inquiry is readable; **no direct writes** (history by trigger, notes via `add_booking_note`)                                                                                                       |
| `contact_messages` (Stage 3.7)                                                            | **none**                                                                                                                                                          | read with `messages.read`; **no direct writes** (status only via `set_contact_message_status`, audited)                                                                                                                             |
| `site_settings` (Stage 4)                                                                 | **none** (public columns through `public_site_settings()`; Amharic location only once reviewed)                                                                   | read and update the public columns with `settings.manage`; no insert or delete; version, editor and review stamped by trigger; every save audited                                                                                   |
| `private.rate_limits`, `private.notification_outbox`                                      | **none**                                                                                                                                                          | **none** (only SECURITY DEFINER functions, executable by `service_role`)                                                                                                                                                            |

### Inquiry functions (Stage 2)

| Function                                                                               | Caller              | Authorization                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `submit_inquiry`, `consume_rate_limit`, `claim_notifications`, `complete_notification` | `service_role` only | Server-side callers only; status/assignment/source are not parameters                                       |
| `list_bookings`, `get_booking_detail`, `booking_inbox_counts`                          | `authenticated`     | SECURITY INVOKER: RLS decides; unauthorized callers get no rows                                             |
| `change_booking_status`, `add_booking_note`                                            | `authenticated`     | `bookings.write_all`, or `bookings.write_assigned` on own assignments; missing and forbidden look identical |
| `assign_booking`, `list_assignable_staff`                                              | `authenticated`     | `bookings.assign`; assignee must hold a booking write permission                                            |
| `booking_report`                                                                       | `authenticated`     | `reports.read`; aggregates only                                                                             |
| `submit_contact_message` (Stage 3.7)                                                   | `service_role` only | Server-side callers only; status and handling are not parameters                                            |
| `list_contact_messages`, `contact_message_counts`                                      | `authenticated`     | SECURITY INVOKER: RLS (`messages.read`) decides; unauthorized callers get no rows                           |
| `set_contact_message_status`                                                           | `authenticated`     | `messages.write`; audited                                                                                   |

### Staff, settings and audit functions (Stage 4)

| Function               | Caller                  | Authorization                                                                                               |
| ---------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `list_staff`           | `authenticated`         | SECURITY DEFINER (reads `auth.users`); raises unless the caller holds `users.read`                          |
| `set_user_roles`       | `authenticated`         | SECURITY INVOKER; `users.manage`, then `assign_role` / `revoke_role` decide each change, in one transaction |
| `public_site_settings` | `anon`, `authenticated` | SECURITY DEFINER; the public columns only, the Amharic location only once reviewed                          |
| `get_site_settings`    | `authenticated`         | SECURITY INVOKER: RLS (`settings.manage`) decides; others get no row                                        |
| `list_audit_log`       | `authenticated`         | SECURITY INVOKER: RLS (`audit.read`) decides; others get no rows                                            |

`service_role` can execute none of them, and has no privilege on `site_settings` or (since this
stage) `profiles`.

### Content functions (Stage 3)

| Function                                                                                                                                          | Caller                  | Authorization                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `public_page`, `public_services`, `public_service`, `public_menu`, `public_gallery`, `public_journal`, `public_journal_post`, `public_navigation` | `anon`, `authenticated` | SECURITY INVOKER; return published content only (and the same for signed-in staff)                          |
| `cms_list`, `cms_get`, `media_list`, `media_get`                                                                                                  | `authenticated`         | SECURITY INVOKER: RLS decides; staff without `content.read` get nothing                                     |
| `media_cleanup_candidates`                                                                                                                        | `authenticated`         | SECURITY DEFINER; requires `media.write`                                                                    |
| `private.media_asset_is_public`, `media_object_is_public` (+ `media_upload_is_reserved`, `media_object_is_tracked` for staff)                     | policies                | SECURITY DEFINER, `search_path = ''`; answer only whether an image or object is public, reserved or tracked |

Visitors (`anon`) have USAGE on the `private` schema so that these policies and functions can call
the visibility helpers; EXECUTE is granted only on the helpers listed in
`tests/integration/db/schema.test.ts`, and the Data API does not expose the `private` schema.

The server secret key (`service_role`) has **no** direct privileges on any booking or
contact-message table. A leaked key or a server bug can create inquiries and contact messages,
consume rate-limit counters, and claim and complete queued
notifications (an acknowledgement includes the customer's email address); it cannot list, alter or
delete inquiries or messages. It still carries Supabase Auth admin rights, so it must be treated as a full
secret and rotated if exposed. See [INQUIRIES.md](INQUIRIES.md) for abuse controls (rate limits, optional
Turnstile, honeypot, body limit) and their verification status.

Helper `private.has_permission(p)` is SECURITY DEFINER (so policies on `user_roles` don't recurse),
`STABLE`, has a fixed empty `search_path`, and only ever answers for `auth.uid()`. Policies call it
as `(select private.has_permission(...))` so Postgres evaluates it once per statement. The `private`
schema is not exposed through the Data API.

## Application-side controls

| Control                                                                                                                                                                                           | Where                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Session validation on every admin request (`getUser()` against Supabase Auth)                                                                                                                     | `src/lib/auth/staff-session.ts`                                           |
| Permission check in protected layout **and** each page and server action; Route Handlers use `authorizeAdminRequest()` (status codes instead of redirects)                                        | `authorizeAdmin()`                                                        |
| Fail closed: unconfigured Supabase, missing session, or failed permission lookup ⇒ no access                                                                                                      | DAL + `(protected)/error.tsx`                                             |
| Post-login redirect restricted to same-origin `/admin/*` paths                                                                                                                                    | `src/lib/auth/redirect.ts`                                                |
| Generic sign-in errors (no account enumeration)                                                                                                                                                   | `src/features/auth/login-form.tsx`                                        |
| Sign-in from the browser, so Supabase Auth's per-IP rate limits apply to the visitor, not the server                                                                                              | ADR 0001 §5                                                               |
| Secret/`service_role` key in a `NEXT_PUBLIC_` variable is refused                                                                                                                                 | `src/lib/supabase/config.ts`                                              |
| `server-only` on server modules; bundle scan for leaked secrets                                                                                                                                   | `npm run check:bundle`                                                    |
| Security headers (frame-ancestors/X-Frame-Options, nosniff, referrer policy, COOP, permissions policy, HSTS), `X-Robots-Tag: noindex` on admin, no `X-Powered-By`                                 | `next.config.ts`                                                          |
| Admin responses never cached: the proxy sets `private, no-store`; dynamic pages are sent with `no-store` (Next.js)                                                                                | proxy, Next.js                                                            |
| Auth cookies `Secure` in production, `SameSite=Lax`, path `/`                                                                                                                                     | `AUTH_COOKIE_OPTIONS` in `src/lib/supabase/config.ts`                     |
| Password policy ≥ 12 chars with upper/lower/digits; refresh-token rotation; secure password change                                                                                                | `supabase/config.toml`                                                    |
| CMS writes with the staff member's own session (never the secret key); every action re-authorizes; versioned saves refuse stale overwrites                                                        | `src/features/cms/actions.ts`                                             |
| Stored content rendered as text or a parsed formatting subset, never HTML; links limited to https/http/mailto/tel/relative/anchor; input normalised (NFC, no control or bidi-override characters) | `src/features/cms/markup.tsx`, `src/lib/text.ts`                          |
| Public pages read through a session-less publishable-key client inside `'use cache'`: no drafts or personal data in shared caches                                                                 | `src/features/cms/public-data.ts`                                         |
| Draft preview only under `/admin` with the staff session (`no-store`, `noindex`)                                                                                                                  | `/admin/preview/…`                                                        |
| Upload route: same-origin check, size cap before parsing, `media.write`, content sniffing, decode limits, re-encoding without metadata                                                            | `src/app/api/admin/media/route.ts`, `src/features/media/process-image.ts` |
| Image responses: `nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, generated names only                                                                                          | `/media/…`, `/admin/media/[id]/file`                                      |

## Verification

- `npm run test:db`: 121 tests on Postgres 18 (PGlite) covering anon, roleless, editor, event
  manager, analyst, admin, owner and service-role behaviour, privileges, definer hygiene, the matrix,
  and the inquiry workflow (submission, limits, lifecycle, assignment, notes, outbox, erasure).
- Independent review (Stage 1): a separate read-only security review of the migrations and
  auth code found no critical, high or medium issues. All five low-severity findings were fixed
  with regression tests: Secure cookie flag, TRUNCATE/service_role on audit and privilege
  tables, anon reading `updated_by`, the role-change race, and publish gating for translations.
- Independent review (Stage 2): a second read-only review of the inquiry system reported one
  medium finding (junk requests could exhaust the per-mailbox and site-wide rate-limit budgets
  before CAPTCHA) and several low ones. All were fixed with regression tests: two-phase rate limits
  with mailbox normalisation; a required, proxy-set client IP header read from the right; no direct
  INSERT/UPDATE on `bookings` for staff and a stricter email constraint plus a guarded `mailto:`;
  `method="post"` and hydration gating on forms; a name-free customer acknowledgement; an `https`
  site URL for email in production; Turnstile hostname checking; corrected secret-key wording.
- `npm run test:e2e`: forged session cookies, wrong credentials, open redirect, unconfigured
  admin, and role-specific admin rendering.
- `npm run check:bundle`: canary-secret scan of build output.
- Stage 2.5 ([VERIFICATION.md](VERIFICATION.md)): migrations applied with `supabase db push` to real
  PostgreSQL 17 (non-superuser owner, as on hosted Supabase); the deployed catalog equals the
  repository build; the DB suites and a multi-connection concurrency suite pass there
  (`npm run test:db:pg`); the Data API was exercised over HTTP through real PostgREST 14 as anon,
  service_role and every staff role. Not yet against Supabase itself (Auth, gateway, hosted settings).
  Fixed with regression tests: CAPTCHA tokens could be replayed through Turnstile's idempotency key
  (now accepted once); production skipped the CAPTCHA hostname check without `NEXT_PUBLIC_SITE_URL`
  (now closed); `service_role` kept EXECUTE on `assign_role`, `revoke_role` and `get_my_access`
  (migration `20261026090000`; the privilege test covers `service_role`).
- Stage 3 ([CMS.md](CMS.md), [VERIFICATION.md](VERIFICATION.md#11-stage-3-cms)): the CMS suite on
  PGlite and real PostgreSQL 17 covers the workflow and publish rules per role (including a role
  without `content.publish`), the Amharic review gate, visitor isolation through tables and
  functions, media lifecycle and `storage.objects` policies, content audit, and escalation attempts
  by content staff (roles, permissions, inquiries). Over HTTP through real PostgREST 14, visitors
  and the secret key are refused on every content table and staff function, and the editor
  workflow and Amharic refusal behave as in SQL. The e2e suite stores script, event-handler,
  iframe and `javascript:` payloads and checks that nothing executes, rejects disguised files,
  checks image visibility while published and after unpublishing, CSRF and role denial of the
  upload route, and preview headers. Supabase Storage itself has not been tested.

## Known gaps (planned)

| Gap                                                                                                                                                                                            | Plan                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| No `script-src` CSP yet (baseline CSP covers framing, `<base>`, plugins, form targets)                                                                                                         | Nonce-based CSP in the hardening stage                                                                        |
| Turnstile verified only with Cloudflare's test keys; Resend only for failure handling (no real delivery)                                                                                       | Real widget and verified sending domain before launch (VERIFICATION.md L1–L3)                                 |
| CAPTCHA accepts a response without `action` (test responses have none)                                                                                                                         | Require `action === "inquiry"` in production once a real response is confirmed to carry it (W2)               |
| Fixed-window rate limits allow up to 2× a limit across a window boundary                                                                                                                       | Sliding windows in the hardening stage (W1); CAPTCHA and shared limits still apply                            |
| Storage policies verified against a reduced `storage.objects` (PGlite, PG17) and a test double, not the Storage API; on hosted projects their creation depends on the platform's policy grants | MEDIA.md hosted checklist on the dev project before media is used                                             |
| Unpublished images may be served from browser, CDN or image-optimiser caches for up to 5 minutes                                                                                               | Documented; replace or delete the file for immediate removal (MEDIA.md)                                       |
| Amharic review is a staff attestation; no Amharic content or interface text has been reviewed yet                                                                                              | Native-speaker review before launch (LOCALIZATION.md)                                                         |
| Per-IP limits are only as good as the `CLIENT_IP_HEADER` choice (required in production)                                                                                                       | Confirm the header on the chosen platform before launch (INQUIRIES.md); CAPTCHA and shared limits still apply |
| Admin sign-in has no CAPTCHA; Supabase Auth per-IP limits only                                                                                                                                 | Enable Supabase Auth CAPTCHA (Turnstile) in the hardening stage                                               |
| MFA not enforced for owners/admins                                                                                                                                                             | Enable TOTP and require AAL2 for privileged roles (Stage 4)                                                   |
| RLS verified on PGlite and real PostgreSQL 17 + PostgREST, not yet on Supabase (Auth, gateway, hosted settings)                                                                                | Owner checklist C1–C2 in VERIFICATION.md (local stack or a hosted dev project)                                |
| Session revocation lag in the proxy (JWT validity ≤ 1 h)                                                                                                                                       | Mitigated: the DAL calls `getUser()` on every admin render; data requests re-check roles in RLS               |
| Staff cannot correct a submitted inquiry (no direct UPDATE on `bookings`)                                                                                                                      | Add an audited, field-limited edit function if the business needs corrections                                 |
| Privacy erasure exists in the database (owner `DELETE`, audited) but has no admin UI                                                                                                           | Add an owner-only, confirmed erasure action (Stage 4)                                                         |
| Concurrency verified with multiple connections on PostgreSQL 17 (`tests/postgres`), not load-tested                                                                                            | Load test on a dedicated environment before launch; run `test:db:pg` in CI (W7)                               |
| A signed-in account with no role can read `updated_by` on published content (column grants are per database role)                                                                              | Acceptable while sign-up is disabled; move public reads to a view if self-service accounts are ever added     |
