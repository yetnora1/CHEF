# Design system

All tokens live in `src/app/globals.css`. Components use **semantic** utilities
(`bg-background`, `text-muted-foreground`, `border-border`…), never raw colours, so the palette and
themes change in one place.

## Colour

**Neutral black and white text and actions on frosted glass** (owner's choices, 2026-10-27 and
2026-10-28): cards, bars and the admin sidebar are translucent panels over a soft violet and blue
page backdrop (see [Glass](#glass)). No green, ivory or gold tint in the interface:

|                 | Light                                     | Dark                                         |
| --------------- | ----------------------------------------- | -------------------------------------------- |
| Background      | `#FFFFFF`                                 | `#0A0A0A`                                    |
| Backdrop        | violet `#EBE5FF` glow, blue `#DBE7FF` arc | violet `#1E0C44` glow, blue `#0C1A40` arc    |
| Glass           | white at 55% (cards), 85% (bars, menus)   | white at 5% (cards), `#101016` at 85% (bars) |
| Text            | `#0A0A0A`; secondary `#525252`            | `#F5F5F5`; secondary `#A3A3A3`               |
| Primary buttons | black, white text                         | white, black text                            |
| Kept hues       | feedback colours, terracotta status dot   | feedback colours, terracotta status dot      |

The original brand palette stays defined in `@theme` (`globals.css`), but the interface and the
logo no longer use forest, gold or ivory:

| Token                                           | Hex       | Used in                           |
| ----------------------------------------------- | --------- | --------------------------------- |
| Highland Forest `--color-highland-forest`       | `#173D32` | (unused, kept for reference)      |
| Ceremonial Gold `--color-ceremonial-gold`       | `#D3A45B` | (unused, kept for reference)      |
| Berbere Terracotta `--color-berbere-terracotta` | `#9D4135` | Status accents (light)            |
| Injera Ivory `--color-injera-ivory`             | `#F5F0E6` | (unused, kept for reference)      |
| Coffee Charcoal `--color-coffee-charcoal`       | `#171D1A` | Text on the band button, overlays |

## Semantic tokens and themes

Each token is declared once as `light-dark(<light>, <dark>)`; `color-scheme` on `<html>` selects
the half:

| Theme state              | How it is set                                                                                       | Result                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| First visit              | no `data-theme`                                                                                     | light, whatever the device prefers (also without JavaScript)            |
| Switched with the button | `localStorage["chef-harena:theme"]`; inline script in `<head>` sets `data-theme` before first paint | no flash, persists across reloads and both locales; `dark` selects dark |

There is no "match device" mode: the owner chose a plain light/dark switch (Stage 3.6).

Tokens: `background`, `foreground`, `surface`, `surface-foreground`, `surface-muted`,
`muted-foreground`, `border`, `border-strong`, `primary`, `primary-hover`, `primary-foreground`,
`accent`, `accent-ink` (small labels, such as section eyebrows), `terracotta`, `ring`, `band`,
`band-foreground`, `band-muted`, `band-accent`, `success`, `warning`, `danger`, and for glass
`backdrop-violet`, `backdrop-blue`, `glass`, `glass-thick`, `glass-raised`, `glass-raised-hover`,
`glass-shine`, `glass-shadow`, `field`.

Translucent tokens carry their alpha in the colour (`#rrggbbaa`): the glass tokens, `field`, and
also `border` and `surface-muted`, so hairlines and wells look the same on glass and on the page.

`tests/unit/design-tokens.test.ts` parses this file and enforces WCAG 2.2 contrast in **both**
themes: 4.5:1 for text pairs, 3:1 for focus rings and input borders. For glass it composites each
translucent layer over the page background and over each backdrop colour at full strength (and
`glass-thick` over black and white, for photos scrolling under a bar) before measuring.

Tailwind's `dark:` variant is redefined to match this model (`data-theme="dark"` only), but
semantic tokens make it rarely necessary.

## Typography

Latin text uses the visitor's own system font (Segoe UI on Windows, San Francisco on Apple devices,
Roboto on Android), so the site reads like any everyday app; Amharic uses Noto Sans Ethiopic.
Headings are the same font in bold, with normal letter-spacing, not a separate display face.

| Utility       | Use                              | Notes                                                                      |
| ------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `display-xl`  | Hero headline                    | Bold, fluid 36→56px, leading 1.15; Amharic 30→48px, leading 1.35           |
| `display-lg`  | Section headings                 | Bold, fluid 28→36px                                                        |
| `display-md`  | Card and panel titles            | Semibold, 18→22px                                                          |
| `eyebrow`     | Section labels                   | Sentence case, 14px semibold (15px for Ethiopic); no uppercase or tracking |
| body          | System font / Noto Sans Ethiopic | line-height 1.65 (Latin), 1.85 (Amharic)                                   |
| `admin-title` | Admin page titles                | Bold at an operational size, 24→32px; Amharic 22→28px, leading 1.4         |

The public site uses `display-xl`/`display-lg` for page titles; the admin uses `admin-title` for
every page `h1` and `display-md` for section headings, so operational screens stay compact.

## Layout and breakpoints

| Breakpoint | Width   | What changes                                                                               |
| ---------- | ------- | ------------------------------------------------------------------------------------------ |
| base       | 320px + | One column; header: wordmark, theme, menu button                                           |
| `xs`       | 26rem   | Custom, for small two-up arrangements                                                      |
| `sm`       | 40rem   | Header language switcher and "Plan an event" button appear; admin filters always shown     |
| `md`       | 48rem   | Two-column editorial sections (about, services intro)                                      |
| `lg`       | 64rem   | **Inline public navigation** (below it, the menu sheet); admin sidebar; multi-column grids |

- `page-container`: up to 80rem with 1 / 1.5 / 2rem gutters. Text measures: `max-w-3xl` for
  articles, the About page, the privacy notice and the menu; `max-w-xl`/`max-w-2xl` for ledes.
- Vertical rhythm: homepage sections `py-14 md:py-20`, the inquiry band a slim `py-8 md:py-10` row, the footer two compact rows (links; copyright); content pages `py-14 md:py-20`; admin pages
  `py-8 lg:py-12` inside the shell.
- The public header shows its links inline only from `lg`: with every section published (about,
  services, menu, gallery, journal) five links do not fit beside the actions on a tablet. An e2e
  test checks 768/1000px (menu button, no overflow) and 1280px (inline links).
- Grids fill whole rows for the usual counts (the homepage services grid uses 4, 3 or 2 columns
  depending on how many services are published).

## Images: ratios, cropping and descriptions

| Slot                                       | Ratio         | Notes                                                |
| ------------------------------------------ | ------------- | ---------------------------------------------------- |
| Homepage hero                              | 4:5           | `preload`; same 16px corners as every photo          |
| Homepage and About portrait / story images | 4:5           | About sections alternate image sides                 |
| Service, journal and list cards; gallery   | 4:3           | Gallery captions and credits sit in the `figcaption` |
| Service and journal article image          | 16:9          | Wider than the text column (`max-w-4xl`)             |
| Menu dish thumbnail                        | 1:1 (80–96px) | Optional                                             |

- Every image fills its frame with `object-cover`, centred. There is no focal-point control yet,
  so supply photographs with the subject near the centre and at least 1600px on the long edge
  (uploads are resized to ≤ 2560px, see [MEDIA.md](MEDIA.md)).
- `sizes` is set per slot so the optimiser serves the right width; only above-the-fold images
  preload.
- Descriptions (alt text) say what the photograph shows and why it is there ("a wedding table set
  with injera and stews"), not "image of". They are written per language in the media library;
  Amharic descriptions reach visitors only after a fluent speaker's review, otherwise the English
  one is used and marked `lang="en"`. Decorative motifs are `aria-hidden`; placeholders expose one
  label ("Photography placeholder: …").

## Motifs

None: the woven _tilet_ bands (under the hero, on the sign-in screen) and the lozenge dividers under
headings were removed on 2026-10-27 for a cleaner look. The only texture left is `dot-texture`, a
fine dotted pattern marking photography placeholders (only where no sample photo exists).

## Glass

Owner's request (2026-10-28), after a "glassy sidebar" reference: the whole site is frosted glass.

- **Backdrop.** `body::before` is fixed to the viewport (the body has no background of its own):
  a violet glow from the top left and a broad blue arc from the bottom right. Glass blurs it as it
  scrolls past, so the arc's edge shows softly through cards. Text also sits straight on it.
- **`glass`** (`globals.css`): translucent fill, 24px backdrop blur with extra saturation, a line of
  light on the top edge (`inset-shadow-glass`) and a soft shadow (`shadow-glass`). Pair it with
  `border border-border` for the rim; a coloured border (`border-warning/60`) or an explicit
  `shadow-*` replaces just that part. Used for every card, list panel and form card, the sign-in
  card, the service cards, the footer and the admin sidebar.
- **`glass-thick`**: the same, nearly opaque (85%) with a 40px blur, for surfaces that content
  moves behind: the header bars, dropdown menus, dialogs and sheets.
- **Raised glass** (`bg-glass-raised`): outline buttons, the selected sidebar item, role chips.
  **`bg-field`**: form inputs (lighter than the card in light, darker in dark).
- **Floating.** The public header, the admin top bar and sidebar, the footer and the sheets float
  0.75rem from the screen edges as rounded panels. The public header and footer line up with the
  page content.
- **Less transparency.** With `prefers-reduced-transparency: reduce`, `glass` and `glass-thick`
  turn solid (`surface`).

## Headers

The public header and the admin top bar are sticky, floating `glass-thick` bars. Each header button
is a `tint` button with its own `hue-*` colour: the navigation links (The chef, Services, Contact,
and menu, gallery, journal once published) light green in both themes, language flag teal, theme
toggle indigo, phone menu amber, admin account menu violet; Plan an event stays the orange
`primary`. The current page carries a ring in its hue.

## Admin sidebar

A floating `glass` panel (`admin/admin-shell`, contents in `admin/admin-sidebar`), modelled on the
owner's reference: logo and name; who is signed in (initial avatar, email, roles); the module
navigation under small uppercase headings with a divider between groups (the current module is a
raised-glass pill); then "View public site" and "Sign out" at the foot. A round button on its edge
(`admin/sidebar-toggle`) folds it to a 5.5rem icon rail and back (`aria-pressed` = collapsed), with
each row's name in a tooltip. The choice is stored in `localStorage["chef-harena:sidebar"]` and
applied as `data-sidebar="collapsed"` on `<html>` before first paint (`SIDEBAR_INIT_SCRIPT`); the
`sidebar-collapsed:` variant styles the rail. Below `lg` the same contents open in a glass sheet
from the menu button and never collapse. The account menu in the top bar stays at every width.

## Logo

`src/components/brand/logo.tsx` (2026-10-27, replacing the "H" monogram): a white chef's toque on
a black tile with 10/40 rounded corners, shaded for a clean 3D look: the tile darkens from top to
bottom under a light rim, the hat is lit from the top left, and a soft drop shadow lifts it off the
tile. Its colours are fixed `--color-logo-*` tokens, so it is identical in both themes; the rim
keeps the tile's edge visible on dark backgrounds. Each instance gets unique gradient ids
(`useId`). Readable from 16px up.

| Where                                   | How                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| Public header and footer                | `Wordmark` (logo, "CHEF SIS", tagline)                                       |
| Admin sidebar/header and sign-in screen | `Logo` at 32px beside "CHEF SIS · Admin"                                     |
| Browser tab                             | `src/app/icon.svg`, the same drawing in fixed hex colours                    |
| Phone home screen                       | `src/app/apple-icon.png`, 180px, full-bleed (iOS rounds the corners; no rim) |

## Two design languages

| Public site                                                                            | Admin                                                                                                           |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Bold sans headlines, asymmetric grids, photo-led hero, brand band, generous whitespace | Sans-serif, compact density, sidebar plus sticky header, cards and badges, no ornament (logo and wordmark only) |

## Components

| Component                                               | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/button`                                             | Glass buttons. Variants by role: `primary` (book or contact, spice orange), `action` (save, create, upload, sign in; royal blue), `positive` (publish, mark done; saffron gold), `danger` (confirmed delete, archive or decline; berbere red), `neutral` (utilities such as Apply and Search, selected tabs, the default; black or white), plus `outline` and `ghost`. Role colours are `--cta-*`, `--action-*`, `--positive-*`, `--destructive-*` tokens, each checked for 4.5:1; sizes `sm/md/lg/icon`; `asChild` for links. 8px corners. Shaded: a soft top-to-bottom gradient (the role tokens, `--primary-top/bottom` for neutral) under a glass sheen (`inset-shadow-sheen`: a line of light on top and a soft glow below it) and a faint light rim, with a small shadow; `outline` is raised glass (`bg-glass-raised`, blurred) instead. Hover: the gradient brightens (dims in dark), the border darkens, and the button rises 1px with a deeper shadow (`motion-safe` only); pressed, it flattens and settles. `ghost` is flat until hovered, then takes the raised-glass face and a hairline ring. `tint` (paired with a `hue-*` utility) gives each header control its own pastel colour (deep in dark). Every button-like control reuses these variants: tabs, pagination, flag toggles, the sheet close button; file pickers copy the outline look; icons can react through `group-hover/button:` (arrows nudge forward) |
| `ui/dropdown-menu`                                      | Radix, `glass-thick`; used by the account menu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `ui/sheet`                                              | Radix Dialog side panel (focus trap, Escape, scroll lock) for mobile navigation; floating `glass-thick`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `public/photo-slot`                                     | Until a real image is published: an uncaptioned sample photo (credited on `/credits`), or (no sample) a labelled placeholder naming the photograph to supply                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `layout/locale-switcher`, `admin/admin-locale-switcher` | One flag toggle (US flag = English, Ethiopian flag = Amharic; the current one raised like a switch knob). Each click switches language; the public one keeps the scroll position (`scroll={false}`). Accessible name: the target language's native name, with `lang`/`hreflang`. Flag colours are fixed `flag-*` tokens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `theme/theme-toggle`                                    | One icon button: each click switches light ↔ dark (a toggle button, `aria-pressed` = dark), remembered per browser; state from `useSyncExternalStore`, syncs across tabs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `layout/nav-link`                                       | Public navigation link with `aria-current` (`page`, or `true` inside a section); styled with `aria-[current]:` variants                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `admin/admin-nav`                                       | Sidebar navigation; a module stays current on the pages below it (`isModuleActive`); see [Admin sidebar](#admin-sidebar)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `admin/filter-disclosure`                               | On phones, list filters fold behind a "Filter …" toggle that shows the active count; open while filters apply                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `layout/demo-banner`                                    | "Demo mode" notice on every page when `NEXT_PUBLIC_DEMO_MODE=true` (`npm run dev:demo` only)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

New primitives can be added with the shadcn CLI (`components.json` is configured); restyle them to
the semantic tokens above.

## Motion and accessibility

- Transitions ≤ 260 ms, transform/opacity only. `prefers-reduced-motion: reduce` disables
  animations and smooth scrolling.
- Visible `:focus-visible` ring on every interactive element; skip link to `#main-content`.
- Photography placeholders expose a single accessible name ("Photography placeholder: …").
- Hit targets ≥ 40px for icon buttons; layouts verified at 320/390/768/1024/1440px in both themes
  and both languages, with placeholder content and with the full demo content (no horizontal
  scroll; see [UI_REVIEW.md](UI_REVIEW.md)).
- Links that open a new tab say so (an icon plus "opens in a new tab" for screen readers).

## Videos

Under the homepage hero, a row of three short, silent food loops (`public/components/food-reel`,
data in `src/features/content/sample-videos.ts`, files in `public/videos`): Pexels clips of
Ethiopian dishes and a coffee roasting, no identifiable faces, no captions, credited on `/credits`.
Each is cut to a few seconds, cropped to 16:10, 960px wide, H.264 without sound, with its first frame
as the poster. Nothing loads until the row is in view (`preload="none"`); clips play only while
visible, stay paused for `prefers-reduced-motion`, and one button pauses or plays them all.

## Photography

A published image from the media library always wins. Until one exists, a slot shows an openly
licensed **sample photo** from Wikimedia Commons (`src/features/content/sample-photos.ts`, files in
`src/assets/samples`), so the preview reads as a real site rather than a wireframe. Rules:

- Samples carry no caption on the image (owner's request, 2026-10-27). The credits page
  (`/credits`, "Photo credits" in the footer) names each photographer and licence (linked to its
  Creative Commons deed), links the Commons original, notes the resize, and says the photos are
  samples, not CHEF SIS's work, which keeps the CC BY / CC BY-SA attribution terms.
- No sample shows an identifiable face, so no stranger stands in for the chef or a client. The
  "chef" slot uses a coffee-ceremony still life, not a portrait.
- Only CC BY / CC BY-SA (or more permissive) images; copies are resized to 1600px and keep the
  original licence.

| Slot                           | Sample                                  | Credit                       |
| ------------------------------ | --------------------------------------- | ---------------------------- |
| Homepage hero                  | Injera, bread, cheese, stews and meat   | FrogsLegs71, CC BY-SA 3.0    |
| About / the chef               | Jebena over a brazier of incense        | ProtoplasmaKid, CC BY-SA 4.0 |
| Service: weddings              | Platter of injera with stews and eggs   | Miguel Discart, CC BY-SA 2.0 |
| Service: corporate events      | Coffee ceremony sets laid out on grass  | Khajitdadddy, CC BY-SA 4.0   |
| Service: summits & conferences | Shared beyaynetu platter                | Jean Rebiffé, CC BY-SA 4.0   |
| Service: culinary experiences  | Jebena on a stove beside roasted coffee | Radosław Botev, CC BY 3.0 PL |

A slot with no sample keeps the labelled placeholder, which names the intended shot (for example
"a portrait of CHEF SIS") so the chef can supply or commission it. Replacing the samples with
CHEF SIS's own photography is the single biggest step toward a site that feels personal.
