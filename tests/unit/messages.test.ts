import { describe, expect, it } from "vitest";
import am from "@/messages/am.json";
import en from "@/messages/en.json";

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out.set(path, value);
    else for (const [k, v] of flatten(value, path)) out.set(k, v);
  }
  return out;
}

const enMessages = flatten(en);
const amMessages = flatten(am);

// Strings that are intentionally identical in both languages.
const SAME_IN_BOTH = new Set(["Metadata.siteName"]);

// Unicode blocks covered by Noto Sans/Serif Ethiopic plus the Latin, digits and
// punctuation the Amharic catalogue legitimately contains (brand name, env vars).
const SUPPORTED_AMHARIC_CHARS = /^[ሀ-፿ᎀ-᎟ⶀ-⷟꬀-꬯ -~ ©–—’…·]*$/u;

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)[^}]*\}/g)].map((m) => m[1]).sort();
const tags = (s: string) => [...s.matchAll(/<(\w+)>/g)].map((m) => m[1]).sort();

describe("interface messages", () => {
  it("define exactly the same keys in English and Amharic", () => {
    expect([...amMessages.keys()].sort()).toEqual([...enMessages.keys()].sort());
  });

  it("have no empty strings", () => {
    for (const [key, value] of [...enMessages, ...amMessages]) expect(value.trim(), key).not.toBe("");
  });

  it("use the same ICU placeholders and rich-text tags in both languages", () => {
    for (const [key, value] of enMessages) {
      const translated = amMessages.get(key)!;
      expect(placeholders(translated), key).toEqual(placeholders(value));
      expect(tags(translated), key).toEqual(tags(value));
    }
  });

  it("are really translated: Amharic strings contain Ethiopic script", () => {
    for (const [key, value] of amMessages) {
      if (SAME_IN_BOTH.has(key)) continue;
      expect(value, key).toMatch(/[ሀ-᎟]/);
    }
  });

  it("only use characters the bundled Ethiopic fonts cover", () => {
    for (const [key, value] of amMessages) expect(value, key).toMatch(SUPPORTED_AMHARIC_CHARS);
  });
});
