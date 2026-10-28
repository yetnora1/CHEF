import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");

// Parse `--token: light-dark(#light, #dark);` declarations from :root. Translucent
// tokens carry their alpha in the colour (#rrggbbaa) and are kept apart.
const tokens = new Map<string, { light: string; dark: string }>();
const translucent = new Map<string, { light: string; dark: string }>();
for (const match of css.matchAll(
  /--([\w-]+):\s*light-dark\((#[0-9a-f]{6}(?:[0-9a-f]{2})?),\s*(#[0-9a-f]{6}(?:[0-9a-f]{2})?)\)/gi,
)) {
  const opaque = match[2]!.length === 7 && match[3]!.length === 7;
  (opaque ? tokens : translucent).set(match[1]!, { light: match[2]!, dark: match[3]! });
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** `top` (#rrggbbaa) composited over an opaque `bottom`, as the browser paints it. */
function over(top: string, bottom: string): string {
  const alpha = parseInt(top.slice(7, 9), 16) / 255;
  return `#${[1, 3, 5]
    .map((i) => {
      const value =
        parseInt(top.slice(i, i + 2), 16) * alpha + parseInt(bottom.slice(i, i + 2), 16) * (1 - alpha);
      return Math.round(value).toString(16).padStart(2, "0");
    })
    .join("")}`;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// [foreground, background, minimum ratio]. 4.5 = WCAG AA body text, 3 = UI components.
const PAIRS: [string, string, number][] = [
  ["foreground", "background", 4.5],
  ["foreground", "surface", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "surface", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["primary-foreground", "primary-hover", 4.5],
  ["primary-foreground", "primary-top", 4.5],
  ["primary-foreground", "primary-bottom", 4.5],
  ["primary-foreground", "primary-hover-top", 4.5],
  ["primary-foreground", "primary-hover-bottom", 4.5],
  // Role-coloured buttons: their text against every stop, at rest and on hover.
  ...(["cta", "action", "positive", "destructive"] as const).flatMap((role) =>
    (["top", "bottom", "hover-top", "hover-bottom"] as const).map((stop): [string, string, number] => [
      `${role}-foreground`,
      `${role}-${stop}`,
      4.5,
    ]),
  ),
  // Tinted header buttons: each hue's text on both ends of its face.
  ...(["rose", "amber", "violet", "indigo", "teal", "sky", "green"] as const).flatMap((hue) =>
    (["top", "bottom"] as const).map((stop): [string, string, number] => [
      `${hue}-text`,
      `${hue}-${stop}`,
      4.5,
    ]),
  ),
  ["accent-ink", "background", 4.5],
  ["accent-ink", "surface", 4.5],
  ["terracotta", "background", 4.5],
  ["band-foreground", "band", 4.5],
  ["band-muted", "band", 4.5],
  ["band-accent", "band", 4.5],
  ["danger", "background", 4.5],
  ["danger", "surface", 4.5],
  ["success", "background", 4.5],
  ["warning", "background", 4.5],
  // Demo-mode banner: page background colour as text on the warning colour.
  ["background", "warning", 4.5],
  // Full-screen video viewer: its counter on the black stage.
  ["stage-foreground", "stage", 4.5],
  ["ring", "background", 3],
  ["ring", "surface", 3],
  ["border-strong", "background", 3],
  ["border-strong", "surface", 3],
];

/*
 * Glass is translucent, so what shows through decides its contrast. Each case
 * stacks translucent layers (top first) over the page background and over each
 * backdrop colour at full strength, the worst case of its soft gradients.
 */
const BACKDROPS = ["background", "backdrop-sky", "backdrop-blue"];
const TEXT = ["foreground", "muted-foreground", "accent-ink", "terracotta", "danger", "success", "warning"];

// [text tokens, translucent layers from the top down, minimum ratio, extra grounds]
const GLASS_STACKS: [string[], string[], number, string[]?][] = [
  // Text set straight on the backdrop (hero, about and story rows).
  [TEXT, [], 4.5],
  // Cards and the sidebar, and wells inside them (hover fills, quiet badges).
  [TEXT, ["glass"], 4.5],
  [TEXT, ["surface-muted", "glass"], 4.5],
  // Outline buttons and the selected sidebar item; hovered, they carry foreground text.
  [["foreground", "muted-foreground"], ["glass-raised", "glass"], 4.5],
  [["foreground"], ["glass-raised-hover", "glass"], 4.5],
  // Inputs on a card: text, placeholder, and the 3:1 border.
  [["foreground", "muted-foreground"], ["field", "glass"], 4.5],
  [["border-strong"], ["field", "glass"], 3],
  // Bars, menus, dialogs and sheets: photos may scroll behind them, so black and white too.
  [TEXT, ["glass-thick"], 4.5, ["#000000", "#ffffff"]],
];

const GLASS_CASES = (["light", "dark"] as const).flatMap((theme) =>
  GLASS_STACKS.flatMap(([texts, layers, min, extra = []]) =>
    [...BACKDROPS.map((name) => tokens.get(name)?.[theme] ?? name), ...extra].flatMap((ground, i) =>
      texts.map((text): [string, number, string, string] => [
        `${theme}: ${text} on ${[...layers, BACKDROPS[i] ?? ground].join(" over ")}`,
        min,
        tokens.get(text)?.[theme] ?? text,
        layers.reduceRight((below, layer) => over(translucent.get(layer)![theme], below), ground),
      ]),
    ),
  ),
);

describe("design tokens", () => {
  it("define every semantic token with a light and a dark value", () => {
    expect(tokens.size).toBeGreaterThanOrEqual(20);
    for (const [fg, bg] of PAIRS) {
      expect(tokens.has(fg), fg).toBe(true);
      expect(tokens.has(bg), bg).toBe(true);
    }
    for (const name of [...BACKDROPS, ...TEXT, "border-strong"]) expect(tokens.has(name), name).toBe(true);
    for (const [, layers] of GLASS_STACKS) {
      for (const layer of layers) expect(translucent.has(layer), layer).toBe(true);
    }
  });

  for (const theme of ["light", "dark"] as const) {
    it.each(PAIRS)(`${theme}: %s on %s meets %s:1`, (fg, bg, min) => {
      const ratio = contrast(tokens.get(fg)![theme], tokens.get(bg)![theme]);
      expect(ratio).toBeGreaterThanOrEqual(min);
    });
  }

  it.each(GLASS_CASES)("%s meets %s:1", (_name, min, text, ground) => {
    expect(contrast(text, ground)).toBeGreaterThanOrEqual(min);
  });

  it("keep the brand palette available as tokens", () => {
    for (const hex of ["#173d32", "#d3a45b", "#9d4135", "#f5f0e6", "#171d1a"]) {
      expect(css.toLowerCase()).toContain(hex);
    }
  });
});
