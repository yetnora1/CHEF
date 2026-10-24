import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(path.resolve(import.meta.dirname, "../../src/app/globals.css"), "utf8");

// Parse `--token: light-dark(#light, #dark);` declarations from :root.
const tokens = new Map<string, { light: string; dark: string }>();
for (const match of css.matchAll(/--([\w-]+):\s*light-dark\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi)) {
  tokens.set(match[1]!, { light: match[2]!, dark: match[3]! });
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// [foreground, background, minimum ratio]. 4.5 = WCAG AA body text, 3 = UI components.
const PAIRS: [string, string, number][] = [
  ["foreground", "background", 4.5],
  ["foreground", "surface", 4.5],
  ["foreground", "surface-muted", 4.5],
  ["muted-foreground", "background", 4.5],
  ["muted-foreground", "surface", 4.5],
  ["muted-foreground", "surface-muted", 4.5],
  ["primary-foreground", "primary", 4.5],
  ["primary-foreground", "primary-hover", 4.5],
  ["accent-ink", "background", 4.5],
  ["accent-ink", "surface", 4.5],
  ["accent-ink", "surface-muted", 4.5],
  ["terracotta", "background", 4.5],
  ["terracotta", "surface-muted", 4.5],
  ["band-foreground", "band", 4.5],
  ["band-muted", "band", 4.5],
  ["band-accent", "band", 4.5],
  ["danger", "background", 4.5],
  ["danger", "surface", 4.5],
  ["success", "background", 4.5],
  ["warning", "background", 4.5],
  ["warning", "surface-muted", 4.5],
  ["ring", "background", 3],
  ["ring", "surface", 3],
  ["border-strong", "background", 3],
  ["border-strong", "surface", 3],
];

describe("design tokens", () => {
  it("define every semantic token with a light and a dark value", () => {
    expect(tokens.size).toBeGreaterThanOrEqual(20);
    for (const [fg, bg] of PAIRS) {
      expect(tokens.has(fg), fg).toBe(true);
      expect(tokens.has(bg), bg).toBe(true);
    }
  });

  for (const theme of ["light", "dark"] as const) {
    it.each(PAIRS)(`${theme}: %s on %s meets %s:1`, (fg, bg, min) => {
      const ratio = contrast(tokens.get(fg)![theme], tokens.get(bg)![theme]);
      expect(ratio).toBeGreaterThanOrEqual(min);
    });
  }

  it("keep the brand palette available as tokens", () => {
    for (const hex of ["#173d32", "#d3a45b", "#9d4135", "#f5f0e6", "#171d1a"]) {
      expect(css.toLowerCase()).toContain(hex);
    }
  });
});
