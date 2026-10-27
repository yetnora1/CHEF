# Design system

All tokens live in `src/app/globals.css`. Components use **semantic** utilities
(`bg-background`, `text-muted-foreground`, `border-border`…), never raw colours, so the palette and
themes change in one place.

## Colour

**Both themes are neutral black and white** (owner's choice, 2026-10-27); no green, ivory or gold
tint in the interface:

|                 | Light                                   | Dark                                    |
| --------------- | --------------------------------------- | --------------------------------------- |
| Background      | `#FFFFFF`                               | `#0A0A0A`                               |
| Surfaces        | `#FAFAFA`, `#F2F2F2`                    | `#141414`, `#1F1F1F`                    |
| Text            | `#0A0A0A`; secondary `#525252`          | `#F5F5F5`; secondary `#A3A3A3`          |
| Primary buttons | black, white text                       | white, black text                       |
| Band            | `#171717` (hero strip, inquiry band)    | the same                                |
| Kept hues       | feedback colours, terracotta status dot | feedback colours, terracotta status dot |

The brand palette survives in the logo only (`@theme` in `globals.css`):

| Token                                           | Hex       | Used in                           |
| ----------------------------------------------- | --------- | --------------------------------- |
| Highland Forest `--color-highland-forest`       | `#173D32` | Logo tile                         |
| Ceremonial Gold `--color-ceremonial-gold`       | `#D3A45B` | Logo lozenge                      |
| Berbere Terracotta `--color-berbere-terracotta` | `#9D4135` | Status accents (light)            |
| Injera Ivory `--color-injera-ivory`             | `#F5F0E6` | Logo strokes                      |
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
`band-foreground`, `band-muted`, `band-accent`, `success`, `warning`, `danger`.

`tests/unit/design-tokens.test.ts` parses this file and enforces WCAG 2.2 contrast in **both**
themes: 4.5:1 for text pairs, 3:1 for focus rings and input borders.

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

Geometric bands in the spirit of woven _tilet_ borders, drawn as CSS masks so they take any token
colour. They are decorative only (`aria-hidden`), abstract, and make no claim about a specific
regional pattern or meaning.

- `tilet-band`: diamond chain with edge rules, used under the hero.
- `tilet-rule`: small lozenge divider under headings.
- `dot-texture`: fine dotted texture marking photography placeholders (only where no sample photo
  exists).

## Logo

`src/components/brand/logo.tsx`: an "H" monogram (Harena) whose crossbar is the gold lozenge from
the woven-border motif, in ivory and gold on a forest-green tile with 10/40 rounded corners. It is
abstract by design, not a religious or civic symbol. Brand colours are fixed (palette tokens), so
it is identical in both themes; in dark mode a hairline outline separates the tile from the dark
background. Readable from 16px up.

| Where                                   | How                                                                  |
| --------------------------------------- | -------------------------------------------------------------------- |
| Public header and footer                | `Wordmark` (logo, "Chef Harena", tagline)                            |
| Admin sidebar/header and sign-in screen | `Logo` at 32px beside "Chef Harena · Admin"                          |
| Browser tab                             | `src/app/icon.svg`, the same drawing in fixed hex colours            |
| Phone home screen                       | `src/app/apple-icon.png`, 180px, full-bleed (iOS rounds the corners) |

## Two design languages

| Public site                                                                            | Admin                                                                                                                                     |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Bold sans headlines, asymmetric grids, photo-led hero, brand band, generous whitespace | Sans-serif, compact density, sidebar plus sticky header, cards and badges, minimal ornament (wordmark and a single tilet band on sign-in) |

## Components

| Component                                               | Notes                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ui/button`                                             | Variants `primary`, `outline`, `ghost`, `band`, `band-outline`; sizes `sm/md/lg/icon`; `asChild` for links. 8px corners. Hover: deeper fill or border; solid and outline variants also rise 1px with a shadow (`motion-safe` only) and settle when pressed; icons can react through `group-hover/button:` (arrows nudge forward) |
| `ui/dropdown-menu`                                      | Radix; used by the theme toggle and account menu                                                                                                                                                                                                                                                                                 |
| `ui/sheet`                                              | Radix Dialog side panel (focus trap, Escape, scroll lock) for mobile navigation                                                                                                                                                                                                                                                  |
| `public/photo-slot`                                     | Until a real image is published: a sample photo with a visible "Sample photo" label and a linked credit, or (no sample) a labelled placeholder naming the photograph to supply                                                                                                                                                   |
| `layout/locale-switcher`, `admin/admin-locale-switcher` | One flag toggle (US flag = English, Ethiopian flag = Amharic; the current one raised like a switch knob). Each click switches language; the public one keeps the scroll position (`scroll={false}`). Accessible name: the target language's native name, with `lang`/`hreflang`. Flag colours are fixed `flag-*` tokens          |
| `theme/theme-toggle`                                    | One icon button: each click switches light ↔ dark (a toggle button, `aria-pressed` = dark), remembered per browser; state from `useSyncExternalStore`, syncs across tabs                                                                                                                                                         |
| `layout/nav-link`                                       | Public navigation link with `aria-current` (`page`, or `true` inside a section); styled with `aria-[current]:` variants                                                                                                                                                                                                          |
| `admin/admin-nav`                                       | Sidebar; a module stays current on the pages below it (`isModuleActive`)                                                                                                                                                                                                                                                         |
| `admin/filter-disclosure`                               | On phones, list filters fold behind a "Filter …" toggle that shows the active count; open while filters apply                                                                                                                                                                                                                    |
| `layout/demo-banner`                                    | "Demo mode" notice on every page when `NEXT_PUBLIC_DEMO_MODE=true` (`npm run dev:demo` only)                                                                                                                                                                                                                                     |

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

## Photography

A published image from the media library always wins. Until one exists, a slot shows an openly
licensed **sample photo** from Wikimedia Commons (`src/features/content/sample-photos.ts`, files in
`src/assets/samples`), so the preview reads as a real site rather than a wireframe. Rules:

- Every sample carries a visible "Sample photo" label and its credit (photographer and licence),
  linked to the Commons page that states the licence. None is ever
  presented as Chef Harena's food or events.
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
"a portrait of Chef Harena") so the chef can supply or commission it. Replacing the samples with
Chef Harena's own photography is the single biggest step toward a site that feels personal.
