# ADR 0002 — Event inquiry system

- **Status:** accepted
- **Date:** 2026-10-25

## 1. One narrow privileged write path

**Context.** Anonymous visitors must create private records that they can never read back.
**Options.** (a) An `anon` insert policy or anon-callable RPC; (b) the server secret key with a
single SECURITY DEFINER function.
**Decision.** (b). `public.submit_inquiry` hard-codes status, assignment and source, and only
`service_role` may execute it. `service_role` loses all direct privileges on booking tables, so
the secret key can only create inquiries, consume rate-limit counters and work the email outbox
(whose acknowledgement rows carry the customer's address); it cannot list, change or delete
inquiries. Staff likewise have no direct INSERT/UPDATE on `bookings`: they work inquiries only
through audited functions.
**Why not (a).** Anything `anon` can call can be called directly with the public key, bypassing the
server's validation, rate limits and CAPTCHA.

## 2. Rate limiting in Postgres

**Decision.** Fixed-window counters in `private.rate_limits` via `public.consume_rate_limit`,
keyed by HMAC-hashed IP/email, in two phases: per-IP before CAPTCHA, per-mailbox and site-wide only
after CAPTCHA succeeds (so unverified traffic cannot exhaust shared budgets). Production requires an
explicit, proxy-set `CLIENT_IP_HEADER`; list headers are read from the right.
**Consequences.** Works across instances without adding a provider (Redis/Upstash). One extra round
trip per bucket per submission, which is negligible at inquiry volumes. At larger scale, add
platform-level (WAF/edge) limits in front.

## 3. Cloudflare Turnstile, fail closed

**Decision.** Turnstile, verified server-side. Production builds refuse to accept inquiries without
real keys (test keys are rejected). A documented `INQUIRY_LOCAL_CAPTCHA_BYPASS` exists only for
`NODE_ENV !== production`.
**Consequences.** The form says "not open yet" rather than accepting unprotected submissions.

## 4. Client-generated idempotency keys

**Decision.** The browser generates a UUID per inquiry; `submit_inquiry` returns the original
reference for a same-key/same-content replay and refuses same-key/different-content. A different
key is always a new inquiry; likely duplicates are flagged for staff, never rejected.
**Consequences.** Network retries are safe, and real repeat customers are not blocked.

## 5. Email through a transactional outbox

**Decision.** Outbox rows are inserted in the inquiry transaction; delivery runs after the response,
claims rows with `SKIP LOCKED`, uses the outbox id as the provider idempotency key, and can be
retried by a cron endpoint. The UI never claims an email was sent.
**Consequences.** Provider outages cannot lose inquiries or send duplicates. Without configuration,
nothing is queued.

## 6. Status and assignment only through audited functions

**Decision.** Direct `UPDATE` of `status`/`assigned_to` is revoked; `change_booking_status` and
`assign_booking` authorize explicitly, validate transitions and eligibility, and write history and
audit rows. A transition trigger also guards any other path.
**Consequences.** Every lifecycle change is explained and attributable; the UI cannot drift from the
rules.

## 7. Admin reads through SECURITY INVOKER functions

**Decision.** `list_bookings`, `get_booking_detail` and `booking_inbox_counts` run as the caller, so
RLS decides visibility (event managers see only their assignments). Search terms are parameters
with LIKE wildcards escaped; no filter strings are concatenated.
**Consequences.** One authorization model for list, detail, notes and history. Analysts use
`booking_report()`, which is aggregate-only.

## 8. Supabase test double backed by real SQL

**Context.** Docker is still unavailable, so the real local Supabase stack cannot run.
**Decision.** The Playwright double now executes RPC calls on PGlite with every migration applied,
as `anon`, `authenticated` (with JWT claims) or `service_role`. Auth remains simulated.
**Consequences.** Browser tests exercise the real SQL functions, grants and RLS through the app's
own HTTP calls. They still do not prove PostgREST or GoTrue behaviour, which must be verified on a
real Supabase stack before launch.

## 9. Inbox merged into one module

The planned `/admin/inquiries` and `/admin/bookings` are one inbox at `/admin/bookings`: an inquiry
becomes a booking by status, not by moving between tables.
