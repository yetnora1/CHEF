# Content management (Stage 3)

Staff edit the public website's business content in the admin: the homepage and About page,
services, the menu, the gallery and the journal, each in English and Amharic, plus a media library
on Supabase Storage. Interface text stays in `src/messages/*.json`; everything here is business
content stored per locale in the database. Media is described in [MEDIA.md](MEDIA.md), and the
decisions behind both in [ADR 0004](adr/0004-stage-3-cms.md).

## Content model

Every kind of content has a language-neutral entity row and one translation row per locale
(`en`, `am`), each with its **own** publication status:

| Admin           | Entity → translations                            | Language-neutral fields                      | Per-language fields                                     |
| --------------- | ------------------------------------------------ | -------------------------------------------- | ------------------------------------------------------- |
| Pages           | `pages` → `page_translations` (+ `page_images`)  | fixed keys `home`, `about`; image slots      | title, SEO title/description, `sections` (jsonb)        |
| Services        | `services` → `service_translations`              | slug, display order, image                   | title, summary, body (formatted), SEO title/description |
| Menu categories | `menu_categories` → `menu_category_translations` | slug, display order                          | name, description                                       |
| Dishes          | `menu_items` → `menu_item_translations`          | category, display order, dietary tags, image | name, description                                       |
| Gallery         | `gallery_items` → `gallery_item_translations`    | photo (required), event type, display order  | caption                                                 |
| Journal         | `journal_posts` → `journal_post_translations`    | slug, cover image, `published_at`            | title, excerpt, body (formatted), SEO title/description |
| Media library   | `media_assets` → `media_asset_translations`      | file, title, credit                          | alt text                                                |

`src/features/cms/content-types.ts` describes the same tables for the admin forms and the server
actions; `src/features/cms/pages.ts` defines the page sections (fields and limits). Two tests keep
them honest: `tests/integration/db/cms.test.ts` compares the registry with the database's columns,
`NOT NULL` rules and length limits, and `tests/unit/cms-registry.test.ts` checks that every field,
section and image slot has an interface label in both catalogues.

Page sections are a bounded JSON object (`jsonb_typeof = 'object'`, at most 64 KB). The application
reads them defensively (`readSections()`): only known sections and fields, only strings within their
limits; anything else is ignored.

## Publication workflow

```
draft ──▶ in_review ──▶ published ──▶ archived
  ▲  ◀──────┘   │           │            │
  └─────────────┴───────────┴────────────┘   (unpublish / restore = back to draft)
```

| Step                                                                  | Permission                               |
| --------------------------------------------------------------------- | ---------------------------------------- |
| Create a draft (entity + English title), edit drafts, mark for review | `content.write` (+ `translations.write`) |
| Write or edit a language version that is not live                     | `translations.write`                     |
| Enter, leave or edit `published` / `archived` rows; delete            | `content.publish`                        |
| Change the images of a live page                                      | `content.publish`                        |

Visitors see an entry only when the entity **and** a translation are published (a dish also needs
its category published). The database enforces this in RLS and in the public SQL functions; the
admin shows the same rule next to the buttons.

- **Concurrency.** Each row has a `version` that a trigger increments on every update. Saves send
  the version they loaded and match on it, so a stale save changes nothing and the editor sees
  "Someone else changed this since you opened it" instead of overwriting.
- **Deletion.** Published rows must be unpublished first. Deleting an entry deletes its
  translations; images stay in the media library.
- **Audit.** `private.audit_content` writes `content.created|updated|status_changed|deleted` and
  `media.*` entries with the actor, target, locale, status change and the **names** of changed
  fields, never the content itself. Content staff cannot write or change audit entries.

### Amharic review gate

An Amharic translation can be published only after a staff member confirms that a fluent speaker
reviewed **that exact text** (the "Reviewed by a fluent Amharic speaker" box). The database stamps
the confirmation with the time and the confirming account (clients cannot forge either), clears it
whenever the text changes, and refuses to publish Amharic without it (`P0001`, hint
`review_required`). Changing live Amharic text therefore requires re-confirming in the same save.

The confirmation is an attestation by staff, not a language check: the system cannot judge the
quality of a translation. English versions have no review gate.

## Editing in the admin

| Route                                                   | Permission                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `/admin/pages`, `/admin/pages/[key]`                    | `content.read`                                                  |
| `/admin/services[/new\|/[id]]`                          | `content.read` (create: `content.write` + `translations.write`) |
| `/admin/menu[/new\|/[id]]`, `/admin/menu/categories[…]` | same                                                            |
| `/admin/gallery[…]`, `/admin/journal[…]`                | same                                                            |
| `/admin/translations`                                   | `translations.write`                                            |
| `/admin/media`, `/admin/media/[id]`                     | `media.write`                                                   |
| `/admin/preview/[type]/[id]?locale=en\|am`              | `content.read`                                                  |

Every page and server action calls `authorizeAdmin()` itself, and writes use the staff member's
own session, so RLS and the triggers check everything again. Forms validate on the server with the
same rules as the database (`src/features/cms/schemas.ts`; lengths in code points, like
`char_length`), report field errors next to the field, announce results (`role="status"` /
`role="alert"`), and warn before leaving with unsaved changes. Both language versions stay mounted
while switching tabs, so nothing typed is lost.

`/admin/translations` lists what still needs work: no Amharic version, Amharic not reviewed, no
English version, or a language not published.

## Safe rendering

Body fields accept a small formatting language (`src/features/cms/markup.tsx`):

```
## Heading            ### Smaller heading
- item / 1. item      **bold**  *italic*
[link text](https://example.com)    (also http, mailto, tel, /path, #anchor)
```

It is parsed into React elements; no stored text is ever passed to `dangerouslySetInnerHTML` or
rendered as HTML. HTML typed into any field appears as text, and links with any other scheme
(`javascript:`, `data:`, protocol-relative `//host`) are shown as plain text. Text input is
normalised on the server (NFC; control, zero-width and bidirectional-override characters removed).
An e2e test stores script tags, event-handler attributes, an iframe and a `javascript:` link and
checks that nothing executes in the admin or on the website.

## Public website

| Route                                    | Content                                                 | When empty                                          |
| ---------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `/[locale]`                              | Published `home` sections, published services           | Each section keeps its labelled Stage 1 placeholder |
| `/[locale]/about`                        | Published `about` page                                  | 404; navigation links the homepage section instead  |
| `/[locale]/services`, `/services/[slug]` | Published services                                      | Empty state (`noindex`); unknown slug → not found   |
| `/[locale]/menu`                         | Published categories with published dishes              | Empty state (`noindex`), not in navigation          |
| `/[locale]/gallery`                      | Published photos                                        | Empty state (`noindex`), not in navigation          |
| `/[locale]/journal`, `/journal/[slug]`   | Published posts, newest first (50 per page for now)     | Empty state (`noindex`), not in navigation          |
| `/media/assets/<id>/<file>`              | Images used by published content ([MEDIA.md](MEDIA.md)) | 404                                                 |

Languages follow [LOCALIZATION.md](LOCALIZATION.md): the requested language, else English marked
`lang="en"` with an "Available in English only" note, else nothing. Amharic is never shown on an
English page.

### Caching

- Public reads (`src/features/cms/public-data.ts`) use **only** a session-less client with the
  publishable key: no cookies, so a cached result cannot contain drafts or anyone's data, and the
  SQL functions filter on publication status themselves.
- Each read is a `'use cache'` function tagged `cms`. Every admin change calls `updateTag('cms')`
  (server actions) or `revalidateTag('cms', { expire: 0 })` (the upload route), so edits appear on
  the next request. Otherwise entries refresh hourly; a failed read is cached for minutes and logged
  without content; with Supabase unconfigured the result is cached as "no content".
- Pages with dynamic slugs are rendered on demand and cached the same way. An unpublished or
  unknown slug gets the not-found page with `noindex`. Its status is 404, except on the first
  request for a slug that has no prerendered page: that response streams from the prerendered
  shell and keeps `200` (a "soft 404", which search engines do not index); Next.js caches the
  result, so later requests get the 404. A real 404 on the first request would need a slug check in
  the proxy, a database lookup per request that this site does not need.

### Preview

Drafts are previewed only at `/admin/preview/…`: the staff member's own session reads the draft
through RLS, nothing goes through the public cache, and the response is never cached
(`Cache-Control: no-store`) and carries `X-Robots-Tag: noindex, nofollow` (all admin responses). The preview uses the public
view components with admin image URLs. There are no shareable preview links; a reviewer needs a
staff account with `content.read`.

## Operations

### Applying the migrations

The five Stage 3 migrations (`20261027090000`…`20261027090400`) are additive: new tables, functions
and policies, plus the replaced publish trigger and new columns on `services` /
`service_translations`. The first one adds an enum value on its own, because a new value cannot be
used in the transaction that adds it.

```bash
npm run test:db                         # PGlite: every migration and the CMS suite
npx supabase db push --dry-run          # against the dev project first: expect the 5 new migrations
npx supabase db push
DEPLOYED_DATABASE_URL='<direct connection string>' npm run db:compare
```

Then follow the Storage checks in [MEDIA.md](MEDIA.md#hosted-supabase-checklist): on hosted
Supabase, policies on `storage.objects` are created through the platform's policy grants, which no
local test covers.

### Local development

Without a Supabase project the public site shows its placeholders and the admin explains that
authentication is not configured. With the local stack (`npm run supabase:start`) or a dev project,
sign in as a staff account with `content_editor` (or owner/admin) and open `/admin/pages`.

### Tests

| Suite                                                         | Covers                                                                                                                                                                                                                                            |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/integration/db/cms.test.ts`                            | Workflow and publish rules per role, Amharic review, visitor isolation (tables and functions), media and Storage policies, audit, staff reads, pages, escalation, registry ↔ schema                                                               |
| `tests/integration/db/schema.test.ts`                         | RLS everywhere; the exact functions each API role may execute; column-only reads for visitors; no `service_role` privileges on content tables                                                                                                     |
| `tests/unit/cms-*.test.ts`, `media-*.test.ts`, `http.test.ts` | Formatting parser and link safety, form parsing, error mapping, workflow rules, registry labels, public view fallback, image validation and re-encoding, the upload CSRF guard                                                                    |
| `tests/e2e/cms.spec.ts`                                       | Editor flows against the Supabase test double (real SQL, policies and Storage RLS on PGlite): publish, preview, Amharic review, conflicts, inert markup, uploads, image visibility, role denial, unsaved-changes guard, keyboard and phone layout |
| `tests/e2e/public.spec.ts`                                    | The public CMS pages without a database: empty states, not-found pages, `noindex`, navigation                                                                                                                                                     |
| `tests/postgres/postgrest.test.ts` (opt-in)                   | Over HTTP through PostgREST: visitors and the secret key against every content table and CMS function, an editor's versioned publish and the Amharic refusal, no drafts for other staff                                                           |

See [VERIFICATION.md](VERIFICATION.md#11-stage-3-cms) for what ran where, and what has not been
verified against Supabase itself.

## Limitations

- No rich-text editor, scheduling, revision history or shareable preview links.
- The journal list shows the 50 newest posts; there is no public pagination yet.
- Only two pages (`home`, `about`); adding one needs a migration (`pages_key_known`) and a
  definition in `pages.ts`.
- The Amharic review is an attestation by staff; no Amharic content has been reviewed yet.
