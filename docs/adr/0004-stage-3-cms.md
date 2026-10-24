# ADR 0004 — Stage 3: content management and media

- **Status:** accepted
- **Date:** 2026-10-24
- Details: [CMS.md](../CMS.md), [MEDIA.md](../MEDIA.md)

## 1. The database enforces the editorial workflow

**Context.** Content is edited through server actions, but anything the actions check could be
bypassed by a bug or by a staff session calling the Data API directly.
**Decision.** Publication rules live in triggers and RLS: `content.publish` is required to enter,
leave or edit `published`/`archived` rows (one trigger function for every content table); a
`version` column bumped by trigger gives optimistic concurrency; audit entries are written by a
SECURITY DEFINER trigger with field names only. The actions repeat the checks only to explain
problems before saving. Stage 2's publish trigger is replaced (`create or replace`) to cover the new
`in_review` state; booking policies are untouched.
**Consequences.** A role with `content.write` but without `content.publish` (none exists today; the
test removes the permission in an isolated database) can draft and submit for review but never
change what visitors see.

## 2. Amharic needs a recorded review confirmation to be published

**Context.** All Amharic in the repository is an unreviewed draft, and unreviewed Amharic must
never be presented to visitors as if it had been reviewed.
**Decision.** A trigger refuses `published` for an Amharic translation without
`language_reviewed_at`, stamps the time and confirming account itself, and clears both when the text
changes. The admin's checkbox is the only way to set it.
**Consequences.** Publishing Amharic is an explicit attestation by a named staff member. The system
cannot verify language quality; the attestation is auditable.

## 3. One private bucket; public visibility derived from published usage

**Options.** (a) Two buckets (`public-media`, `private-media`, as sketched in Stage 1) with files
copied on publish and removed on unpublish; (b) one private bucket whose read policy asks the
database whether published content uses the file.
**Decision.** (b). `chief_media: public read …` calls `private.media_object_is_public(name)`, the
same function that decides whether visitors see alt text and credits.
**Why.** No copy step can fail half-way or leave a public copy behind; unpublishing takes effect
for new requests immediately; there is one source of truth. **Cost:** every public image request
evaluates the rule (indexed lookups), and caches may serve a copy for up to five minutes after
unpublishing (documented; replacement gives a new name).

## 4. Uploads: server-reserved names, validated and re-encoded on the server

**Decision.** A Route Handler (server actions are capped at 64 KB) checks origin, size and
`media.write`, decodes and re-encodes the image with `sharp` (dropping metadata), then reserves a
random object name on the asset row, uploads with the staff member's session (Storage accepts only
reserved names and never overwrites), and finishes the row only if the object exists.
**Consequences.** The secret key is not used for Storage. A failed step leaves only private leftovers,
listed for cleanup. `sharp` becomes a direct dependency (it was already an optional dependency of
Next.js).

## 5. Formatted text is a small parsed subset, never HTML

**Options.** A rich-text editor storing HTML (needs a sanitizer on every render path), Markdown with
a full renderer, or a minimal subset rendered as React elements.
**Decision.** The subset (headings, lists, bold, italic, links with allow-listed schemes), parsed in
`markup.tsx`. No `dangerouslySetInnerHTML` anywhere in content rendering.
**Consequences.** Stored XSS is excluded by construction rather than by sanitizer configuration;
editors get fewer formatting options.

## 6. Public reads: anonymous client, one cache tag, preview only in the admin

**Decision.** Public pages read through SQL functions with a session-less publishable-key client
inside `'use cache'`, all tagged `cms` and invalidated by every admin change; drafts are previewed
only at `/admin/preview/…` with the staff session, never cached (`no-store`) and `noindex`.
**Consequences.** A cached page cannot contain drafts or personal data. One tag means any change
refreshes all content pages, which is cheap at this site's size. There are no shareable preview links
(no token scheme to secure); reviewers need a staff account.

## 7. `service_role` loses access to content tables

**Decision.** Stage 3 revokes every privilege of `service_role` on the new content and media tables
and on `services` / `service_translations` (VERIFICATION.md F5, condition C3). `profiles` is
unchanged in this stage.
**Consequences.** The server secret key still executes only the four inquiry functions; a leaked key
cannot alter website content through the Data API.
