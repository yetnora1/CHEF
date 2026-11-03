# Design system

All tokens live in `src/app/globals.css`. Components use **semantic** utilities
(`bg-background`, `text-muted-foreground`, `border-border`…), never raw colours, so the palette and
themes change in one place.

## Colour

**Neutral black and white text and actions on frosted glass** (owner's choices, 2026-10-27 and
2026-10-28): cards, bars and the admin sidebar are translucent panels over a soft backdrop: a
watercolour of sky and deeper blue in light, warm charcoal in dark (see [Glass](#glass)). No green,
ivory or gold tint in the interface.

Dark mode (2026-11-02, owner: "the dark mode seems a little AI generated, make it natural"): the
navy glow on pure black is gone. The page is a warm charcoal, lit faintly from the top left like a
lamp-lit room, with soft white text and warm grey secondary text. Avoid glows, neon accents and
cold blue washes in dark.

|                 | Light                                    | Dark                                             |
| --------------- | ---------------------------------------- | ------------------------------------------------ |
| Background      | `#FFFFFF`                                | `#121110` warm charcoal                          |
| Backdrop        | sky `#E0F2FE` washes, blue `#DBE7FF` arc | `#1D1A16` light from the top left, `#161412` arc |
| Glass           | white at 55% (cards), 85% (bars, menus)  | white at 5% (cards), `#181614` at 90% (bars)     |
| Text            | `#0A0A0A`; secondary `#525252`           | `#EEEBE7`; secondary `#A9A39C`                   |
| Primary buttons | black, white text                        | soft white, charcoal text                        |
| Kept hues       | feedback colours, terracotta status dot  | feedback colours, terracotta status dot          |

The original brand palette stays defined in `@theme` (`globals.css`), but the interface and the
logo no longer use forest, gold or ivory:

| Token                                           | Hex       | Used in                                  |
| ----------------------------------------------- | --------- | ---------------------------------------- |
| Highland Forest `--color-highland-forest`       | `#173D32` | (unused, kept for reference)             |
| Ceremonial Gold `--color-ceremonial-gold`       | `#D3A45B` | (unused, kept for reference)             |
| Berbere Terracotta `--color-berbere-terracotta` | `#9D4135` | Status accents (light)                   |
| Injera Ivory `--color-injera-ivory`             | `#F5F0E6` | (unused, kept for reference)             |
| Coffee Charcoal `--color-coffee-charcoal`       | `#171D1A` | Text on the band button, dialog overlays |

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
`backdrop-sky`, `backdrop-blue`, `glass`, `glass-thick`, `glass-raised`, `glass-raised-hover`,
`glass-shine`, `glass-shadow`, `glass-sheet`, `glass-sheet-sheen`, `glass-sheet-rim`,
`glass-sheet-rim-soft`, `glass-sheet-shadow`, `scrim`, `field`.

Translucent tokens carry their alpha in the colour (`#rrggbbaa`): the glass tokens, `field`, and
also `border` and `surface-muted`, so hairlines and wells look the same on glass and on the page.

`tests/unit/design-tokens.test.ts` parses this file and enforces WCAG 2.2 contrast in **both**
themes: 4.5:1 for text pairs, 3:1 for focus rings and input borders. For glass it composites each
translucent layer over the page background and over each backdrop colour at full strength (and
`glass-thick` over black and white, for photos scrolling under a bar; `glass-sheet` with and
without its sheen, over the scrim and black or white, plus the buttons on it) before measuring.

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

| Breakpoint | Width   | What changes                                                                                                  |
| ---------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| base       | 320px + | One column; header: wordmark and menu button (language and theme toggles in the menu)                         |
| `xs`       | 26rem   | Custom, for small two-up arrangements                                                                         |
| `sm`       | 40rem   | Admin filters always shown                                                                                    |
| `md`       | 48rem   | Two-column editorial sections (about, services intro)                                                         |
| `lg`       | 64rem   | **Inline public navigation** and header toggles (below it, the menu sheet); admin sidebar; multi-column grids |

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
| Homepage photo mosaic                      | Tile shapes   | One 2×2 tile, one tall tile, six single tiles        |
| Gallery of CHEF SIS's own photographs      | Own shape     | Masonry columns (2, 3, 4); nothing is cropped        |
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
  soft watercolour washes, sky blue from the top left and across the middle (2026-10-28: the
  first violet glow read as magenta in dark mode), and a deeper blue arc from the bottom right.
  In dark mode the same washes are warm charcoal a shade above the page (2026-11-02: the navy
  washes read as generated), so only a faint light from the top left shows. Glass blurs it as it
  scrolls past, so the arc's edge shows softly through cards. Text also sits straight on it.
- **`glass`** (`globals.css`): translucent fill, 24px backdrop blur with extra saturation, a line of
  light on the top edge (`inset-shadow-glass`) and a soft shadow (`shadow-glass`). Pair it with
  `border border-border` for the rim; a coloured border (`border-warning/60`) or an explicit
  `shadow-*` replaces just that part. Used for every card, list panel and form card, the sign-in
  card, the service cards, the footer and the admin sidebar.
- **`glass-thick`**: the same, nearly opaque (85%) with a 40px blur, for surfaces that content
  moves behind: the header bars, dropdown menus and dialogs.
- **`glass-sheet`** (owner's request, 2026-11-03: "modern high tech glassmorphism"): the phone
  menu sheets, public and admin. Clearer (78% in light, 82% in dark) with a 40px blur at 180%
  saturation, so the page's colours show through the frost; a diagonal sheen from the top left
  (`glass-sheet-sheen`), a rim lit on the top and left edges and faint on the others
  (`inset-shadow-rim`), and a deep soft shadow (`shadow-sheet`). The page behind is only lightly
  dimmed (`bg-scrim`, 4px blur). The public menu's links are clear glass buttons (`outline` on
  `bg-glass`, filling to `bg-glass-raised` on hover); the current page is filled and ringed; the
  close button is an `outline` icon button.
- **Raised glass** (`bg-glass-raised`): outline buttons, the selected sidebar item, role chips.
  **`bg-field`**: form inputs (lighter than the card in light, darker in dark).
- **Floating.** The public header, the admin top bar and sidebar, the footer and the sheets float
  0.75rem from the screen edges as rounded panels. The public header and footer line up with the
  page content.
- **Less transparency.** With `prefers-reduced-transparency: reduce`, `glass`, `glass-thick` and
  `glass-sheet` turn solid (`surface`).

## Headers

The public header and the admin top bar are sticky, floating `glass-thick` bars. Each header button
is a `tint` button with its own `hue-*` colour: the navigation links (The chef, Services, Gallery,
Contact, and menu, journal once published) light green in both themes, language flag teal, theme
toggle indigo, menu button dark green (both themes), admin account menu violet. The current page
carries a ring in its hue. Below `lg` the public header bar is only the wordmark and the menu
button; the language flag and theme toggle sit inside the menu. There is no "Plan an event" button
in the header bar (removed at the owner's request, 2026-10-28); the event form is reached from the
homepage call to action, the phone menu and the footer.

## Colour-coded chips

`tint-chip` (paired with a `hue-*` utility) gives small surfaces the same pastel face, rim and text
as a `tint` button, without its shading. It marks things that belong to a fixed set, so a colour
always means the same thing:

- **Staff roles** (`features/staff/role-hues.ts`): owner violet, administrator indigo, content
  editor teal, event manager amber, analyst sky. Badges, and the avatar of each person's main role.
- **Audit log areas**: roles violet, inquiries amber, messages sky, content teal, images rose,
  settings indigo.
- **Ways to get in touch** on the Contact page: phone amber, WhatsApp teal, Telegram sky, email
  indigo, location rose.

Chips carry a text label or sit beside one; the colour is never the only cue.

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
| `ui/sheet`                                              | Radix Dialog side panel (focus trap, Escape, scroll lock) for mobile navigation; below desktop width it also holds the language and theme toggles. Floating `glass-sheet` over a light `bg-scrim`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `public/photo-slot`                                     | Until a real image is published: one of CHEF SIS's own photographs or an uncaptioned sample photo (credited on `/credits`), or (neither) a labelled placeholder naming the photograph to supply                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `layout/locale-switcher`, `admin/admin-locale-switcher` | One flag toggle (US flag = English, Ethiopian flag = Amharic; the current one raised like a switch knob). Each click switches language; the public one keeps the scroll position (`scroll={false}`). Accessible name: the target language's native name, with `lang`/`hreflang`. Flag colours are fixed `flag-*` tokens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `theme/theme-toggle`                                    | One icon button: each click switches light ↔ dark (a toggle button, `aria-pressed` = dark), remembered per browser; state from `useSyncExternalStore`, syncs across tabs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `layout/nav-link`                                       | Public navigation link with `aria-current` (`page`, or `true` inside a section); styled with `aria-[current]:` variants                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `admin/admin-nav`                                       | Sidebar navigation; a module stays current on the pages below it (`isModuleActive`); see [Admin sidebar](#admin-sidebar)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `admin/filter-disclosure`                               | On phones, list filters fold behind a "Filter …" toggle that shows the active count; open while filters apply                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `bookings/inquiry-form`                                 | The event inquiry ("Plan an event", 2026-10-28) in three steps inside one glass card: a progress bar (done steps clickable), then Your event (event-type cards, date, guest counter with −/+, place), What you need, and About you (contact-method cards, a review of the first two steps with Edit links, consent, Send). Card choices are real radio buttons stretched over each card (`ChoiceGroup`), so arrow keys and screen readers work; the selected card takes the orange `primary` border. Each step is validated before the next with the accessible error summary; focus moves to each new step's heading. No CAPTCHA by default (see INQUIRIES.md).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
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

## Kitchen illustration

Directly under the header on the homepage, a rounded card holds an animated, painted kitchen
(`components/public/kitchen-scene`): a chef in a white coat, slate apron and toque, seen in profile
looking down, stirs a steel pot of stew over gas flames; injera cooks on a clay mitad as its holes
open; a jebena keeps coffee warm; a red onion, a cut half and a knife wait on a wooden board beside
a white bowl of berbere; behind them, quiet tiles, a spice shelf and a window whose light comes from
the right. The owner asked for an animation that looks real, then for it to be cleaner and more
professional (2026-10-28), so it is drawn as an editorial illustration: few, smooth shapes, flat
colours with crisp shadow shapes and a few soft gradients (the steel, the stew, the light), no
outlines and no small clutter, in its own fixed `--color-kitchen-*` palette (an `@theme static`
block in `globals.css`, the same picture in light and dark, like the logo). It replaced a flat line
drawing and, briefly, a stock video.

- Motion is CSS only (`animate-kitchen-*` keyframes): the stirring arm and spoon, a slight nod and
  breathing, rising steam (soft gradient wisps, no blur filters), flickering flames and their glow,
  ripples and bubbles in the stew, and the injera's holes. Staggered parts use negative delays, so
  a paused frame still shows steam.
- The SVG covers the card (`preserveAspectRatio="xMidYMid slice"`, 220/260/300px tall); on narrow
  screens the sides are cropped and the chef and the pot stay in the middle.
- A pause button (bottom right) stops it; it also pauses while off screen. With
  `prefers-reduced-motion: reduce` it is a still picture and the button is hidden.
- The SVG is one image with a description (`role="img"`, "Animation: a chef stirring a pot of
  stew…").

## Videos

Under the homepage hero, six short, silent loops (`components/public/food-reel`, data in
`src/features/content/sample-videos.ts`, files in `public/videos`), two rows of three (three rows of
two on phones): injera platters, a stew served onto injera, and the coffee ceremony (roasting, the
beans shown above the cups, popcorn among petals). All are Pexels clips from one Addis Ababa shoot
by @kelly, with no identifiable faces and no captions, credited on `/credits`. Free Ethiopian food
footage is scarce: other "Ethiopian" search results were other cuisines or showed faces.

Each clip is cut to 4-7 s, cropped to 16:10 to keep bystanders out, without sound, in two sizes:

| File                           | Size              | Used by                         |
| ------------------------------ | ----------------- | ------------------------------- |
| `public/videos/preview/*.mp4`  | 640x400, ~0.25 MB | the reel's tiles                |
| `public/videos/*.mp4`          | 960x600, ~0.6 MB  | the full-screen viewer          |
| `public/videos/*.jpg` (poster) | 640x400, ~35 KB   | first frame, tiles and /credits |

Loading (2026-10-28, "it lags"): tiles stay at `preload="none"` until the reel is within 400px of
the viewport, then buffer, so clips are ready when seen; they play only while visible, stay paused
for `prefers-reduced-motion`, and one button pauses or plays them all. `next.config.ts` caches
`/videos/*` in the browser for a day (then refreshed in the background; files in `public` otherwise
get `max-age=0`), so **a changed clip needs a new file name**.

Clicking a tile opens `components/public/video-viewer`: the clip at full quality on a black stage
(`--stage` tokens, dark controls whatever the theme), in the browser's full screen where allowed and
filling the window otherwise (iPhone). Previous/next buttons, the arrow keys and a swipe move
between clips ("2 / 6"); a play/pause button; minimize or Escape leaves full screen and closes it,
returning focus to the tile. The tiles pause while it is open. Radix Dialog provides the focus trap.

## Photo mosaic, gallery and photo viewer

After "Meet CHEF SIS", `components/public/photos-section` shows eight of CHEF SIS's own photographs
as a mosaic (`PhotoMosaic` in `photo-gallery.tsx`): a 2×2 tile, a tall tile and six single tiles,
`grid-flow-dense` so whole rows fill at two, three and four columns, then "See all photos" to
`/gallery`. The gallery page (`PhotoGallery`) shows all twenty in masonry columns, each photo in its
own shape, with an All / Events / Dishes filter (toggle buttons and a polite count, like the dishes
section). Tiles are buttons named "View larger: <description>"; on hover or focus the photo zooms
slightly and an expand mark appears (always shown on touch screens).

A tile opens `components/public/photo-viewer`: the photo on the same black stage as the video
viewer, at up to 1.5 times its own size (the photos are phone pictures) and always clear of the
controls. Previous/next buttons, the arrow keys and a swipe move between the photos shown ("2 / 8");
the close button or Escape closes it and focus returns to the tile.

## Photography

A published image from the media library always wins. Until one exists, a slot shows one of
**CHEF SIS's own photographs** (`src/features/content/chef-photos.ts`, files in `src/assets/chef`),
or, where none fits, an openly licensed **sample photo** from Wikimedia Commons
(`src/features/content/sample-photos.ts`, files in `src/assets/samples`).

CHEF SIS's own photographs (the owner's phone pictures, supplied 2026-11-02):

- Twenty of them: buffets, banquet halls, trays, platters, plated dishes and the chef at work. They
  carry no caption and need no credit. Each has a kind (`event` or `dish`) for the gallery filter.
- Kept as supplied (at most 1280px, no camera metadata); four lost their bottom 8% to remove a
  camera-model stamp. No text on any photo.
- Left out at the owner's request: photos showing guests' faces (no consent on record), and recipe
  cards and stock-style pictures that are not the chef's work. Staff appear; guests do not.
- Slots: the homepage hero (the chef at a buffet), "Meet CHEF SIS" (the chef beside a line of
  chafing dishes) and three service cards (weddings: a banquet room; corporate events: finger food;
  summits & conferences: a long buffet hall). The homepage photo mosaic shows eight others; the
  gallery shows all twenty.

Sample photos:

- Samples carry no caption on the image (owner's request, 2026-10-27). The credits page
  (`/credits`, "Photo credits" in the footer) names each photographer and licence (linked to its
  Creative Commons deed), links the Commons original, notes the resize, and says the listed photos
  are samples, not CHEF SIS's work, which keeps the CC BY / CC BY-SA attribution terms.
- No sample shows an identifiable face, so no stranger stands in for the chef or a client.
- Only CC BY / CC BY-SA (or more permissive) images; copies are resized to 1600px and keep the
  original licence.

| Slot                          | Sample                                  | Credit                       |
| ----------------------------- | --------------------------------------- | ---------------------------- |
| Service: culinary experiences | Jebena on a stove beside roasted coffee | Radosław Botev, CC BY 3.0 PL |
| Food stories and dishes       | See `/credits`                          | Various, CC BY / CC BY-SA    |

A slot with neither keeps the labelled placeholder, which names the intended shot so the chef can
supply or commission it.
