# ADR 0003 — Stage 2.5: real-database verification and CAPTCHA single use

- **Status:** accepted
- **Date:** 2026-10-24
- Evidence and owner checklist: [VERIFICATION.md](../VERIFICATION.md)

## 1. Verify on real PostgreSQL while Supabase is unavailable

**Context.** No Supabase project, access token or Docker exists, so neither the hosted nor the local
Supabase stack can run. PGlite (Postgres 18, one connection) cannot test concurrency, and
production runs Postgres 17 where the migration role is not a superuser.
**Decision.** Add `npm run test:db:pg`: the unchanged database suites, with PGlite swapped for a
thin adapter, plus a multi-connection suite, on any disposable local PostgreSQL 15+ server.
Migrations run as a non-superuser owner. An opt-in suite exercises the Data API over HTTP through
real PostgREST, and `npm run db:compare` checks a deployed database against the migrations
(read-only).
**Consequences.** Grants, RLS, functions and concurrency are proven on the production major version,
and the same tools apply unchanged to a Supabase environment later. They still do not prove
Supabase Auth, the API gateway, Storage or hosted settings; those remain launch blockers. `pg` is a
dev dependency.

## 2. Each solved CAPTCHA token is accepted once, by the server

**Context.** The server passes the client's submission key to Turnstile as `idempotency_key`, and
Turnstile answers a token resent with the same key with its first result. One solved challenge could
then be replayed to charge the mailbox and site-wide budgets, which only verified requests are
supposed to reach (ADR 0002 §2).
**Options.** (a) Stop sending `idempotency_key`; (b) record each verified token and refuse repeats.
**Decision.** (b), using the existing Postgres rate limiter: a bucket keyed on the token's HMAC,
limit 1, one day (tokens expire after 300 seconds), checked right after verification and before the
shared budgets.
**Why not (a) alone.** It relies on Cloudflare's single-use enforcement, which community reports
question; (b) holds whatever Cloudflare does. The form already fetches a new token after every
attempt, so real visitors are unaffected.

## 3. Production requires the site URL for CAPTCHA

**Decision.** In production, Turnstile mode without a valid `NEXT_PUBLIC_SITE_URL` keeps the form
closed (`site-url-not-configured`) instead of silently skipping the hostname check.
