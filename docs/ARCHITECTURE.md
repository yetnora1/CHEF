| `/[locale]/credits` | Photo credits | ✅ Credits for the sample photos and videos (author, licence, source); the media themselves carry no caption |

# Architecture

## Overview

One Next.js 16 application serves two products with separate root layouts:

|                 | Public website                                                             | Admin application                                                  |
| --------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| URL space       | `/en/…`, `/am/…`                                                           | `/admin/…`                                                         |
| Root layout     | `src/app/[locale]/layout.tsx`                                              | `src/app/admin/layout.tsx`                                         |
| Language source | URL segment (`next/root-params`)                                           | `NEXT_LOCALE` cookie                                               |
| Rendering       | Cache Components; CMS content read in `'use cache'` functions tagged `cms` | Dynamic, per request; blocks until authorized (`instant = false`)  |
| Data access     | Published content only, through a session-less publishable-key client      | Signed-in staff, permission-checked on the server, enforced by RLS |
| Design language | Expressive, editorial                                                      | Restrained, operational                                            |

There is no separate backend service. Trusted logic runs in Server Components, Server Actions and
Route Handlers (media upload and delivery, the email-retry job); Postgres Row Level Security and
Storage policies are the final authority over data and files.

## Request flow

```
Browser
  │
  ▼
src/proxy.ts  (Next.js 16 "proxy", formerly middleware; Node runtime)
  ├─ /admin/**  → refreshAdminSession(): refresh Supabase session cookies (getClaims);
  │               no valid session (or Supabase unconfigured) → 307 /admin/login?next=…
  │               Optimistic only: never the security boundary.
  └─ everything else → next-intl: / → /en or /am (cookie, then Accept-Language)
  │
  ▼
Root layout ([locale] or admin) → nested layouts → page
  │   admin: authorizeAdmin(permission) in the layout AND every page / server action
  │          ├ getUser()  (validated by Supabase Auth on every request)  ┐ in parallel; roles are
  │          └ rpc('get_my_access') → roles + permissions from Postgres ┘ used only for a valid user
  ▼
Supabase (PostgREST + Postgres)
      every query carries the user's JWT → RLS policies call private.has_permission()
```

**Region.** `vercel.json` pins the server functions to Vercel's `fra1` (Frankfurt), the region of
the Supabase project (`eu-central-1`). Every admin request makes several sequential calls to
Supabase; in the default `iad1` (Washington) each one crossed the Atlantic. Keep the two regions
together if the Supabase project ever moves.

## Authorization layers

1. **Proxy** (`src/lib/supabase/proxy.ts`): refreshes tokens and redirects visitors without a
   session. Defence in depth only; Next.js documents that proxy/middleware must not be the sole check.
2. **Data Access Layer** (`src/lib/auth/staff-session.ts`): `getStaffSession()` (memoised per
   request) and `authorizeAdmin(permission)`. Roles are read from the database, never from cookies,
   JWT metadata or request input. Layouts do not re-run on every client navigation, so **every
   page and server action calls `authorizeAdmin` itself**.
3. **Postgres RLS** (`supabase/migrations/`): enforced for every API request, regardless of what
   the application does. See [SECURITY_MODEL.md](SECURITY_MODEL.md).

## Route map

Implemented routes are marked ✅. Planned routes are documented here and are **not** stubbed with
placeholder pages; unknown paths return a localized 404.

### Public (`/[locale]`, locale ∈ `en`, `am`)

| Route                                    | Purpose                       | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/[locale]`                              | Homepage                      | ✅ published CMS sections and services; labelled placeholders otherwise                                                                                                                                                                                                                                                                                                                                                                                                        |
| `/[locale]/about`                        | Chef biography and philosophy | ✅ Stage 3 (404 until published)                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `/[locale]/services`, `/services/[slug]` | Service overview and details  | ✅ Stage 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/[locale]/menu`                         | Curated menu                  | ✅ Stage 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/[locale]/gallery`                      | Culinary and event portfolio  | ✅ Stage 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/[locale]/journal`, `/journal/[slug]`   | Articles                      | ✅ Stage 3                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `/[locale]/book`                         | Event inquiry form            | ✅ Stage 2 (fails closed until configured; staff can pause it in Settings; see INQUIRIES.md)                                                                                                                                                                                                                                                                                                                                                                                   |
| `/[locale]/contact`                      | Contact page                  | ✅ Stage 3.7: a message form (stored for the admin inbox; [INQUIRIES.md](INQUIRIES.md#contact-messages)) beside a shortcut to the inquiry form; the homepage service cards link here with `?service=<slug>`, which prefills the subject with that service's name (known services only, `src/features/contact/service-subject.ts`); phone, WhatsApp, Telegram, email, location and social links come from Admin → Settings (`public_site_settings()`), each shown only once set |
| `/[locale]/privacy`                      | Privacy notice                | ✅ Stage 2 (draft for owner and legal review)                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `/[locale]/terms`                        | Terms                         | Later stage (needs business terms)                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/`                                      | Redirect to preferred locale  | ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `/media/assets/<id>/<file>`              | Images of published content   | ✅ Stage 3 ([MEDIA.md](MEDIA.md))                                                                                                                                                                                                                                                                                                                                                                                                                                              |

Navigation only links to destinations that have something to show (`src/features/cms/navigation.ts`):
About and Services link to their pages once published content exists, otherwise to the homepage
sections; Menu, Gallery and Journal appear only once something is published; Contact is always linked. Empty list pages show
an empty state and are `noindex`.

### Admin (`/admin`, no locale prefix)

| Route                                                        | Required permission                                             | Status                                            |
| ------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------- |
| `/admin`                                                     | → `/admin/overview`                                             | ✅                                                |
| `/admin/login`                                               | public                                                          | ✅                                                |
| `/admin/overview`                                            | `admin.access`                                                  | ✅                                                |
| `/admin/bookings`, `/admin/bookings/[reference]`             | `bookings.read_all` or `bookings.read_assigned`                 | ✅ Stage 2 (inquiries and bookings in one inbox)  |
| `/admin/messages`                                            | `messages.read` (mark handled: `messages.write`)                | ✅ Stage 3.7 (contact form messages)              |
| `/admin/pages`, `/services`, `/menu`, `/gallery`, `/journal` | `content.read` (create: `content.write` + `translations.write`) | ✅ Stage 3 ([CMS.md](CMS.md))                     |
| `/admin/preview/[type]/[id]`                                 | `content.read`                                                  | ✅ Stage 3 (drafts, never cached or indexed)      |
| `/admin/media`, `/admin/media/[id]`                          | `media.write`                                                   | ✅ Stage 3                                        |
| `/admin/media/[id]/file` (Route Handler)                     | `content.read` or `media.write`                                 | ✅ Stage 3                                        |
| `/admin/translations`                                        | `translations.write`                                            | ✅ Stage 3                                        |
| `/admin/users`                                               | `users.read` (+ `users.manage[_privileged]`)                    | ✅ Stage 4 (roles via `set_user_roles`)           |
| `/admin/settings`                                            | `settings.manage`                                               | ✅ Stage 4 (contact, social links, inquiry pause) |
| `/admin/audit-log`                                           | `audit.read`                                                    | ✅ Stage 4 (filters, keyset pages)                |

Route Handlers under `/api` (outside the proxy): `POST /api/admin/media` (upload; same-origin check,
then `media.write`) and `/api/internal/notifications` (email retries, `CRON_SECRET`).

The registry in `src/features/admin/modules.ts` drives navigation; planned modules (none at the
moment) render as non-interactive "Planned" items for roles that will be able to use them.

## Rendering model (Cache Components)

Next.js 16's Cache Components (`cacheComponents: true`, with `partialPrefetching`) is enabled; it
becomes the default in the next major. Consequences:

- Public pages prerender to static HTML per locale (`generateStaticParams` in the locale layout).
  Request-time APIs (`cookies()`, `headers()`) are not used on public pages.
- Published content is read inside `'use cache'` functions (`src/features/cms/public-data.ts`)
  tagged `cms`. Admin server actions call `updateTag('cms')` and the upload route
  `revalidateTag('cms', { expire: 0 })`, so editors' changes appear on the next request without a
  redeploy; otherwise entries refresh hourly, and failed reads are retried within minutes. Pages
  with slugs render on demand and are cached the same way. Details: [CMS.md](CMS.md#caching).
- Admin routes read the session and language cookie on every request and set
  `export const instant = false` (blocking by design: nothing renders before authorization).
  `getStaffSession()` calls `connection()` to opt out of prerendering explicitly.

## Folder conventions

- `src/app/**` holds routing only: thin pages that compose components and call the DAL.
- `src/components/ui` holds design-system primitives (shadcn/ui-style, Radix based;
  `components.json` is configured for the shadcn CLI).
- `src/features/<domain>` holds domain logic, server actions and domain-specific client components.
- `src/lib/**` holds framework-agnostic infrastructure (auth, Supabase clients, permissions).
  Modules that must never reach the browser import `server-only`.
- Business content is separate from interface strings: `src/messages/*.json` is interface text
  only; business copy lives in the database (CMS). `src/features/content/` keeps the labelled
  homepage placeholders shown until a section is published.

## Testing strategy

| Layer         | Tool                                                                      | What it proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit          | Vitest                                                                    | Redirect safety, access decisions, config/secret-key guard, fallback policy, message parity (ICU-parsed) and Ethiopic coverage, WCAG contrast of tokens, theme script, module visibility; inquiry validation, fail-closed configuration, Turnstile verifier, rate-limit buckets, submission pipeline, email templates and outbox delivery; CMS formatting parser and link safety, form parsing, error mapping, registry labels, public view fallback, image validation and re-encoding, upload CSRF guard |
| Database      | Vitest + PGlite (Postgres 18 in-process) + Supabase auth and Storage shim | Every migration applies; RLS is enabled everywhere; grants are least-privilege; each role's reads/writes; role-management rules; audit log immutability; DB permission matrix equals `src/lib/permissions/matrix.ts`; inquiry submission, idempotency, rate limits, lifecycle (DB rules equal `status.ts`), assignment, notes, reporting, outbox, erasure; CMS workflow, Amharic review, visitor isolation, media lifecycle and `storage.objects` policies, content audit, registry ↔ schema              |
| End-to-end    | Playwright                                                                | Locale routing, Amharic fonts, theme, keyboard/mobile, security headers, admin, inquiry form and CMS pages without a database; with the Supabase test double (simulated Auth, **real SQL on PGlite**, Storage rows under real policies): sign-in and roles, inquiry submission and staff workflow, CMS editing, publishing, preview, Amharic review, conflicts, inert markup, uploads and image visibility                                                                                                |
| Real database | Vitest + PostgreSQL 15+ (`npm run test:db:pg`), optional PostgREST        | The database suites on a real server with migrations run by a non-superuser; concurrency (rate limits, idempotency, outbox, role and status races); opt-in: the Data API over HTTP per role                                                                                                                                                                                                                                                                                                               |
| Build output  | `scripts/check-client-bundle.mjs`                                         | Server-only secrets never appear in browser-delivered files                                                                                                                                                                                                                                                                                                                                                                                                                                               |

None of these layers is a real Supabase stack: PGlite, plain PostgreSQL, standalone PostgREST and
the test double do not prove GoTrue, Supabase's gateway, the Storage API or hosted-project
configuration (the double reproduces Storage's `storage.objects` row checks, not the service).
Real-Supabase integration tests are pending until Docker (or a hosted test project) is available;
see [VERIFICATION.md](VERIFICATION.md).

## Inquiry submission path

See [INQUIRIES.md](INQUIRIES.md): browser → server action (validation, rate limits, optional Turnstile) →
`public.submit_inquiry` with the server secret key → optional email outbox delivered after the
response. The contact form runs the same pipeline with its own rate-limit buckets and **no
CAPTCHA**, and calls `public.submit_contact_message`; it queues no email. The secret key is used only in
`src/features/bookings/server/store.ts`.
