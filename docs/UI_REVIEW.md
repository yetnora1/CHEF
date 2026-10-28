# UI review and completion (Stage 3.5)

Date: 2026-10-26 · Baseline: `89243bd` (Stage 3) · Branch: `stage-3.5-ui-polish`

This stage audited every public and admin route as rendered, fixed what the audit found, added a
local demo mode for UI work without Supabase, and documented the visual rules that were implicit.
No Supabase project was contacted, no migration changed and no authorization rule was touched.

## How the UI was reviewed

| What                                 | How                                                                                                                                                                                                                         |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The site as visitors see it today    | Production build with Supabase unconfigured (labelled placeholders, inquiry form closed, admin fails closed)                                                                                                                |
| The site and admin with real amounts | Dev server against the Supabase test double with the demo content (`npm run dev:demo`): published pages, services, menu, gallery, journal, 15 generated images, 9 inquiries in every workflow state, one possible duplicate |
| Widths, themes, languages            | 320, 390, 768, 834, 1024, 1180 and 1440px; light and dark; `/en` and `/am`; admin in English and Amharic                                                                                                                    |
| Roles                                | Owner, content editor, event manager, analyst (signed in through the test double)                                                                                                                                           |
| Checks per page                      | Full-page screenshots inspected by eye; HTTP status; `lang`; one `h1`; console errors; horizontal overflow, with the elements causing it                                                                                    |
| Not covered                          | Real Supabase (Auth, Storage, hosted settings); real photography; Safari, Firefox and real devices (Chromium only); a screen-reader session (semantics were checked: roles, names, `aria-current`, focus, live regions)     |

## Route-by-route findings

### Public site

| Route                           | Findings                                                                                                                                                                                                                                                                              | Outcome                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Header (every page)             | No indication of the current page. With all five sections published (about, services, menu, gallery, journal) the header was 835px wide at 768px and 794px wide in Amharic, so tablets scrolled sideways (only visible with content)                                                  | **Fixed**: `NavLink` sets `aria-current` (gold underline; marker in the menu sheet); inline links from 1024px, menu button below, "Plan an event" button from 640px                                                               |
| `/[locale]` home                | Clear editorial hierarchy, no overflow at 320px, Ethiopic fonts load. The inquiry band still said "Soon you'll be able to share…", although the form has existed since Stage 2. The services grid always reserved four columns, leaving an empty slot beside three published services | **Fixed**: band copy describes the form (EN and draft AM); the grid uses 4, 3 or 2 columns to fill rows                                                                                                                           |
| `/about`                        | Not found until published (by design). Published: alternating image sections; English fallback note on `/am`                                                                                                                                                                          | No change                                                                                                                                                                                                                         |
| `/services`, `/services/[slug]` | Honest empty state with a next step; populated cards and article page work; fallback note on `/am`                                                                                                                                                                                    | No change                                                                                                                                                                                                                         |
| `/menu`                         | Dish rows ran across the full 1216px container, leaving short text on very long rules                                                                                                                                                                                                 | **Fixed**: one column at reading width (`max-w-3xl`)                                                                                                                                                                              |
| `/gallery`                      | Each item showed the photo credit first, then the occasion and caption, outside the `<figure>`                                                                                                                                                                                        | **Fixed**: one `figure`; the `figcaption` holds occasion, caption, then credit                                                                                                                                                    |
| `/journal`, `/journal/[slug]`   | Cards and article read well on phone and desktop                                                                                                                                                                                                                                      | No change                                                                                                                                                                                                                         |
| `/book`                         | Closed state: the notice card stretched to the height of the sidebar (a large empty box) and offered no way forward. The privacy link in the consent sentence opened a new tab without saying so                                                                                      | **Fixed**: the card fits its content and links to the services and the homepage; a "How inquiries work" panel explains the three steps the system follows; the link shows an icon and says "opens in a new tab" to screen readers |
| `/privacy`                      | Draft notice and review tags are clear                                                                                                                                                                                                                                                | No change                                                                                                                                                                                                                         |
| Not found (`/[locale]/…`)       | Only a link home. In development every 404 logged two errors: React warned about rendering the theme `<script>` on the client, and Next.js could not validate `instant` on the catch-all route                                                                                        | **Fixed**: adds "Plan an event"; theme script follows the Next.js "Preventing flash" pattern; catch-alls set `instant = false`                                                                                                    |
| Error boundary                  | Retry works                                                                                                                                                                                                                                                                           | No change                                                                                                                                                                                                                         |

### Admin

| Screen                                                       | Findings                                                                                                                                                                          | Outcome                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sidebar (all screens)                                        | A module was marked current only on its exact list URL, so entry pages, "New …", menu categories and inquiry detail pages showed nothing current                                  | **Fixed**: `isModuleActive`; `aria-current="page"` on the list, `"true"` below it                                                                                                                                                                                                                            |
| Overview                                                     | Developer-facing intro ("Modules appear below as they are built"); the module grid repeated the sidebar; no work queue                                                            | **Fixed**: "Needs attention" lists new inquiries, content ready for review and Amharic versions awaiting a fluent speaker's review (event managers: their in-progress inquiries). Counts use the same filters as the screens they open (checked: 4 → 4, 1 → 1, 4 → 4); a failed count is reported, not fatal |
| Page titles                                                  | Every admin `h1` used the 56px public display size, against the "compact, operational" admin language                                                                             | **Fixed**: `admin-title` (28–38px)                                                                                                                                                                                                                                                                           |
| Content lists and inquiry inbox on phones                    | Four to six full-width filter fields pushed the results about 400px down                                                                                                          | **Fixed**: filters fold behind "Filter …" with the active count; open while filters apply. The inbox filter form is now a `search` landmark like the content lists                                                                                                                                           |
| Inquiry inbox and detail                                     | Dense and clear: status tabs with counts, possible-duplicate flags, assignment, notes, history, phone layout as cards. The duplicate notice was a link that did not look like one | **Fixed**: underlined                                                                                                                                                                                                                                                                                        |
| CMS editors, media library and detail, translations, preview | Consistent, accessible and complete (publication rules, language tabs, review gate, character counts, unsaved-changes guard, image visibility)                                    | No change                                                                                                                                                                                                                                                                                                    |
| Error boundary                                               | The support reference label (`ref:`) was hard-coded English                                                                                                                       | **Fixed**: translated                                                                                                                                                                                                                                                                                        |
| Sign-in, access denied, setup required, 404                  | Clear and localized                                                                                                                                                               | No change                                                                                                                                                                                                                                                                                                    |

Authorization is unchanged: every page and action still calls `authorizeAdmin`, the new overview
counts go through the same RLS-checked functions as the screens they link to, and roles without a
permission do not see the matching item.

## Design system

[DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) now records the layout rules (breakpoints, header switch point,
text measures, vertical rhythm), image ratios, cropping and description rules, the `admin-title`
level and the new components. Tokens, themes and fonts were already complete and are unchanged;
the demo banner's colour pair was added to the contrast test.

## Demo mode

`npm run dev:demo` (see the README) runs the app against the in-memory test double with sample
content and test accounts. Every page shows a **Demo mode** banner; all text says "sample"; images
are generated abstract patterns labelled "Demo image"; customers use `example.test` addresses;
Amharic sample versions stay unreviewed drafts (confirming a review would be a false attestation).
Nothing is saved, sent or published, and real keys in `.env.local` cannot reach it.

## Remaining gaps

- **Photography.** Placeholders remain until real, licensed photographs exist. Cropping is centred
  `object-cover`; there is no focal-point control.
- **Gallery** has no enlarged view.
- **Contact and terms pages** do not exist: they need confirmed contact details and business terms.
- **Staff & roles, settings and audit log** are planned (Stage 4); they show as non-interactive
  "Planned" items.
- **Overview on phones**: the owner's module list is long (twelve cards); it duplicates the menu.
- **Testing not done**: a screen-reader session (NVDA, VoiceOver), Safari, Firefox and real devices.
- **Security items unchanged** (VERIFICATION.md §6–7): no CAPTCHA on admin sign-in, no MFA for
  owners and admins, no nonce-based CSP.

## Content the owner must supply

| Needed                                                                                                                                                                                              | Where it appears                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Any official Ethiopic spelling of the brand (the Latin name "CHEF SIS" is confirmed)                                                                                                                | Wordmark, titles, every page            |
| The chef's own biography, training and philosophy                                                                                                                                                   | Homepage "The chef" section, About page |
| Photographs: hero and portrait (4:5), one per service (4:3), gallery (4:3), dishes (1:1), journal covers (16:9); at least 1600px on the long edge, subject near the centre, with credit and licence | Throughout                              |
| Final service descriptions; confirmation of the "culinary experiences" offering                                                                                                                     | Homepage services, `/services`          |
| The menu: categories, dishes, dietary information                                                                                                                                                   | `/menu`                                 |
| Contact details (email, phone, location, social)                                                                                                                                                    | Footer, a future contact page           |
| Legal review of the privacy notice; business terms                                                                                                                                                  | `/privacy`, a future terms page         |
| Native-speaker review of all Amharic (interface and content)                                                                                                                                        | Everywhere (`docs/LOCALIZATION.md`)     |

## Still mocked or waiting for Supabase

| Area                                               | State                                                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Sign-in, roles, inbox, CMS, uploads in the browser | Exercised only against the test double (simulated Auth, real SQL on PGlite, in-memory Storage) |
| Public content                                     | Placeholders without a database; CMS content only in demo mode and tests                       |
| Inquiry form                                       | Closed in production builds until Supabase, Turnstile and the site URL are configured          |
| Email, Turnstile production widget, Storage API    | Not tested (see VERIFICATION.md)                                                               |

## Verification

| Command                | Result                                                                                                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check` | pass                                                                                                                                                                             |
| `npm run verify`       | pass: lint, typecheck, **446/446** Vitest (8 new: current-module and current-page rules, demo-banner contrast in both themes), client-bundle secret scan                         |
| `npm run test:e2e`     | **68/68** (3 new tests; new assertions in 5 existing ones: current page, tablet header, closed inquiry form, inquiry band copy, overview per role, sidebar state, phone filters) |
| Production build       | built by `test:e2e` and by the bundle check, both successful                                                                                                                     |

The visual review above (screenshots, overflow and console checks) was run with throwaway
Playwright scripts against the production build and the demo; the regressions it found are now
covered by the e2e tests listed. Nothing here ran against a real Supabase project.
