# Verification: real database and integration gates

Sections 1–10 record the Stage 2.5 gate (inquiries). Section [11](#11-stage-3-cms) records Stage 3
(content management and media).

Date: 2026-10-24 · Baseline: `48ad955` (Stage 2) · Branch: `stage-2.5-verification`

This stage checked the Stage 2 inquiry system against real infrastructure where it existed, fixed
narrowly scoped findings, and set out what the owner must still do before the CMS and before launch.
**No Supabase project, Supabase access token, Cloudflare account or Resend account was available, and
Docker is not installed**, so nothing below was verified against Supabase itself (hosted or local).

## 1. What was available

| Item                                  | State                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Docker / Podman (Windows and WSL)     | Not installed (WSL has Ubuntu 24.04 without Docker), so `supabase start` cannot run         |
| Supabase CLI                          | 2.122.0 (dev dependency); **not logged in**, no linked project                              |
| Supabase / Turnstile / Resend secrets | None (`.env.local` absent; no matching environment variables)                               |
| PostgreSQL                            | 17.10 binaries: used for a **throwaway cluster** (own data directory, 127.0.0.1, own port)  |
| PostgREST                             | 14.18, official Windows build (GitHub release, SHA-256 `f24ca175…59b9`)                     |
| Cloudflare                            | Public siteverify endpoint with Cloudflare's published **test** keys (no account needed)    |
| Resend                                | Public API with a deliberately **invalid** key (proves failure handling; nothing delivered) |

The system PostgreSQL service on this machine and its data were not touched.

## 2. Test environments used

| Name               | What it is                                                                                                                                                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PGlite**         | Existing suites: Postgres 18 in WebAssembly with the auth shim                                                                                                                                                                                                                                                    |
| **Real PG17**      | Throwaway PostgreSQL 17.10 with Supabase-like roles: superuser `supabase_admin`, non-superuser `postgres` (BYPASSRLS, CREATEROLE, as on hosted Supabase), `anon`/`authenticated`/`service_role`, `authenticator`. Migrations applied with **`supabase db push --db-url`**, the documented workflow                |
| **Real PostgREST** | PostgREST 14.18 in front of Real PG17, connecting as `authenticator`, exposed schema `public`. Requests carry HS256 JWTs with Supabase Auth's claims                                                                                                                                                              |
| **Real-stack app** | `next dev` → a local gateway that does what Supabase's API gateway does with keys (`sb_publishable_` → anon, `sb_secret_` → service_role) → Real PostgREST → Real PG17. **Auth (GoTrue) was simulated** (password grant, refresh, user, logout for users in the real `auth.users` table); it is not Supabase Auth |

## 3. Commands and outcomes

Baseline (`48ad955`, before any change):

| Command                                                                          | Outcome                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                                           | pass                                                                                                                                                                                                                              |
| `npm run verify`                                                                 | pass: lint, typecheck, **329/329** Vitest, client-bundle secret scan                                                                                                                                                              |
| `npm run test:e2e`                                                               | **47/48**. `rate-limits repeated submissions` failed: requests at 11:19:55 and 11:19:59 UTC fell in one 10-minute window and 11:20:02–11:20:09 in the next, so the sixth one was allowed (§6, F3)                                 |
| `supabase db push --db-url <Real PG17>` (dry run, then applied)                  | 5 migrations applied in timestamp order; `supabase migration list` shows local = remote                                                                                                                                           |
| Schema fingerprint, Real PG17 vs repository build                                | identical: RLS flags, 22 policies, table/column/sequence grants, 32 functions (security, volatility, `search_path`, EXECUTE), 14 triggers, 8 enums, schema usage, 43 role permissions                                             |
| DB suites (`tests/integration/db`) on Real PG17                                  | **121/121**, migrations run as the non-superuser `postgres`                                                                                                                                                                       |
| Concurrency suite on Real PG17 (new)                                             | **9/9** (§5)                                                                                                                                                                                                                      |
| PostgREST HTTP suite (new)                                                       | **pass**: every role, over HTTP (§4)                                                                                                                                                                                              |
| Repository e2e specs (`admin-auth`, `inquiries`; 23 tests) on the real-stack app | **23/23** on a fresh database (2 runs). Other runs failed only for reasons outside the backend: a Next.js dev-server compile race (3 runs, §7), the spec's hard-coded port 3101 (1 run), state left from the previous run (1 run) |
| `verifyTurnstile` against Cloudflare siteverify (test secrets)                   | **7/7** (§5)                                                                                                                                                                                                                      |
| Real Turnstile widget (test sitekey) → app → Real PostgREST/PG17                 | pass: inquiry stored; replaying the identical request is refused (§5)                                                                                                                                                             |
| Email outbox → Resend (invalid key) via `/api/internal/notifications`            | as designed: messages `failed` with attempt counts, inquiries kept, retries stop at 5 (§5)                                                                                                                                        |

After the changes on this branch, the results are in §9.

## 4. Integration matrix

**Real Supabase** = a Supabase project or `supabase start`. **Local real** = Real PG17 / Real
PostgREST / Cloudflare or Resend public endpoints as described above. **Mocked** = test doubles only.

| Area                                                                                | Real Supabase | Local real                           | Mocked                    |
| ----------------------------------------------------------------------------------- | :-----------: | ------------------------------------ | ------------------------- |
| Migrations apply in order with the Supabase CLI                                     |  not tested   | ✅ Real PG17                         | —                         |
| Deployed grants, RLS, functions, triggers equal the repository                      |  not tested   | ✅ Real PG17 (`npm run db:compare`)  | —                         |
| RLS and SQL functions per role                                                      |  not tested   | ✅ Real PG17 (121 tests)             | ✅ PGlite                 |
| Concurrency (rate limits, idempotency, outbox, role and status races)               |  not tested   | ✅ Real PG17                         | —                         |
| Data API over HTTP: anon, service_role, every staff role                            |  not tested   | ✅ Real PostgREST                    | ✅ test double (RPC only) |
| Next.js server ↔ Data API (supabase-js request/response shapes, error codes)        |  not tested   | ✅ real-stack app                    | ✅ test double            |
| Supabase Auth (GoTrue): sign-in, refresh, revocation, password policy, no sign-up   |  not tested   | not tested (simulated)               | ✅ test double            |
| Supabase API gateway key handling (`sb_publishable_`/`sb_secret_`)                  |  not tested   | approximated by a local gateway      | ✅ test double            |
| Hosted project settings (`config.toml` is not applied to hosted projects)           |  not tested   | —                                    | —                         |
| Turnstile siteverify: pass, fail, spent, invalid secret, timeout, hostname mismatch |       —       | ✅ Cloudflare **test** keys          | ✅ unit                   |
| Turnstile widget in the browser                                                     |       —       | ✅ Cloudflare **test** sitekey       | —                         |
| Turnstile with a real widget, real hostname and action                              |       —       | not tested (no account)              | ✅ unit                   |
| Transactional outbox, provider failure, retries, retry cap, cron secret             |       —       | ✅ Real PG17 + Resend error response | ✅ unit                   |
| Real email delivery (verified domain, deliverability)                               |       —       | **not tested** (no account)          | ✅ unit                   |
| Trusted-proxy IP parsing (`CLIENT_IP_HEADER`, hops)                                 |       —       | not tested on a hosting platform     | ✅ unit                   |
| Same-origin (CSRF) check on server actions                                          |       —       | not tested beyond Next.js defaults   | —                         |
| Load / volume                                                                       |       —       | not tested (small concurrency only)  | —                         |

## 5. Results by area

### Authorization (Real PostgREST over HTTP, Real PG17)

| Role                      | Result                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anonymous visitor         | 401 on every booking, notes, history, profile, role, permission and audit table; cannot insert/update/delete inquiries; cannot call any of the 15 functions (including `submit_inquiry`); private schema unreachable (`PGRST106`/404); services readable only as published rows through named columns (`select=*` denied); OpenAPI lists no private objects |
| Server key (service_role) | can call `submit_inquiry`; 403 on every booking table and every staff function. Before migration `20261026090000` it could still execute `assign_role`, `revoke_role` and `get_my_access` (refused only because it has no `sub`): fixed                                                                                                                     |
| Account without a role    | sees nothing; every write refused                                                                                                                                                                                                                                                                                                                           |
| Content editor            | empty inbox, counts and detail; no access to notes; no status, note or assignment changes; direct `PATCH`/`DELETE` refused or affect nothing                                                                                                                                                                                                                |
| Analyst                   | `booking_report` only (totals by status and event type, no personal data); also works over `GET` (PostgREST runs STABLE functions read-only); no rows anywhere else                                                                                                                                                                                         |
| Event manager             | lists, counts and reads only their assignments. Another manager's or an unassigned inquiry is invisible through detail, table, notes, history, search and assignee filters. Status changes and notes work only on their own assignments; invalid transitions → `22023`; missing and forbidden inquiries return identical responses                          |
| Admin                     | assigns only to staff who can work inquiries; cannot erase; manages non-privileged roles only; cannot touch owners/admins or their own roles                                                                                                                                                                                                                |
| Owner                     | erases an inquiry; the `booking.erased` audit entry keeps only reference, status and source                                                                                                                                                                                                                                                                 |
| Everyone                  | cannot raise their own role (function or direct `user_roles`/`role_permissions` writes), cannot change a profile's `id`; audit log cannot be changed or deleted over the API; status history and audit entries are written with actor and from/to only, no personal data; error bodies contain only `code`, `details`, `hint`, `message`                    |

PostgREST answers `P0002` ("Inquiry not found") with **HTTP 500** (the test double used 404). The
app maps the SQLSTATE code, not the HTTP status, so behaviour is unaffected; monitoring will count
these as server errors.

### Concurrency (Real PG17, multiple connections)

- 40 simultaneous hits on one rate-limit bucket (limit 5): exactly 5 allowed, 40 counted.
- 30 callers cleaning 3,000 expired windows: no errors or deadlocks.
- 20 simultaneous retries with one submission key: one inquiry, one reference, one non-replay.
  One key with 10 different contents: one inquiry, nine `23505` refusals.
- 6 parallel `claim_notifications` calls: 60 messages, none claimed twice.
- Two owners revoking each other at the same time (10 rounds): exactly one succeeds every time; an
  owner always remains. An admin demoted by a transaction that commits first cannot finish a role change.
- A status change that waited on another is checked against the committed status (no stale transition).
- Recorded race (low): a note sent while a reassignment is uncommitted is kept, because
  `add_booking_note` checks access on its own snapshot (§6, F8).

### CAPTCHA (Cloudflare siteverify with test keys)

- Always-pass secret → accepted. Its response has **no `action`** and reports hostname `example.com`.
- Expected hostname set → refused. Always-fail and spent-token secrets → refused. Invalid secret →
  "unavailable" (not the visitor's fault). 1 ms timeout → fails closed. Empty or oversized token →
  refused without calling Cloudflare.
- Browser: the real widget (test sitekey) produced a token, the inquiry was stored through the
  real-stack app, and resending the **byte-identical** server-action request returned
  `captcha_failed` (log: `captcha token reused`). The test secret accepts any token, so only the
  new single-use check could have refused it.
- Not verified: a production widget (real hostname, action, Cloudflare's own replay behaviour).

### Rate limits

- Atomic under concurrency (above). Two-phase order confirmed in unit tests: per-IP before CAPTCHA;
  CAPTCHA token (new), mailbox and site-wide after.
- Fixed windows allow up to twice the limit across a window boundary. This was observed in the baseline
  e2e run (§3) and remains a documented gap (§6, F3).
- Trusted-proxy parsing (`CLIENT_IP_HEADER`, rightmost entries, hop count) is unit-tested only; it
  must be confirmed on the chosen hosting platform.

### Email

- Outbox rows (`customer_acknowledgement`, `staff_new_inquiry`) exist as soon as `submit_inquiry`
  commits: same transaction as the inquiry.
- `/api/internal/notifications`: 401 without the header, with a wrong secret, and with the secret but
  no `Bearer` prefix; 200 with the secret (GET and POST).
- With an invalid Resend key, Resend answered 401: all four messages were marked `failed` with
  `provider responded 401`, attempts counted 1, 2, … 5, then no longer claimed. Inquiries unchanged.
  Logs contain references only.
- The acknowledgement contains no free text from the submission (unit-tested), so a typed address
  cannot be used to send a chosen message to a third party.
- **Real delivery is unverified** (no account or verified domain).

## 6. Findings, by severity

| #   | Severity                  | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Status                                                                                                                                   |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Medium-low (availability) | **One solved CAPTCHA could pass many times.** The server sends Turnstile the client-chosen submission key as `idempotency_key`. Cloudflare's retry semantics, as client libraries document them, repeat the first result for the same token and key, and community reports describe reuse even without a key. A script could therefore replay one token, and each replay would be charged to the mailbox budget (3/h, locking out a victim's address) and the site-wide budget (300/h, closing the form). This undermined the two-phase design. Not reproducible with test secrets, which accept any token | **Fixed**: each verified token is accepted once (Postgres bucket keyed on its HMAC, 24 h); unit tests plus the browser replay test above |
| F2  | Low                       | Production with Turnstile but without a valid `NEXT_PUBLIC_SITE_URL` silently skipped the hostname check while the form stayed open                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | **Fixed**: the form stays closed (`site-url-not-configured`); unit tests                                                                 |
| F3  | Low                       | Fixed-window limits allow up to 2× the limit across a boundary; this made the e2e rate-limit spec fail ~2.5 % of runs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Spec made boundary-aware (assertion unchanged). Limiter unchanged: **work item W1**                                                      |
| F4  | Low / defence in depth    | `service_role` kept EXECUTE on `assign_role`, `revoke_role`, `get_my_access` (Supabase default privileges; Stage 1 revoked them from the other roles only). Not exploitable without `auth.uid()`; the DB test did not cover `service_role`                                                                                                                                                                                                                                                                                                                                                                 | **Fixed**: migration `20261026090000`; the privilege test now lists `service_role` too                                                   |
| F5  | Informational             | `service_role` keeps Supabase's default table privileges on `profiles`, `services`, `service_translations` (all) and read access on `user_roles`, `role_permissions`, `audit_logs` (the read access is documented). The secret key is used only for the four inquiry functions                                                                                                                                                                                                                                                                                                                             | **CMS entry condition C3**                                                                                                               |
| F6  | Informational             | The CAPTCHA check accepts a response without an `action` (Cloudflare's test responses have none). Tightening it to `action === "inquiry"` in production is right only once a production response is confirmed to carry it; otherwise the form would close                                                                                                                                                                                                                                                                                                                                                  | **Work item W2** (verify with real keys first)                                                                                           |
| F7  | Informational             | PostgREST returns HTTP 500 for `P0002`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **Work item W3** (e.g. raise PostgREST's `PT404` for "not found")                                                                        |
| F8  | Low                       | `add_booking_note` takes no row lock, so a note can land just after a reassignment commits (the author had access when the request started)                                                                                                                                                                                                                                                                                                                                                                                                                                                                | **Work item W4**                                                                                                                         |
| F9  | Low                       | Per-IP buckets use the full IPv6 address; a client can rotate within its /64. CAPTCHA (now single use) and the shared budgets still apply                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **Work item W5**                                                                                                                         |
| F10 | Operational               | Messages that fail 5 times stay `failed` with no alert, so staff could miss a new-inquiry notification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | **Launch item L6** (monitor the query in §8)                                                                                             |
| F11 | Test infrastructure       | `next dev` sometimes answers the first concurrent requests for a route with `SyntaxError: Unexpected end of JSON input` (HTTP 500) while compiling; seen in 3 of 7 real-stack runs at 4 workers, not caused by application code                                                                                                                                                                                                                                                                                                                                                                            | **Work item W6** (warm routes in global setup or reduce workers)                                                                         |
| F12 | Operational               | On Windows, `psql` without `PGCLIENTENCODING=UTF8` cannot load the Amharic seed when its output is redirected (WIN1252 client encoding). The Supabase CLI is unaffected                                                                                                                                                                                                                                                                                                                                                                                                                                    | Documented in §8                                                                                                                         |

Known gaps reviewed and **unchanged** (not narrow fixes): no `script-src` CSP; no CAPTCHA on admin
sign-in; MFA not enforced for owners/admins; no audited correction workflow for submitted inquiries;
no privacy-erasure admin UI; load behaviour not measured; email retries depend on a scheduler.

## 7. Work items (not done in this stage)

| ID  | Item                                                                                                                                                                                                            | When                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| W1  | Sliding-window (weighted previous window) rate limits. Rows must then live for two windows (two days for the daily limit), so the privacy notice ("deleted within about a day") and INQUIRIES.md change with it | Hardening                 |
| W2  | Require `action === "inquiry"` in production after confirming real responses carry it                                                                                                                           | Before launch             |
| W3  | Map "not found" to HTTP 404 (`PT404`) in the inquiry functions and adjust the app's error mapping                                                                                                               | Hardening                 |
| W4  | `add_booking_note`: lock the booking row (`for share`) before the access check                                                                                                                                  | Hardening                 |
| W5  | Rate-limit IPv6 clients by /64 prefix                                                                                                                                                                           | Hardening                 |
| W6  | Make the dev-server e2e run immune to first-compile races                                                                                                                                                       | Next test-infra change    |
| W7  | Run `npm run test:db:pg` in CI against a `postgres:17` service container                                                                                                                                        | With CI setup             |
| W8  | Known gaps above: nonce CSP, admin sign-in CAPTCHA (Supabase Auth CAPTCHA + client token), MFA (AAL2) for owner/admin, correction workflow, erasure UI, load test                                               | Stages 4–5, before launch |

## 8. What the owner must do

### Before CMS development (conditions)

- **C1. Provide a real Supabase development environment** (either option):
  - **Local:** install Docker Desktop, then `npm run supabase:start`, `npm run db:reset`, `npm run db:lint`.
  - **Hosted:** create a project used only for development (never production data), then:
    ```bash
    npx supabase login                                   # browser sign-in; or set SUPABASE_ACCESS_TOKEN
    npx supabase link --project-ref <dev-project-ref>    # check the name: it must be the dev project
    npx supabase migration list                          # expect no remote migrations on a new project
    npx supabase db push --dry-run                       # review: 6 migrations
    npx supabase db push
    DEPLOYED_DATABASE_URL='<direct connection string>' npm run db:compare   # expect "matches the repository"
    ```
- **C2. Run the HTTP authorization suite against it.** It creates and removes its own fixture users
  and inquiries (audit entries remain, by design); never point it at production. It has run against
  standalone PostgREST only, so a first failure against Supabase may be a suite assumption rather
  than an app defect: read the assertion before changing anything.
  ```bash
  # Local stack: values from `npm run supabase:status`
  TEST_POSTGREST_URL=http://127.0.0.1:54321/rest/v1 TEST_POSTGREST_APIKEY=<anon or publishable key> \
  TEST_POSTGREST_JWT_SECRET=<JWT secret> \
  TEST_POSTGREST_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
  npx vitest run --config vitest.postgres.config.mts tests/postgres/postgrest.test.ts
  # Hosted dev project: REST URL https://<ref>.supabase.co/rest/v1, the publishable key, the legacy
  # JWT secret (Settings → JWT Keys) and the direct connection string, plus TEST_POSTGRES_ALLOW_REMOTE=true.
  # If the legacy JWT secret is revoked, self-signed tokens are refused: use the local stack instead.
  ```
- **C3. CMS migrations** follow the existing rules and also revoke `service_role` on every new table
  (Supabase's default privileges grant it everything); decide in the same migration whether
  `service_role` keeps DML on `services`, `service_translations` and `profiles` (F5).
- **C4.** Media uploads (Stage 3) depend on Supabase Storage, which only a real Supabase environment
  can test: C1 is required before that part of the CMS.

### Hosted project settings (not taken from `supabase/config.toml`)

Set these in the dashboard of every hosted project. Do not `supabase config push` the repository's
`config.toml` unchanged: its Site URL and redirect URLs are `localhost`. Disable sign-ups; email/password provider with minimum length 12 and lower/upper/digits; JWT expiry
3600 s; refresh-token rotation; secure password change; Data API exposed schemas `public` (and
`graphql_public`) only, never `private`; Site URL and redirect URLs of the real site.

### Test accounts on a dev project

Create users in **Authentication → Add user**, then in the SQL editor:

```sql
select private.bootstrap_first_owner('owner-test@example.com');       -- once, while no owner exists

-- Further roles through the audited function, acting as that owner (repeat per account and role).
-- The ids are looked up before switching role: `authenticated` cannot read auth.users.
begin;
select set_config('request.jwt.claims', json_build_object('role', 'authenticated',
         'sub', (select id from auth.users where email = 'owner-test@example.com'))::text, true),
       set_config('app.target_user', (select id::text from auth.users where email = 'manager-test@example.com'), true);
set local role authenticated;
select public.assign_role(current_setting('app.target_user')::uuid, 'event_manager');
commit;
```

(Checked on Real PG17: the role is granted and a `role.assigned` audit entry is written.)

Then sign in as each role in the app (`.env.local` with the dev project's URL, publishable key,
secret key, `NEXT_PUBLIC_SITE_URL=http://localhost:3000` and, to exercise the optional CAPTCHA,
Cloudflare's test keys), submit an inquiry, and check the inbox per role. This is the first test of
real Supabase Auth.

### Before launch

- **L1.** Turnstile is optional since 2026-10-28 (owner's decision: the inquiry form, like the
  contact form, runs without a CAPTCHA). If spam appears, create a widget for the production
  hostname (redirect `www` ↔ apex so only one hostname serves the form); set both keys; submit a
  real inquiry on a preview deployment; confirm the log line `accepted:`; then decide W2.
- **L2.** Resend: verify the sending domain (SPF, DKIM, DMARC), use a sending-only API key, send to an
  approved test recipient, check spam placement.
- **L3.** Retries: set `CRON_SECRET` (≥ 32 characters) and a platform schedule (e.g. every 10 minutes)
  calling `GET /api/internal/notifications` with `Authorization: Bearer $CRON_SECRET`.
- **L4.** `CLIENT_IP_HEADER` (and hops) for the chosen platform; `NEXT_PUBLIC_SITE_URL` (https) is
  required, or the form stays closed.
- **L5.** Run C1/C2 against the production project before it holds data (migrations, `db:compare`,
  settings), then never run the fixture suites against it again.
- **L6.** Monitor undelivered messages:
  ```sql
  select o.kind, o.attempts, o.last_error, b.reference
  from private.notification_outbox o join public.bookings b on b.id = o.booking_id
  where o.status = 'failed' and o.attempts >= 5;
  ```
- **L7.** MFA for owners/admins, admin sign-in CAPTCHA and a nonce-based CSP (W8); privacy-notice
  legal review; Amharic review; confirmed business details.

On Windows, run SQL files that contain Amharic with `PGCLIENTENCODING=UTF8` (F12).

## 9. After this branch

| Command                                          | Outcome                                                                                         |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `npm run format:check`                           | pass                                                                                            |
| `npm run verify`                                 | pass: lint, typecheck, **332/332** Vitest (3 new), client-bundle secret scan                    |
| `npm run test:e2e`                               | **48/48**                                                                                       |
| `npm run test:db:pg` (Real PG17, with PostgREST) | **177/177**: DB suites 121, concurrency 9, PostgREST HTTP 47; no test databases left behind     |
| `npm run db:compare` (Real PG17)                 | before the new migration: 4 differences (history + 3 grants); after `supabase db push`: matches |

## 10. Decision

**Ready with conditions** for CMS development: C1–C4 above. The inquiry system's authorization,
RLS, workflow and abuse controls held on real PostgreSQL 17 and real PostgREST, and the issues found
were narrow and are fixed. Supabase Auth, the hosted project's settings, Storage, production
Turnstile and real email delivery have **not** been verified. They are launch blockers, and Storage is
a blocker for the media part of Stage 3.

## 11. Stage 3 (CMS)

Date: 2026-10-24 · Baseline: `6cf5b4b` (Stage 2.5) · Branch: `stage-3-cms` · Design: [CMS.md](CMS.md),
[MEDIA.md](MEDIA.md), [ADR 0004](adr/0004-stage-3-cms.md)

**Conditions C1 and C4 (§8) were still not met**: there is no Supabase project dedicated to this
application, and Docker is not installed. A database offered during this stage turned out to hold
another application's live data; it was inspected read-only, nothing was applied or written, and it
is not used or referenced anywhere in this repository. Everything below therefore ran on PGlite, the throwaway PostgreSQL
17 cluster and PostgREST 14 of §2, and the Supabase test double. **Nothing was verified against
Supabase Auth, the Storage API or a hosted project.**

### Integration matrix

| Area                                                                                     | Real Supabase | Local real                                                                          | Mocked                                           |
| ---------------------------------------------------------------------------------------- | :-----------: | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| Stage 3 migrations apply with the Supabase CLI as a non-superuser                        |  not tested   | ✅ Real PG17 (`supabase db push`, with a Supabase-like `storage` schema, see below) | ✅ PGlite                                        |
| Deployed catalog equals the repository (now including Storage)                           |  not tested   | ✅ Real PG17 (`npm run db:compare`)                                                 | —                                                |
| Workflow, publish rules per role, Amharic review gate, audit, staff and public reads     |  not tested   | ✅ Real PG17                                                                        | ✅ PGlite                                        |
| Content and media tables, CMS functions over HTTP (visitor, secret key, staff roles)     |  not tested   | ✅ Real PostgREST                                                                   | ✅ test double                                   |
| `storage.objects` policies (reserved uploads, no overwrite, public only while published) |  not tested   | ✅ Real PG17 with a reduced `storage.objects`                                       | ✅ PGlite, test double                           |
| Storage API (upload, download, remove, bucket limits)                                    |  not tested   | not tested                                                                          | ✅ test double (rows under the real policies)    |
| Policy creation on hosted `storage.objects` (platform policy grants)                     |  not tested   | approximated (owner role membership)                                                | —                                                |
| Admin UI flows (editing, review gate, conflicts, uploads, image visibility, preview)     |  not tested   | —                                                                                   | ✅ e2e on the dev server against the test double |
| Public CMS pages without a database (empty states, 404s, `noindex`, navigation)          |       —       | ✅ production build                                                                 | —                                                |
| Image optimiser and caches with real Storage                                             |  not tested   | —                                                                                   | dev server only                                  |

The `storage` schema on Real PG17 is a reduced copy of Supabase's (`buckets`, `objects` with the
columns the policies use), owned by `supabase_storage_admin` as on hosted projects. There `postgres`
creates policies through the platform's policy grants; on Real PG17 it is a member of
`supabase_storage_admin` instead, so policy creation on hosted Supabase remains a manual check
([MEDIA.md](MEDIA.md#hosted-supabase-checklist)).

### Results

| Command                                                       | Outcome                                                                                                                                                                |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                        | pass                                                                                                                                                                   |
| `npm run verify`                                              | pass: lint, typecheck, **438/438** Vitest (25 files), client-bundle secret scan (430 browser files)                                                                    |
| `npm run test:e2e`                                            | **65/65** (13 new CMS specs, 4 new public-page specs)                                                                                                                  |
| `supabase db push --db-url <Real PG17>` (dry run, then apply) | exactly the 5 Stage 3 migrations, applied in order                                                                                                                     |
| `npm run db:compare` (Real PG17)                              | matches: 11 migrations, 24 tables, 85 policies, 81 table and 217 column privileges, 58 functions, 76 triggers, 9 enums; Storage RLS, 4 policies and the `media` bucket |
| `npm run test:db:pg` with the PostgREST suite (Real PG17)     | **249/249**: DB suites 160, concurrency 9, PostgREST HTTP 80 (47 before this stage)                                                                                    |
| PostgREST OpenAPI as a visitor                                | 24 paths; no `private` objects; of the CMS functions only the eight `public_*` reads                                                                                   |

### Findings

| #   | Severity            | Finding                                                                                                                                                                                                                                                    | Status                                                                                 |
| --- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| F13 | Low                 | Admin forms remounted after every save (keyed by version), dropping the "Saved." confirmation; a form could also keep an older version after a status change and report a false conflict                                                                   | **Fixed** before commit (newest known version is sent); e2e covers saves and conflicts |
| F14 | Low (accessibility) | The image picker button took its accessible name from the field label ("Image") instead of its action; interface labels were marked `lang="am"`; English titles in the Amharic admin were not marked `lang="en"`; optional labels read "Summary(optional)" | **Fixed** before commit                                                                |
| F15 | Low                 | Media cleanup counted Storage removals that RLS had skipped                                                                                                                                                                                                | **Fixed**: counts the objects Storage reports as removed                               |
| F16 | Informational       | First request for a slug without a prerendered page returns `200` with the not-found page and `noindex` (the prerendered shell streams first); later requests get `404`                                                                                    | Accepted and documented (CMS.md); a real 404 would need a proxy lookup                 |
| F17 | Informational       | Images may stay in browser, CDN or image-optimiser caches for up to 5 minutes after unpublishing                                                                                                                                                           | Accepted and documented; replacement gives a new name (MEDIA.md)                       |
| F18 | Informational       | Visitors (`anon`) need USAGE on the `private` schema for the Storage and visibility policies; EXECUTE is limited to four helpers and the Data API does not expose `private` (confirmed over HTTP)                                                          | By design; pinned by `schema.test.ts`                                                  |
| F19 | Informational       | Signed-in accounts without content permissions read published entries through the staff list function, with their timestamps and versions (the public read policy applies to `authenticated`; same class as the `updated_by` gap in SECURITY_MODEL.md)     | Acceptable while sign-up is disabled                                                   |
| F20 | Test infrastructure | The message-parity test read plural-branch text such as `{Used in # places}` as a placeholder                                                                                                                                                              | Test now parses ICU messages (stricter: nested arguments, malformed messages)          |

F5 (`service_role` table privileges) is resolved for every content table; `profiles` remains (work
item W10).

### What the owner must do (Stage 3)

- **S1.** Meet C1 (a dedicated dev project or the local stack), then `supabase db push` (dry run
  first: the 11 migrations, or the 5 Stage 3 ones on top of an existing Stage 2.5 project) and
  `npm run db:compare`; it now also checks Storage policies and the bucket.
- **S2.** Run C2 (the HTTP suite now includes the CMS checks) against that project.
- **S3.** Work through [MEDIA.md](MEDIA.md#hosted-supabase-checklist) (bucket, policies, behaviour).
- **S4.** Sign in as a `content_editor` test account and try the editorial flow: draft, Amharic review
  gate, publish, preview, upload, unpublish (the image must stop being served).
- **S5.** Native-speaker review of the Amharic interface strings (about 340 new in this stage) and
  of any Amharic content before it is confirmed as reviewed.

### Work items

| ID  | Item                                                                                                    | When           |
| --- | ------------------------------------------------------------------------------------------------------- | -------------- |
| W9  | Run the CMS e2e specs against a real Supabase environment (Auth and Storage) instead of the test double | After S1       |
| W10 | Revoke `service_role` on `profiles` once nothing server-side needs it                                   | Stage 4        |
| W11 | Optional: a proxy-level slug check if first-request soft 404s matter for analytics (F16)                | Only if needed |

## Reproducing the local verification

- `npm run test:db:pg` needs `TEST_POSTGRES_URL`: a superuser URL of a disposable local PostgreSQL
  15+ server (17 recommended). It creates and drops its own `chef_test_*` databases and runs
  migrations as a non-superuser owner. Add the `TEST_POSTGREST_*` variables to include the HTTP suite.
- `npm run db:compare` with `DEPLOYED_DATABASE_URL` is read-only.
- Stage 3 on Real PG17: create the reduced `storage` schema (the `storage` part of
  `tests/integration/db/supabase-shim.sql`, owned by a `supabase_storage_admin` role that `postgres`
  is a member of) before `supabase db push`; a Supabase project already has it.
- The real-stack app runs (gateway with simulated Auth, Playwright configurations) were throwaway
  tooling outside the repository; with a Supabase environment, the repository's own e2e specs can
  instead run against real Auth.
