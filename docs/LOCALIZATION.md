# Localization (English · Amharic)

## Locale strategy

| Concern                 | Decision                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Supported locales       | `en` (default), `am`: `src/i18n/routing.ts` and the DB domain `public.locale_code`                                |
| Public URLs             | Always prefixed: `/en/...`, `/am/...` (`localePrefix: "always"`)                                                  |
| Locale detection on `/` | `NEXT_LOCALE` cookie (an explicit choice), then `Accept-Language`, then `en`                                      |
| Remembering the choice  | Visiting a locale URL sets `NEXT_LOCALE` (1 year, `SameSite=Lax`)                                                 |
| Admin language          | Admin URLs have no locale; the admin reads the same cookie and its switcher sets it via a validated server action |
| HTML language           | `<html lang>` matches the page; fallback content carries its own `lang` attribute                                 |
| Metadata                | Localized `<title>`/description; `hreflang` alternates for `en`, `am`, `x-default`                                |
| Library                 | next-intl 4 with `next/root-params` (no `setRequestLocale` needed; works with Cache Components)                   |

Adding a language means adding it to `routing.locales`, the `locale_code` domain (migration), a
messages file, and font coverage if the script differs.

## Two kinds of text

1. **Interface messages** (`src/messages/en.json`, `am.json`): labels, navigation, form errors,
   accessibility text, empty states. Static and versioned with the code. Client Components receive
   only the namespaces they use.
2. **Business content** (pages, services, menu, gallery, journal, image descriptions): managed by
   staff in the CMS and stored per locale in the database (`*_translations` tables;
   [CMS.md](CMS.md)). Homepage sections without published content keep the labelled placeholders
   from `src/features/content/home-content.ts`.

Interface text never lives in content tables, and business claims never live in message files.

## Fallback policy

| Text type                  | Policy                                                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interface messages         | No fallback needed: a unit test requires `am.json` to have exactly the same keys, placeholders and rich-text tags as `en.json`, and every Amharic string to contain Ethiopic script                                                                  |
| Business content           | Requested locale → English → nothing. English shown on an Amharic page is rendered with `lang="en"` (article pages add an "Available in English only" note; `resolveLocalized()` / `resolveTranslation()` in `src/lib/localization/translations.ts`) |
| English page, Amharic only | Not shown. Amharic is never presented as English                                                                                                                                                                                                     |
| Image descriptions         | Amharic alt text only once its review is confirmed; otherwise English, marked `lang="en"`                                                                                                                                                            |

Content is never machine-translated or relabelled automatically.

## Amharic review before publication

Each language version of CMS content is written, reviewed and published separately. An Amharic
version can be published only after a staff member ticks "Reviewed by a fluent Amharic speaker"
for that exact text; the database records who confirmed it and when, clears the confirmation when
the text changes, and refuses publication without it. The same applies to Amharic alt text, which
visitors see only once confirmed. This is an attestation by staff: nothing checks the language
itself. See [CMS.md](CMS.md#amharic-review-gate). The Amharic location in Admin → Settings follows
the same rule: visitors see it only once its review is confirmed, and the English location is shown
(marked `lang="en"`) until then.

The admin marks content with its own language (`lang="en"` / `lang="am"` on titles, fields and
previews), while its interface labels follow the admin's interface language.

## Fonts and Ethiopic typography

| Use                | Latin                                          | Ethiopic                 |
| ------------------ | ---------------------------------------------- | ------------------------ |
| Display / headings | System font, bold                              | Noto Sans Ethiopic, bold |
| Interface / body   | System font (Segoe UI, San Francisco, Roboto…) | Noto Sans Ethiopic       |

- Latin text uses the device's own UI font, so nothing is downloaded for it. Noto Sans Ethiopic
  (SIL Open Font License 1.1) is self-hosted by `next/font` (downloaded at build time; visitors
  never contact Google), because system Ethiopic coverage varies by device. Builds need network
  access to fetch it. Stage 3.6 dropped the serif display faces (Fraunces, Noto Serif Ethiopic)
  and then the Manrope web font, at the owner's request for a "normal" font.
- Stacks list the Latin system fonts first; the browser falls through to the Ethiopic face per
  glyph, so mixed text such as "CHEF SIS ለሠርግ…" renders correctly.
- Only the `ethiopic` subset is requested (Ethiopic U+1200–137F, Supplement U+1380–139F and the
  Extended blocks).
- Ethiopic-specific typography via `:lang(am)`: body line-height 1.85; headings with looser
  line-height (1.35–1.5), no negative tracking, slightly smaller display sizes; eyebrows (sentence
  case in both scripts) are enlarged to 15px for Ethiopic; the language toggle shows flags, not text. Footer
  fine print remains 11–12px in both scripts; revisit with the
  native-speaker review.

**Verification performed:** the message test parses every message with the ICU grammar next-intl
uses and requires the same arguments (including those inside plural branches) and rich-text tags in
both languages; a unit test checks that every character in `am.json` falls within the
Ethiopic blocks or basic Latin/punctuation covered by the fonts; an e2e test asserts that Noto Sans
Ethiopic actually loads and is used on `/am` (and that the retired serif face does not); full-page
screenshots in light/dark, desktop and mobile were reviewed in Stage 1 and again in Stage 3.6.

**Dates:** dates are stored and entered in the Gregorian calendar (the inquiry form uses the
browser's native date picker), and shown with `Intl` in Addis Ababa time. Offering
Ethiopian-calendar display (`am-ET-u-ca-ethiopic`) or entry is an open product decision; the data
model needs no change for it.

## Translation review required before launch

All Amharic in this repository was drafted without a native-speaker review. It is labelled as
draft and must be reviewed before launch:

| Location                                                | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/messages/am.json`                                  | All interface strings, incl. Stage 2 (inquiry form, errors, statuses, admin inbox), Stage 3 (CMS admin, publication statuses, dietary tags, public content pages and empty states), Stage 3.5 (inquiry steps, admin "needs attention" counts with plurals, filter toggle, demo-mode banner, error reference) Stage 3.6 (`Common.samplePhoto`, `Theme.dark`, `Navigation.contact`, `Contact.*`) and Stage 3.7 (`ContactForm.*`, `AdminMessages.*`, `Admin.modules.messages`, `Admin.moduleDescriptions.messages`, `Admin.overview.attentionNewMessages`, `Admin.overview.attentionTopics.messages`) |
| `src/features/content/home-content.ts` (`am` fields)    | Homepage placeholder copy (the inquiry band was rewritten in Stage 3.5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `src/features/content/privacy-content.ts` (`am`)        | Privacy notice: needs native-speaker **and legal** review; the page says so                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/features/bookings/server/email.ts` (`ACK_COPY.am`) | Customer acknowledgement email                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `supabase/seed.sql`                                     | Amharic service rows (seeded as `draft`, so they are never public)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Staff alert emails are English-only for now (the business has not chosen a staff language).

Open questions for the reviewer:

- The brand name is kept in Latin script ("CHEF SIS") inside Amharic text. Confirm whether an
  official Ethiopic spelling should be used.
- Register: the drafts use the polite/formal imperative (ይግቡ, ያቅዱ). Confirm the preferred tone.
- Prefix forms attached to Latin text (e.g. "የCHEF SIS", "ከ CHEF SIS ጋር").
- Brand name: **CHEF SIS**, in capitals (owner's choice, 2026-10-28), replacing "Chef Harena"
  everywhere visible. Internal identifiers (storage keys such as `chef-harena:theme`, the package
  name, the Supabase project id and the applied migrations) keep the old name.
