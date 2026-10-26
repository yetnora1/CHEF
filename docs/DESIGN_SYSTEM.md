# Design system

All tokens live in `src/app/globals.css`. Components use **semantic** utilities
(`bg-background`, `text-muted-foreground`, `border-border`…), never raw colours, so the palette and
themes change in one place.

## Brand palette (proposed, adjustable)

| Token                                           | Hex       | Role                                       |
| ----------------------------------------------- | --------- | ------------------------------------------ |
| Highland Forest `--color-highland-forest`       | `#173D32` | Primary actions (light), brand band        |
| Ceremonial Gold `--color-ceremonial-gold`       | `#D3A45B` | Restrained accents; primary actions (dark) |
| Berbere Terracotta `--color-berbere-terracotta` | `#9D4135` | Focus ring (light), status accents         |
| Injera Ivory `--color-injera-ivory`             | `#F5F0E6` | Light background                           |
| Coffee Charcoal `--color-coffee-charcoal`       | `#171D1A` | Dark background, text                      |

## Semantic tokens and themes

Each token is declared once as `light-dark(<light>, <dark>)`; `color-scheme` on `<html>` selects
the half:

| Theme state                  | How it is set                                                                                        | Result                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| First visit / "Match device" | no `data-theme`                                                                                      | follows the OS (`prefers-color-scheme`), also without JavaScript |
| Light / Dark chosen          | `localStorage["chief-harena:theme"]`; inline script in `<head>` sets `data-theme` before first paint | no flash, persists across reloads and both locales               |

Tokens: `background`, `foreground`, `surface`, `surface-foreground`, `surface-muted`,
`muted-foreground`, `border`, `border-strong`, `primary`, `primary-hover`, `primary-foreground`,
`accent`, `accent-ink` (gold dark enough for text on light), `terracotta`, `ring`, `band`,
`band-foreground`, `band-muted`, `band-accent`, `success`, `warning`, `danger`.

`tests/unit/design-tokens.test.ts` parses this file and enforces WCAG 2.2 contrast in **both**
themes: 4.5:1 for text pairs, 3:1 for focus rings and input borders. Gold is never used as body
text on ivory (2:1); `accent-ink` (#7E5A1C, 5.5:1) is used instead.

Tailwind's `dark:` variant is redefined to match this model (explicit choice or OS when unset), but
semantic tokens make it rarely necessary.

## Typography

One sans family throughout: Manrope for Latin, Noto Sans Ethiopic for Amharic. Headings are the
same face set heavier and tighter, not a separate display face.

| Utility       | Use                          | Notes                                                                      |
| ------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `display-xl`  | Hero headline                | Weight 750, fluid 36→60px, leading 1.08; Amharic 30→48px, leading 1.35     |
| `display-lg`  | Section headings             | Weight 700, fluid 28→40px                                                  |
| `display-md`  | Card and panel titles        | Weight 700, 18→22px                                                        |
| `eyebrow`     | Section labels               | Sentence case, 14px semibold (15px for Ethiopic); no uppercase or tracking |
| body          | Manrope / Noto Sans Ethiopic | line-height 1.65 (Latin), 1.85 (Amharic)                                   |
| `admin-title` | Admin page titles            | Weight 700 at an operational size, 24→32px; Amharic 22→28px, leading 1.4   |

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
- Vertical rhythm: homepage bands `py-20 md:py-28`; content pages `py-14 md:py-20`; admin pages
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

- `tilet-band`: diamond chain with edge rules, used under the hero and around the inquiry band.
- `tilet-rule`: small lozenge divider for headings and the footer.
- `lattice-backdrop`: very faint diagonal lattice behind the inquiry band.
- `dot-texture`: fine dotted texture marking photography placeholders (only where no sample photo
  exists).

The emblem (`src/components/brand/emblem.tsx`) is an abstract ring and lozenge, deliberately not a
religious or civic symbol.

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
| `layout/locale-switcher`, `admin/admin-locale-switcher` | Native-name language toggles with `lang`/`hreflang`                                                                                                                                                                                                                                                                              |
| `theme/theme-toggle`                                    | Light / Dark / Match device, state from `useSyncExternalStore`, syncs across tabs                                                                                                                                                                                                                                                |
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
  linked to the Commons page that states the licence; the footer says the same. None is ever
  presented as Chief Harena's food or events.
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
"a portrait of Chief Harena") so the chef can supply or commission it. Replacing the samples with
Chief Harena's own photography is the single biggest step toward a site that feels personal.
