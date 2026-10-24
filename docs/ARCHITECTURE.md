# Architecture

## Overview

One Next.js 16 application serves two products with separate root layouts:

|                 | Public website                                                                         | Admin application                                                  |
| --------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| URL space       | `/en/…`, `/am/…`                                                                       | `/admin/…`                                                         |
| Root layout     | `src/app/[locale]/layout.tsx`                                                          | `src/app/admin/layout.tsx`                                         |
| Language source | URL segment (`next/root-params`)                                                       | `NEXT_LOCALE` cookie                                               |
| Rendering       | Static prerender (Cache Components); CMS pages will use `use cache` + tag revalidation | Dynamic, per request; blocks until authorized (`instant = false`)  |
| Data access     | Public reads only (published content)                                                  | Signed-in staff, permission-checked on the server, enforced by RLS |
| Design language | Expressive, editorial                                                                  | Restrained, operational                                            |

There is no separate backend service. Trusted logic runs in Server Components, Server Actions and
(later) Route Handlers; Postgres Row Level Security is the final authority over data.

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
  │          ├ getUser()  (validated by Supabase Auth on every request)
  │          └ rpc('get_my_access') → roles + permissions from Postgres
  ▼
Supabase (PostgREST + Postgres)
      every query carries the user's JWT → RLS policies call private.has_permission()
```

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

Implemented in Stage 1 are marked ✅. Planned routes are documented here and are **not** stubbed
with placeholder pages; unknown paths return a localized 404.

### Public (`/[locale]`, locale ∈ `en`, `am`)

| Route                                    | Purpose                       | Status                                                        |
| ---------------------------------------- | ----------------------------- | ------------------------------------------------------------- |
| `/[locale]`                              | Homepage                      | ✅ (placeholder content)                                      |
| `/[locale]/about`                        | Chef biography and philosophy | Stage 3 (homepage `#about` for now)                           |
| `/[locale]/services`, `/services/[slug]` | Service overview and details  | Stage 3 (homepage `#services` for now)                        |
| `/[locale]/menu`                         | Curated menu                  | Stage 3                                                       |
| `/[locale]/gallery`                      | Culinary and event portfolio  | Stage 3                                                       |
| `/[locale]/journal`, `/journal/[slug]`   | Articles                      | Stage 3                                                       |
| `/[locale]/book`                         | Event inquiry form            | Stage 2 (homepage `#inquire` explains status)                 |
| `/[locale]/contact`                      | Contact page                  | Stage 3 (needs confirmed contact details)                     |
| `/[locale]/privacy`, `/terms`            | Legal pages                   | Stage 2 (privacy notice required before collecting inquiries) |
| `/`                                      | Redirect to preferred locale  | ✅                                                            |

Navigation only links to destinations that exist. Until the dedicated pages ship, the header and
footer link to homepage sections (`src/features/content/home-sections.ts`).

### Admin (`/admin`, no locale prefix)

| Route                                              | Required permission                             | Status  |
| -------------------------------------------------- | ----------------------------------------------- | ------- |
| `/admin`                                           | → `/admin/overview`                             | ✅      |
| `/admin/login`                                     | public                                          | ✅      |
| `/admin/overview`                                  | `admin.access`                                  | ✅      |
| `/admin/inquiries`, `/admin/bookings`              | `bookings.read_all` or `bookings.read_assigned` | Stage 2 |
| `/admin/services`, `/menu`, `/gallery`, `/journal` | `content.read` (+ `content.write` to edit)      | Stage 3 |
| `/admin/media`                                     | `media.write`                                   | Stage 3 |
| `/admin/translations`                              | `translations.write`                            | Stage 3 |
| `/admin/users`                                     | `users.read` (+ `users.manage[_privileged]`)    | Stage 4 |
| `/admin/settings`                                  | `settings.manage`                               | Stage 4 |
| `/admin/audit-log`                                 | `audit.read`                                    | Stage 4 |

The registry in `src/features/admin/modules.ts` drives navigation; planned modules render as
non-interactive "Planned" items for roles that will be able to use them.

## Rendering model (Cache Components)

Next.js 16's Cache Components (`cacheComponents: true`, with `partialPrefetching`) is enabled; it
becomes the default in the next major. Consequences:

- Public pages prerender to static HTML per locale (`generateStaticParams` in the locale layout).
  Request-time APIs (`cookies()`, `headers()`) are not used on public pages.
- The CMS stage will read published content inside `use cache` functions tagged per entity and
  call `updateTag()`/`revalidateTag()` from admin server actions, so editors' changes appear
  without redeploying.
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
  only; business copy lives in the database (Stage 3) or, for now, `src/features/content/`.

## Testing strategy

| Layer        | Tool                                                          | What it proves                                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit         | Vitest                                                        | Redirect safety, access decisions, config/secret-key guard, fallback policy, message parity and Ethiopic coverage, WCAG contrast of tokens, theme script, module visibility                                                                           |
| Database     | Vitest + PGlite (Postgres 18 in-process) + Supabase auth shim | Every migration applies; RLS is enabled everywhere; grants are least-privilege; each role's reads/writes; role-management rules; audit log immutability; DB permission matrix equals `src/lib/permissions/matrix.ts`                                  |
| End-to-end   | Playwright                                                    | Locale routing, Amharic fonts, theme persistence and no-flash, keyboard/mobile navigation, security headers, admin fails closed when unconfigured, sign-in and role-based access through the real proxy and DAL (against a fake Supabase HTTP double) |
| Build output | `scripts/check-client-bundle.mjs`                             | Server-only secrets never appear in browser-delivered files                                                                                                                                                                                           |

Real-Supabase integration tests (`supabase test db` / tests against the local stack) are pending
until Docker is available; see [DATABASE.md](DATABASE.md#testing).
