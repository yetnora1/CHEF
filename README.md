# Chief Harena

Website and business-management platform for **Chief Harena**, an Ethiopian chef serving weddings,
corporate events, summits, private occasions and culinary experiences.

It is two connected applications in one Next.js codebase:

- **Public website** (`/en/…`, `/am/…`): bilingual English/Amharic, editorial design, event inquiries.
- **Admin application** (`/admin/…`): staff-only, role-based management of content, inquiries,
  media, translations, users and settings.

> **Status: Stage 1 foundation.** The architecture, design system, bilingual routing, themes,
> database security model and admin authentication are in place. Most admin modules, the CMS and
> the inquiry form are **not built yet** (see [Roadmap](#roadmap)). The public homepage shows clearly
> labelled placeholder copy and photography; no business details have been invented.

## Documentation

| Document                                                                   | Contents                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                               | Structure, route map, rendering model, request flow         |
| [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md)                           | Roles, permission matrix, authorization layers, known gaps  |
| [docs/DATABASE.md](docs/DATABASE.md)                                       | Schema, migrations, local Supabase workflow, DB tests       |
| [docs/LOCALIZATION.md](docs/LOCALIZATION.md)                               | Locale strategy, fallback policy, fonts, translation review |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)                             | Tokens, themes, typography, motifs, components              |
| [docs/adr/0001-stage-1-foundation.md](docs/adr/0001-stage-1-foundation.md) | Architecture decisions and their trade-offs                 |

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
arrives in a later stage).

### Option B — hosted Supabase project (no Docker)

1. Create a project at <https://supabase.com> (a free project is enough for development).
2. Apply the migrations: `npx supabase link --project-ref <ref>` then `npx supabase db push`.
3. Copy the project URL and publishable key into `.env.local`.
4. In the dashboard, disable public sign-ups (Authentication → Sign In / Providers), create a user,
   and run `select private.bootstrap_first_owner('you@example.com');` in the SQL editor.

### Run the app

```bash
npm run dev                # http://localhost:3000 → redirects to /en or /am
```

- Public site: <http://localhost:3000/en> and <http://localhost:3000/am>
- Admin: <http://localhost:3000/admin> (without Supabase configured it shows a clear
  "Authentication is not configured" notice and denies access)

`NEXT_PUBLIC_*` values are inlined at build time: restart `npm run dev`, or rebuild, after changing them.

## Environment variables

| Variable                               | Scope       | Required  | Purpose                                                         |
| -------------------------------------- | ----------- | --------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | public      | for admin | Supabase API URL                                                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public      | for admin | Supabase publishable key (RLS still applies)                    |
| `NEXT_PUBLIC_SITE_URL`                 | public      | no        | Canonical origin for metadata (default `http://localhost:3000`) |
| `SUPABASE_SECRET_KEY`                  | server-only | not yet   | Stage 2+ (trusted inquiry inserts, staff invitations)           |

The app refuses to use a secret or `service_role` key placed in a `NEXT_PUBLIC_` variable.
Never commit `.env.local`; only `.env.example` (placeholders) is tracked.

## Commands

| Command                                      | What it does                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `npm run dev`                                | Development server                                                                              |
| `npm run build` / `start`                    | Production build / serve it                                                                     |
| `npm run lint`                               | ESLint (Next.js core-web-vitals + TypeScript rules)                                             |
| `npm run format[:check]`                     | Prettier (with Tailwind class sorting)                                                          |
| `npm run typecheck`                          | Generate route types, then `tsc --noEmit`                                                       |
| `npm test`                                   | All Vitest suites (unit + database)                                                             |
| `npm run test:unit`                          | Unit tests                                                                                      |
| `npm run test:db`                            | Migrations + RLS/role tests on in-process Postgres (PGlite)                                     |
| `npm run test:e2e`                           | Playwright (builds, then starts its own servers on ports 3100/3101)                             |
| `npm run check:bundle`                       | Builds with canary secrets and fails if any reach browser output (removes the build afterwards) |
| `npm run verify`                             | lint → typecheck → tests → bundle check                                                         |
| `npm run supabase:start` / `stop` / `status` | Local Supabase stack (Docker)                                                                   |
| `npm run db:new <name>`                      | New timestamped migration in `supabase/migrations/`                                             |
| `npm run db:reset`                           | Recreate the **local** database from migrations + `seed.sql` (destroys local data)              |
| `npm run db:lint`                            | Supabase schema linter (needs the local stack)                                                  |
| `npm run db:types`                           | Generate `src/types/database.types.ts` from the local schema                                    |

## Project structure

```
src/
  app/
    [locale]/            public site (root layout per locale: /en, /am)
    admin/               admin app (separate root layout, no locale prefix)
      login/             sign-in
      (protected)/       everything behind authorization (overview, future modules)
    globals.css          design tokens, themes, typography, motifs
  components/            ui/ (primitives) · layout/ · public/ · admin/ · brand/ · theme/
  features/              feature logic: admin modules, auth, content, localization
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
  integration/db/        migrations + RLS on Postgres (PGlite) with a Supabase auth shim
  e2e/                   Playwright, incl. a fake Supabase HTTP test double for sign-in flows
scripts/                 check-client-bundle.mjs
docs/                    architecture, security, database, localization, design, ADRs
```

## Roadmap

| Stage                           | Scope                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Foundation (this stage)** | Architecture, design system, EN/AM routing, themes, schema + RLS for identity, roles, services, bookings; admin authentication and shell |
| 2 — Event inquiries             | Public inquiry form (validated server action, abuse controls), admin inquiry inbox, status history, notifications                        |
| 3 — CMS                         | Pages, services, menu, gallery, journal with per-locale editing and publishing; media library on Supabase Storage                        |
| 4 — Staff & settings            | Invitations, role management UI, site settings, audit-log viewer, MFA for privileged roles                                               |
| 5 — Hardening & launch          | Nonce-based CSP, rate limiting/CAPTCHA, monitoring, SEO (sitemap, structured data), deployment                                           |

## Content and claims policy

No testimonials, awards, clients, statistics, biography or contact details are invented. Placeholder
text and photography are labelled as such on the page and in `src/features/content/home-content.ts`.
All Amharic is a draft pending native-speaker review ([docs/LOCALIZATION.md](docs/LOCALIZATION.md)).
