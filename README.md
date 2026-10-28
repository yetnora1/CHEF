# CHEF SIS

Website and business-management platform for **CHEF SIS**, an Ethiopian chef serving weddings,
corporate events, summits, private occasions and culinary experiences.

It is two connected applications in one Next.js codebase:

- **Public website** (`/en/…`, `/am/…`): bilingual English/Amharic, editorial design, event inquiries.
- **Admin application** (`/admin/…`): staff-only, role-based management of content, inquiries,
  media, translations, users and settings.

> **Status: Stage 3 (content management).** On top of event inquiries (Stage 2), staff edit the
> homepage, About page, services, menu, gallery and journal in English and Amharic in the admin, with
> an audited draft → review → publish workflow, a review gate for Amharic, previews and a media
> library on Supabase Storage ([docs/CMS.md](docs/CMS.md), [docs/MEDIA.md](docs/MEDIA.md)). Staff
> management, settings and the audit-log viewer are **not built yet** (see [Roadmap](#roadmap)).
> Until content is published the site shows clearly labelled placeholders; no business details have
> been invented.
>
> **Not yet verified against Supabase itself** (no dedicated Supabase project, and Docker is
> unavailable). The migrations, RLS, grants and Storage policies were verified on PGlite and real
> PostgreSQL 17, and the app end to end against a test double. See
> [Verification status](#verification-status) and [docs/VERIFICATION.md](docs/VERIFICATION.md), which
> lists what the owner must still set up.

## Documentation

| Document                                         | Contents                                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)     | Structure, route map, rendering model, request flow                                   |
| [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md) | Roles, permission matrix, authorization layers, known gaps                            |
| [docs/DATABASE.md](docs/DATABASE.md)             | Schema, migrations, local Supabase workflow, DB tests                                 |
| [docs/LOCALIZATION.md](docs/LOCALIZATION.md)     | Locale strategy, fallback policy, fonts, translation review                           |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)   | Tokens, themes, typography, motifs, components                                        |
| [docs/INQUIRIES.md](docs/INQUIRIES.md)           | Inquiry form, abuse controls, workflow, email, operations                             |
| [docs/CMS.md](docs/CMS.md)                       | Content model, workflow, Amharic review, safe rendering, caching, preview             |
| [docs/MEDIA.md](docs/MEDIA.md)                   | Media uploads, Storage bucket and policies, image delivery, hosted checks             |
| [docs/VERIFICATION.md](docs/VERIFICATION.md)     | Verification evidence (Stages 2.5 and 3), findings, owner checklist                   |
| [docs/UI_REVIEW.md](docs/UI_REVIEW.md)           | Route-by-route UI audit, changes, remaining gaps and content the owner must supply    |
| [docs/adr/](docs/adr/)                           | Architecture decisions (0001 foundation, 0002 inquiries, 0003 verification, 0004 CMS) |

## Tech stack

Next.js 16 (App Router, Turbopack, Cache Components) · React 19 · TypeScript (strict) ·
Tailwind CSS 4 · Radix primitives (shadcn/ui-style components) · next-intl 4 ·
Supabase (Postgres, Auth, Storage) with `@supabase/ssr` · Zod 4 · Vitest · Playwright · PGlite (DB tests).

## Prerequisites

| Tool         | Version                     | Needed for                                                            |
| ------------ | --------------------------- | --------------------------------------------------------------------- |
| Node.js      | ≥ 20.9 (24 LTS recommended) | Everything                                                            |
| npm          | ≥ 10                        | Package management (lockfile: `package-lock.json`)                    |
| Docker       | Desktop / Engine running    | The local Supabase stack (`npm run supabase:start`)                   |
| Supabase CLI | bundled                     | Installed as a dev dependency; run through `npm run` / `npx supabase` |

Without Docker, the public site, unit tests, database tests (PGlite) and e2e tests still run. Only
the real local Supabase stack (and therefore real sign-in) needs Docker.

## Local setup

```bash
npm install
npx playwright install chromium    # once, for end-to-end tests
cp .env.example .env.local         # placeholders only; fill in below
```

### Option A — local Supabase (requires Docker)

```bash
npm run supabase:start     # starts Postgres, Auth, Storage, Studio; applies migrations + seed
npm run supabase:status    # prints the API URL and keys
```

Put the printed **API URL** and **publishable key** (`sb_publishable_…`) into `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Create the first staff account (public sign-up is disabled by design):

1. Open Studio at <http://127.0.0.1:54323> → **Authentication → Add user** (email + password,
   at least 12 characters with upper/lower case and digits; tick _Auto confirm_).
2. In Studio's **SQL editor**, make that account the first owner (works only while no owner exists):

   ```sql
   select private.bootstrap_first_owner('you@example.com');
   ```

Further roles are granted by an owner/admin with `public.assign_role` (the admin UI for this
arrives in a later stage). Content staff need the `content_editor` role (or owner/admin); the CMS
starts at `/admin/pages`.

### Option B — hosted Supabase project (no Docker)

1. Create a project at <https://supabase.com> (a free project is enough for development).
2. Apply the migrations: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. Copy the project URL and publishable key into `.env.local`.
4. In the dashboard, disable public sign-ups (Authentication → Sign In / Providers), create a user,
   and run `select private.bootstrap_first_owner('you@example.com');` in the SQL editor.

### Event inquiries configuration

The inquiry form accepts submissions only when storage **and** abuse protection are configured;
otherwise `/book` says plainly that online inquiries are not open yet (fail closed).

| To enable…                     | Set                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Storage (required)             | `SUPABASE_SECRET_KEY` (server-only secret key) plus the public Supabase variables                                                 |
| CAPTCHA (required, production) | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` from a Cloudflare Turnstile widget, and `NEXT_PUBLIC_SITE_URL`          |
| Local testing without CAPTCHA  | `INQUIRY_LOCAL_CAPTCHA_BYPASS=true` (ignored by every production build)                                                           |
| Rate-limit IP source           | `CLIENT_IP_HEADER` (required in production): a header your proxy sets; `CLIENT_IP_TRUSTED_HOPS`                                   |
| Email (optional)               | `RESEND_API_KEY`, `INQUIRY_EMAIL_FROM`, `INQUIRY_NOTIFY_TO`, https `NEXT_PUBLIC_SITE_URL` in production; optionally `CRON_SECRET` |

For local tests with a real widget, Cloudflare publishes always-pass test keys
(site `1x00000000000000000000AA`, secret `1x0000000000000000000000000000000AA`); production refuses them.
Details: [docs/INQUIRIES.md](docs/INQUIRIES.md).

### Run the app

```bash
npm run dev                # http://localhost:3000 → redirects to /en or /am
```

- Public site: <http://localhost:3000/en> and <http://localhost:3000/am>
- Admin: <http://localhost:3000/admin> (without Supabase configured it shows a clear
  "Authentication is not configured" notice and denies access)

`NEXT_PUBLIC_*` values are inlined at build time: restart `npm run dev`, or rebuild, after changing them.

### Demo mode (no Supabase, no Docker)

```bash
npm run dev:demo           # http://localhost:3000 (add -- --port 3200 for another port)
```

Runs the app against the in-memory Supabase test double used by the e2e tests, filled with clearly
labelled **sample** content (pages, services, menu, gallery, journal, generated abstract images) and
sample inquiries in every workflow state. The console lists the test accounts (owner, admin, event
manager, content editor, analyst, no role) and their test-only password. Every page shows a
**Demo mode** banner.

Nothing persists or leaves the computer: data lives in memory and resets when the command stops;
email and CAPTCHA are switched off even if `.env.local` holds real keys; no Supabase project is
contacted. Sign-in, roles, RLS, the CMS workflow and uploads behave as in the e2e tests (real SQL
on PGlite, simulated Auth), which is **not** proof that they work against a real Supabase project.
Needs Node.js 22.18+ or 24; stop `npm run dev` and the e2e suite first (they share ports and the
`.next/dev` folder).

## Environment variables

| Variable                                                    | Scope       | Required               | Purpose                                                                       |
| ----------------------------------------------------------- | ----------- | ---------------------- | ----------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`                                  | public      | for admin              | Supabase API URL                                                              |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                      | public      | for admin              | Supabase publishable key (RLS still applies)                                  |
| `NEXT_PUBLIC_SITE_URL`                                      | public      | inquiries (production) | Canonical origin; email links, Turnstile hostname check (https in production) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                            | public      | inquiries              | Cloudflare Turnstile widget                                                   |
| `SUPABASE_SECRET_KEY`                                       | server-only | inquiries              | Calls only the inquiry/rate-limit/outbox functions                            |
| `TURNSTILE_SECRET_KEY`                                      | server-only | inquiries              | Turnstile verification (production refuses test keys)                         |
| `INQUIRY_LOCAL_CAPTCHA_BYPASS`                              | server-only | no                     | `true` = local testing without CAPTCHA; ignored in production                 |
| `CLIENT_IP_HEADER`                                          | server-only | inquiries (production) | Proxy-set header carrying the client IP for rate limiting                     |
| `CLIENT_IP_TRUSTED_HOPS`                                    | server-only | no                     | Proxies you control in front of a list header (1–5, default 1)                |
| `RESEND_API_KEY`, `INQUIRY_EMAIL_FROM`, `INQUIRY_NOTIFY_TO` | server-only | no                     | Optional email via Resend                                                     |
| `CRON_SECRET`                                               | server-only | no                     | Enables the email-retry endpoint for a scheduler                              |

The app refuses to use a secret or `service_role` key placed in a `NEXT_PUBLIC_` variable.
Never commit `.env.local`; only `.env.example` (placeholders) is tracked.

## Commands

| Command                                      | What it does                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run dev`                                | Development server                                                                              |
| `npm run dev:demo`                           | Development server with in-memory sample data and test accounts (no Supabase needed)            |
| `npm run build` / `start`                    | Production build / serve it                                                                     |
| `npm run lint`                               | ESLint (Next.js core-web-vitals + TypeScript rules)                                             |
| `npm run format[:check]`                     | Prettier (with Tailwind class sorting)                                                          |
| `npm run typecheck`                          | Generate route types, then `tsc --noEmit`                                                       |
| `npm test`                                   | All Vitest suites (unit + database)                                                             |
| `npm run test:unit`                          | Unit tests                                                                                      |
| `npm run test:db`                            | Migrations + RLS/role tests on in-process Postgres (PGlite)                                     |
| `npm run test:db:pg`                         | The same suites plus concurrency on a real PostgreSQL server (`TEST_POSTGRES_URL`, disposable)  |
| `npm run test:e2e`                           | Playwright (builds, then starts its own servers on ports 3100/3101)                             |
| `npm run check:bundle`                       | Builds with canary secrets and fails if any reach browser output (removes the build afterwards) |
| `npm run verify`                             | lint → typecheck → tests → bundle check                                                         |
| `npm run supabase:start` / `stop` / `status` | Local Supabase stack (Docker)                                                                   |
| `npm run db:new <name>`                      | New timestamped migration in `supabase/migrations/`                                             |
| `npm run db:reset`                           | Recreate the **local** database from migrations + `seed.sql` (destroys local data)              |
| `npm run db:lint`                            | Supabase schema linter (needs the local stack)                                                  |
| `npm run db:compare`                         | Read-only check that a deployed database (`DEPLOYED_DATABASE_URL`) matches the migrations       |
| `npm run db:types`                           | Generate `src/types/database.types.ts` from the local schema                                    |

## Project structure

```
src/
  app/
    [locale]/            public site (root layout per locale: /en, /am)
    admin/               admin app (separate root layout, no locale prefix)
      login/             sign-in
      (protected)/       everything behind authorization (overview, inquiries, CMS, media, preview)
    api/admin/media/     media upload (Route Handler)
    api/internal/        server-to-server endpoints (email outbox retries)
    media/               public delivery of images used by published content
    globals.css          design tokens, themes, typography, motifs
  components/            ui/ (primitives) · layout/ · public/ · admin/ · brand/ · theme/
  features/              feature logic: admin modules, auth, bookings (inquiries), cms, media, content (placeholders)
  i18n/                  next-intl routing, request config, navigation helpers
  lib/                   auth (DAL), permissions, supabase clients, localization, theme, fonts
  messages/              interface translations (en.json, am.json)
  proxy.ts               locale routing (public) and session refresh (admin)
supabase/
  config.toml            local stack configuration (sign-up disabled, password policy)
  migrations/            SQL migrations — the only way the schema changes
  seed.sql               local development placeholders (no users, no customers)
tests/
  unit/                  pure logic, catalogues, design tokens
  integration/db/        migrations + RLS on Postgres (PGlite) with a Supabase auth and Storage shim
  e2e/                   Playwright, incl. a Supabase test double (fake Auth, real SQL and Storage rows on PGlite)
scripts/                 check-client-bundle.mjs, compare-deployed-schema.mjs, dev-demo.mjs (+ demo/ sample content)
docs/                    architecture, security, database, localization, design, ADRs
```

## Roadmap

| Stage                   | Scope                                                                                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Foundation          | Architecture, design system, EN/AM routing, themes, schema + RLS for identity, roles, services, bookings; admin authentication and shell                         |
| 2 — Event inquiries     | Public inquiry form (validated server action, rate limits, Turnstile), admin inbox, lifecycle, assignment, notes, history, optional email outbox, privacy notice |
| 3 — CMS                 | Pages, services, menu, gallery, journal with per-locale editing, review and publishing; preview; media library on Supabase Storage                               |
| **3.5 — UI completion** | Route-by-route UI audit and polish, operational admin overview, responsive and accessibility fixes, local demo mode ([docs/UI_REVIEW.md](docs/UI_REVIEW.md))     |
| 4 — Staff & settings    | Invitations, role management UI, site settings, audit-log viewer, MFA for privileged roles                                                                       |
| 5 — Hardening & launch  | Real-Supabase verification, nonce-based CSP, monitoring, SEO (sitemap, structured data), deployment                                                              |

## Verification status

| Layer                                  | What runs                                                                                                                                                                                                        | Real Supabase?                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Unit (Vitest)                          | validation, config fail-closed rules, CAPTCHA verifier, rate-limit buckets, submission pipeline, email templates/outbox, contrast, catalogues; CMS formatting, form parsing, image validation, upload CSRF guard | n/a                                                                    |
| Database (Vitest + PGlite)             | every migration; RLS, grants and SQL functions as `anon`/`authenticated`/`service_role`; CMS workflow, Amharic review, media and `storage.objects` policies                                                      | **No**: Postgres 18 in WASM with a Supabase auth and Storage shim      |
| Browser (Playwright)                   | public site; fail-closed admin and inquiry form; sign-in, roles, inquiry submission and staff workflow; CMS editing, publishing, preview, uploads and image visibility                                           | **No**: a test double (fake Auth; real SQL and Storage rows on PGlite) |
| Real PostgreSQL 17 (`test:db:pg`)      | the database suites, plus concurrency (rate limits, idempotency, outbox, role and status races); migrations applied with `supabase db push`                                                                      | **No**: plain PostgreSQL with Supabase-like roles                      |
| Real PostgREST 14 (opt-in suite)       | the Data API over HTTP as anon, service_role and every staff role                                                                                                                                                | **No**: standalone PostgREST, simulated Auth                           |
| Real local Supabase (`supabase start`) | not run: Docker unavailable                                                                                                                                                                                      | —                                                                      |
| Deployed Supabase project              | none dedicated to this app; nothing deployed                                                                                                                                                                     | —                                                                      |
| Supabase Storage                       | not run: the bucket and policies are tested only against a reduced `storage.objects` table and the test double                                                                                                   | —                                                                      |
| Cloudflare Turnstile                   | siteverify and the browser widget with Cloudflare's **test** keys; no real widget                                                                                                                                | —                                                                      |
| Resend                                 | failure handling against the real API (invalid key); **no real delivery**                                                                                                                                        | —                                                                      |

Before launch, complete the owner checklist in [docs/VERIFICATION.md](docs/VERIFICATION.md#8-what-the-owner-must-do):
a real Supabase environment, its dashboard settings, the HTTP suite against it, real Turnstile keys
and a verified email domain.

## Content and claims policy

No testimonials, awards, clients, statistics, biography or contact details are invented. Placeholder
text and photography are labelled as such on the page and in `src/features/content/home-content.ts`.
Migrations publish no content. The local development seed adds placeholder services (three
published in English, for local testing) and is never pushed to a hosted project, so on a real
project everything visitors see beyond the placeholders is written and published by staff. All
Amharic is a draft pending native-speaker review, and Amharic CMS content can be published only
after staff confirm such a review ([docs/LOCALIZATION.md](docs/LOCALIZATION.md)).
