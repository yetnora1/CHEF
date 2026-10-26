# Database

Supabase Postgres. The schema changes **only** through SQL migrations in `supabase/migrations/`.
Security rules are described in [SECURITY_MODEL.md](SECURITY_MODEL.md).

## Stage 1 schema

```
auth.users (Supabase Auth)
   │ 1:1 (trigger creates on sign-up)        │ 1:n
   ▼                                          ▼
profiles                                   user_roles ──n:1── role_permissions (role → permission)
 display_name, preferred_locale              (user_id, role) PK, granted_by
                                             written only via assign_role / revoke_role

audit_logs  append-only: actor_id, action, target_type, target_id, details jsonb

services ──1:n── service_translations        bookings (private)
 slug (unique, ASCII), status,                 reference (CH-XXXXXXXXXX), status, event_type,
 sort_order, published_at, updated_by          event_date, guest_count, venue, contact_*,
                    (service_id, locale) PK,   preferred_locale, message, consent_given_at,
                    status, title, summary,    assigned_to → auth.users, archived_at
                    body, seo_*, updated_by
```

| Migration                                             | Contents                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261024100000_identity_roles_permissions.sql`       | `private` schema, `locale_code` domain (`en`, `am`), `app_role` / `app_permission` enums, `profiles`, `user_roles`, `role_permissions` (+ matrix data), `audit_logs` (+ append-only trigger), `has_permission`, `get_my_access`, `assign_role`, `revoke_role`, `bootstrap_first_owner`, new-user trigger, RLS                                                                                                          |
| `20261024100100_localized_services.sql`               | `publication_status` enum, `services`, `service_translations`, publish-permission / `published_at` / actor-stamp triggers, RLS                                                                                                                                                                                                                                                                                         |
| `20261024100200_private_bookings.sql`                 | `booking_status`, `event_type` enums, `bookings`, assignment trigger, RLS                                                                                                                                                                                                                                                                                                                                              |
| `20261025090000_booking_status_contacted.sql`         | Adds the `contacted` lifecycle step (own migration: a new enum value cannot be used in the transaction that adds it)                                                                                                                                                                                                                                                                                                   |
| `20261025090100_inquiry_workflow.sql`                 | Inquiry columns, `booking_status_history`, `booking_notes`, `private.rate_limits`, `private.notification_outbox`, transition trigger, `submit_inquiry`, `consume_rate_limit`, outbox functions, admin functions (`list_bookings`, `get_booking_detail`, `booking_inbox_counts`, `booking_report`, `list_assignable_staff`, `change_booking_status`, `assign_booking`, `add_booking_note`), `service_role` restrictions |
| `20261026090000_service_role_function_privileges.sql` | Revokes `service_role` EXECUTE on `get_my_access`, `assign_role`, `revoke_role` (left by Supabase's default privileges), so the secret key executes only the four inquiry functions                                                                                                                                                                                                                                    |
| `20261027090000_content_review_status.sql`            | Adds `in_review` to `publication_status` (own migration, like `contacted`)                                                                                                                                                                                                                                                                                                                                             |
| `20261027090100_cms_workflow_and_media.sql`           | Replaces the publish trigger (`in_review`; edits of live/archived rows need `content.publish`); `bump_version`, Amharic review and content-audit triggers; `media_assets`, `media_asset_translations` (+ upload lifecycle trigger); `services.image_id` and `version` columns; review columns on `service_translations`; revokes `service_role` on services                                                            |
| `20261027090200_cms_content_types.sql`                | `dietary_tag` enum; `menu_categories`, `menu_items`, `gallery_items`, `journal_posts`, `pages` (seeded `home`, `about`), their translation tables, `page_images`; triggers, RLS, column grants for visitors                                                                                                                                                                                                            |
| `20261027090300_cms_reads.sql`                        | Visibility helpers (`private.media_*`), staff reads (`cms_entries` view, `cms_list`, `cms_get`, `media_list`, `media_get`, `media_cleanup_candidates`), public reads (`public_page`, `public_services`, `public_service`, `public_menu`, `public_gallery`, `public_journal`, `public_journal_post`, `public_navigation`), EXECUTE grants                                                                               |
| `20261027090400_cms_media_storage.sql`                | Private Storage bucket `media` (10 MB, JPEG/PNG/WebP) and four `storage.objects` policies ([MEDIA.md](MEDIA.md))                                                                                                                                                                                                                                                                                                       |

## Stage 2 additions

```
bookings ──1:n── booking_status_history   from/to status, changed_by (no FK), note; written by trigger
    │      ──1:n── booking_notes          internal, immutable; author_id (no FK)
    │      ──1:n── private.notification_outbox   once per (booking, kind); pending/sending/sent/failed
    └── new columns: preferred_contact_method, service_requirements, source (website|staff),
        submission_key (unique, idempotency), submission_fingerprint, possible_duplicate_of
private.rate_limits   (bucket, window_start) → hits; hashed identifiers; expires within a day
```

- History, notes and outbox rows are deleted with their inquiry (privacy erasure); API roles cannot
  update or delete them otherwise. The audit log keeps only references and statuses, never personal
  data, and survives erasure.
- `service_role` (the secret key) has **no** table privileges on any booking table; it can only
  execute `submit_inquiry`, `consume_rate_limit`, `claim_notifications` and `complete_notification`.
- Status and assignment cannot be updated directly by any API role; see [INQUIRIES.md](INQUIRIES.md).

## Stage 3 additions (content management)

```
pages (key: home|about) ──1:n── page_translations (sections jsonb)     page_images (key, slot) → media_assets
services ──1:n── service_translations                                  services.image_id → media_assets
menu_categories ──1:n── menu_category_translations
   └──1:n── menu_items (dietary_tags[], image_id) ──1:n── menu_item_translations
gallery_items (asset_id, event_type) ──1:n── gallery_item_translations (caption)
journal_posts (cover_image_id, published_at) ──1:n── journal_post_translations
media_assets (storage_path, pending_path, status pending|ready, type, size, dimensions, title, credit)
   └──1:n── media_asset_translations (alt_text)              storage.objects (bucket "media")
```

- Every content row has `status`, `version` (bumped by trigger; saves match on it), `created_at`,
  `updated_at` and `updated_by` (stamped). Translation rows add `language_reviewed_at` /
  `language_reviewed_by`, set only by the review trigger (Amharic) and always null for English.
- References to media are `ON DELETE RESTRICT`: an image in use cannot be deleted. Content rows
  cascade to their translations.
- Staff read through `cms_list`, `cms_get`, `media_list` and `media_get` (SECURITY INVOKER, so RLS
  applies); `media_cleanup_candidates` is SECURITY DEFINER and checks `media.write` itself. Visitors
  read only through the `public_*` functions (also INVOKER) and column-level grants; the four
  `private.media_*` visibility helpers are DEFINER so that policies can ask them. Details:
  [CMS.md](CMS.md), [MEDIA.md](MEDIA.md).
- `service_role` has no privileges on any content or media table (also revoked on `services` and
  `service_translations`, finding F5).

Conventions used by every table:

- `uuid` primary keys (`gen_random_uuid()`), or natural composite keys for join/translation tables.
- `created_at` / `updated_at timestamptz` maintained by `private.set_updated_at()` (or the content
  stamp trigger, which also records `updated_by` from `auth.uid()`; clients cannot set it).
- Explicit, named check constraints for lengths, formats and ranges; foreign keys with deliberate
  `on delete` behaviour (`cascade` for owned rows, `set null` for actor references).
- Indexes for the access paths policies and listings use (`status, sort_order`; `assigned_to`;
  `locale, status`; `occurred_at`).
- **Archival over deletion**: published content must be unpublished before it can be deleted;
  bookings carry `archived_at`, and hard deletion is reserved for privacy erasure (owner only).
- RLS enabled on every table; a test fails if any `public` table lacks it.
- Public (`anon`) reads use **column-level grants** that exclude audit columns. Public queries
  must name their columns (`select=id,slug,…`); `select=*` is denied for visitors by design.

### Bilingual content pattern

A language-neutral entity row (slug, publication status, ordering) plus one translation row per
locale with its **own** publication status. An Amharic translation can be drafted while the English
one is live; public reads return only published translations of published entities. The app then
applies the fallback policy in [LOCALIZATION.md](LOCALIZATION.md). Slugs are shared across locales
(`/en/services/weddings`, `/am/services/weddings`).

### Remaining entities (later stages)

| Entity          | Shape                                                                                                                                             | Stage |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `site_settings` | single typed row of **non-secret** public settings (contact, social links, inquiry toggle) + translations for localized fields; `settings.manage` | 4     |

Stage 1 sketched two Storage buckets (`public-media`, `private-media`). Stage 3 uses one private
bucket whose public read policy is derived from published usage instead ([ADR 0004](adr/0004-stage-3-cms.md) §3).

## Migration workflow

```bash
npm run db:new add_site_settings          # creates supabase/migrations/<timestamp>_add_site_settings.sql
# edit the SQL: create objects → revoke defaults from anon/authenticated → minimal grants → enable RLS → policies
npm run test:db                              # applies all migrations to in-process Postgres and runs RLS tests
npm run db:reset                             # (Docker) rebuild the local database from migrations + seed
npm run db:lint                              # (Docker) Supabase schema linter
npm run db:types                             # (Docker) regenerate src/types/database.types.ts
```

Rules:

- Never edit a migration that has been applied to a shared or production database; add a new one.
- Every new private function must `revoke execute … from public, anon, authenticated` explicitly
  (Postgres grants EXECUTE to PUBLIC by default; per-schema default privileges cannot revoke it).
  `tests/integration/db/schema.test.ts` lists the only functions API roles may execute.
- Every new SECURITY DEFINER function sets `search_path = ''` and uses fully qualified names
  (enforced by a test).
- Changing permissions = a migration that edits `role_permissions` **and** an edit to
  `src/lib/permissions/matrix.ts` (the test compares them).
- Deploy to a hosted project with `npx supabase link --project-ref <ref>` then
  `npx supabase db push`. The seed is never pushed to production.

## Local Supabase workflow (Docker)

| Task                                                      | Command                         |
| --------------------------------------------------------- | ------------------------------- |
| Start (applies migrations and seed on first start)        | `npm run supabase:start`        |
| Show URLs and keys                                        | `npm run supabase:status`       |
| Stop (keeps data)                                         | `npm run supabase:stop`         |
| Stop and discard local data                               | `npx supabase stop --no-backup` |
| Reset to migrations + seed (**destroys local data only**) | `npm run db:reset`              |
| Studio                                                    | <http://127.0.0.1:54323>        |
| Local email inbox (auth emails)                           | <http://127.0.0.1:54324>        |

`db reset` affects only the local Docker database. It never touches a linked hosted project.
The seed contains placeholder services only: no users, customers or bookings.

## Testing

`npm run test:db` boots **PGlite** (Postgres 18 compiled to WebAssembly, in-process) for each
suite, applies `tests/integration/db/supabase-shim.sql` (API roles, `auth.uid()`/`auth.role()`/
`auth.jwt()`, a reduced `auth.users`, and Supabase's default privileges), then every migration and
the seed. Each query runs exactly as PostgREST would: inside a transaction, `SET LOCAL ROLE
anon|authenticated`, with `request.jwt.claims` set.

Limits: the shim is not the full Supabase platform (no GoTrue, PostgREST, Storage API or Realtime;
`storage.buckets` and `storage.objects` are reduced copies that the Storage policies run against),
and production runs Postgres 17. The migrations use only SQL valid on both versions. When Docker is
available, also run the migrations on the real stack (`npm run supabase:start` / `npm run db:reset`)
and `npm run db:lint`.

### On a real PostgreSQL server

`npm run test:db:pg` runs the same suites on a real server, plus `tests/postgres/` (multi-connection
concurrency, which PGlite cannot do, and an opt-in Data API suite over HTTP through PostgREST).
`TEST_POSTGRES_URL` must be a superuser URL of a **disposable local** PostgreSQL 15+ server (17
matches Supabase); remote hosts are refused unless `TEST_POSTGRES_ALLOW_REMOTE=true`. Each suite gets
its own `chef_test_*` database, dropped afterwards, and the migrations run as the non-superuser
`chef_test_owner` (Supabase's `postgres` role is not a superuser either). The HTTP suite runs only
when `TEST_POSTGREST_URL`, `TEST_POSTGREST_JWT_SECRET` and `TEST_POSTGREST_DB_URL` are set; see
[VERIFICATION.md](VERIFICATION.md#8-what-the-owner-must-do).

To check a deployed database against the migrations (read-only):
`DEPLOYED_DATABASE_URL=<connection string> npm run db:compare`. It compares RLS, policies, privileges
of the API roles, function security and EXECUTE rights, triggers, enums, the permission matrix and
the CLI migration history. Do this after every `db push` to a hosted project.
