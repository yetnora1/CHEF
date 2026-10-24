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

| Utility      | Use                          | Notes                                                                                       |
| ------------ | ---------------------------- | ------------------------------------------------------------------------------------------- |
| `display-xl` | Hero headline                | Fraunces, fluid 42→88px, tight leading; Amharic: Noto Serif Ethiopic, 34→64px, leading 1.32 |
| `display-lg` | Section headings             | Fluid 32→56px                                                                               |
| `display-md` | Card and panel titles        | 22→28px                                                                                     |
| `eyebrow`    | Section labels               | Uppercase, tracked for Latin; plain and larger for Ethiopic                                 |
| body         | Manrope / Noto Sans Ethiopic | line-height 1.65 (Latin), 1.85 (Amharic)                                                    |

## Motifs

Geometric bands in the spirit of woven _tilet_ borders, drawn as CSS masks so they take any token
colour. They are decorative only (`aria-hidden`), abstract, and make no claim about a specific
regional pattern or meaning.

- `tilet-band`: diamond chain with edge rules, used under the hero and around the inquiry band.
- `tilet-rule`: small lozenge divider for headings and the footer.
- `lattice-backdrop`: very faint diagonal lattice behind the inquiry band.
- `dot-texture`: fine dotted texture marking photography placeholders.

The emblem (`src/components/brand/emblem.tsx`) is an abstract ring and lozenge, deliberately not a
religious or civic symbol.

## Two design languages

| Public site                                                                                    | Admin                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Editorial serif headlines, asymmetric grids, arch photo frame, brand band, generous whitespace | Sans-serif, compact density, sidebar plus sticky header, cards and badges, minimal ornament (wordmark and a single tilet band on sign-in) |

## Components

| Component                                               | Notes                                                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `ui/button`                                             | Variants `primary`, `outline`, `ghost`, `band`, `band-outline`; sizes `sm/md/lg/icon`; `asChild` for links            |
| `ui/dropdown-menu`                                      | Radix; used by the theme toggle and account menu                                                                      |
| `ui/sheet`                                              | Radix Dialog side panel (focus trap, Escape, scroll lock) for mobile navigation                                       |
| `public/photo-slot`                                     | Labelled placeholder that names the photograph to supply; swap in `next/image` once real, licensed photography exists |
| `layout/locale-switcher`, `admin/admin-locale-switcher` | Native-name language toggles with `lang`/`hreflang`                                                                   |
| `theme/theme-toggle`                                    | Light / Dark / Match device, state from `useSyncExternalStore`, syncs across tabs                                     |

New primitives can be added with the shadcn CLI (`components.json` is configured); restyle them to
the semantic tokens above.

## Motion and accessibility

- Transitions ≤ 260 ms, transform/opacity only. `prefers-reduced-motion: reduce` disables
  animations and smooth scrolling.
- Visible `:focus-visible` ring on every interactive element; skip link to `#main-content`.
- Photography placeholders expose a single accessible name ("Photography placeholder: …").
- Hit targets ≥ 40px for icon buttons; layouts verified at 360/390px (no horizontal scroll),
  tablet and 1440px.

## Photography

No stock photography is used, so nothing can be mistaken for Chief Harena's own work. Each slot
names the intended shot (for example "a portrait of Chief Harena" or "a wedding feast") so the
chef can supply or commission it. The media library (Stage 3) will add licence and credit fields.
