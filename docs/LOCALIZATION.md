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
2. **Business content** (services, pages, menu, journal, biography): managed by staff, stored per
   locale in the database (`*_translations` tables) from Stage 3. Until then the homepage reads
   placeholders from `src/features/content/home-content.ts`.

Interface text never lives in content tables, and business claims never live in message files.

## Fallback policy

| Text type                  | Policy                                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Interface messages         | No fallback needed: a unit test requires `am.json` to have exactly the same keys, placeholders and rich-text tags as `en.json`, and every Amharic string to contain Ethiopic script |
| Business content           | Requested locale → English → nothing. English shown on an Amharic page is rendered with `lang="en"` (`resolveLocalized()` in `src/lib/localization/translations.ts`)                |
| English page, Amharic only | Not shown. Amharic is never presented as English, and English must exist before publication                                                                                         |

Content is never machine-translated or relabelled automatically.

## Fonts and Ethiopic typography

| Use                | Latin    | Ethiopic            |
| ------------------ | -------- | ------------------- |
| Display / headings | Fraunces | Noto Serif Ethiopic |
| Interface / body   | Manrope  | Noto Sans Ethiopic  |

- All four families are SIL Open Font License 1.1, self-hosted by `next/font` (downloaded at build
  time; visitors never contact Google). Builds need network access to fetch them.
- Stacks list the Latin face first; the browser falls through to the Ethiopic face per glyph, so
  mixed text such as "Chief Harena ለሠርግ…" renders correctly.
- Only the `ethiopic` subset is requested (Ethiopic U+1200–137F, Supplement U+1380–139F and the
  Extended blocks).
- Ethiopic-specific typography via `:lang(am)`: body line-height 1.85; headings with looser
  line-height (1.3–1.45), no negative tracking, slightly smaller display sizes; no uppercase or
  wide-tracked eyebrows (Ethiopic has no case); eyebrows, the language switchers and the
  wordmark tagline are enlarged to 12.5–14px for Ethiopic. Footer fine print and the preview bar
  remain 12px in both scripts; revisit with the native-speaker review.

**Verification performed:** a unit test checks that every character in `am.json` falls within the
Ethiopic blocks or basic Latin/punctuation covered by the fonts; an e2e test asserts that both Noto
Ethiopic faces actually load and are used on `/am`; full-page screenshots in light/dark, desktop
and mobile were reviewed during Stage 1.

**Dates:** dates are stored and entered in the Gregorian calendar (the inquiry form uses the
browser's native date picker), and shown with `Intl` in Addis Ababa time. Offering
Ethiopian-calendar display (`am-ET-u-ca-ethiopic`) or entry is an open product decision; the data
model needs no change for it.

## Translation review required before launch

All Amharic in this repository was drafted without a native-speaker review. It is labelled as
draft and must be reviewed before launch:

| Location                                                | What                                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `src/messages/am.json`                                  | All interface strings, incl. Stage 2: inquiry form, errors, statuses, admin inbox |
| `src/features/content/home-content.ts` (`am` fields)    | Homepage placeholder copy                                                         |
| `src/features/content/privacy-content.ts` (`am`)        | Privacy notice: needs native-speaker **and legal** review; the page says so       |
| `src/features/bookings/server/email.ts` (`ACK_COPY.am`) | Customer acknowledgement email                                                    |
| `supabase/seed.sql`                                     | Amharic service rows (seeded as `draft`, so they are never public)                |

Staff alert emails are English-only for now (the business has not chosen a staff language).

Open questions for the reviewer:

- The brand name is kept in Latin script ("Chief Harena") inside Amharic text. Confirm whether an
  official Ethiopic spelling should be used.
- Register: the drafts use the polite/formal imperative (ይግቡ, ያቅዱ). Confirm the preferred tone.
- Prefix forms attached to Latin text (e.g. "የChief Harena", "ከ Chief Harena ጋር").
- The prompt refers to both "Chef Harena" and "Chief Harena"; Stage 1 uses **Chief Harena**
  everywhere. Confirm the brand spelling.
