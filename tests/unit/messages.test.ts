import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
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

// Parsed with the ICU grammar next-intl uses, so plural/select branch text such
// as `{Used in # places}` is not mistaken for an argument, arguments and tags
// nested inside branches are compared too, and a malformed message fails here.
function icuParts(message: string) {
  const parts = { placeholders: [] as string[], tags: [] as string[] };
  const walk = (elements: MessageFormatElement[]) => {
    for (const element of elements) {
      if (element.type === TYPE.tag) {
        parts.tags.push(element.value);
        walk(element.children);
      } else if (element.type === TYPE.plural || element.type === TYPE.select) {
        parts.placeholders.push(element.value);
        for (const option of Object.values(element.options)) walk(option.value);
      } else if ("value" in element && element.type !== TYPE.literal) {
        parts.placeholders.push(element.value);
      }
    }
  };
  walk(parse(message));
  return { placeholders: [...new Set(parts.placeholders)].sort(), tags: parts.tags.sort() };
}

describe("interface messages", () => {
  it("define exactly the same keys in English and Amharic", () => {
    expect([...amMessages.keys()].sort()).toEqual([...enMessages.keys()].sort());
  });

  it("have no empty strings", () => {
    for (const [key, value] of [...enMessages, ...amMessages]) expect(value.trim(), key).not.toBe("");
  });

  it("use the same ICU placeholders and rich-text tags in both languages", () => {
    for (const [key, value] of enMessages) {
      const source = icuParts(value);
      const translated = icuParts(amMessages.get(key)!);
      expect(translated.placeholders, key).toEqual(source.placeholders);
      expect(translated.tags, key).toEqual(source.tags);
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
