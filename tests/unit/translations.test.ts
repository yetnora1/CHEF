import { describe, expect, it } from "vitest";
import { homeContent } from "@/features/content/home-content";
import { resolveLocalized, resolveTranslation } from "@/lib/localization/translations";

const ETHIOPIC = /[ሀ-᎟ⶀ-⷟꬀-꬯]/;

describe("resolveLocalized (business content fallback policy)", () => {
  it("returns the requested language without a lang override", () => {
    expect(resolveLocalized({ en: "Weddings", am: "ሠርግ" }, "am")).toEqual({ text: "ሠርግ" });
    expect(resolveLocalized({ en: "Weddings", am: "ሠርግ" }, "en")).toEqual({ text: "Weddings" });
  });

  it("falls back from Amharic to English and labels it as English", () => {
    expect(resolveLocalized({ en: "Weddings" }, "am")).toEqual({ text: "Weddings", lang: "en" });
    expect(resolveLocalized({ en: "Weddings", am: "   " }, "am")).toEqual({ text: "Weddings", lang: "en" });
  });

  it("never presents Amharic as English and returns null when nothing exists", () => {
    expect(resolveLocalized({ am: "ሠርግ" }, "en")).toBeNull();
    expect(resolveLocalized({}, "am")).toBeNull();
  });
});

describe("resolveTranslation (CMS translation rows, same policy)", () => {
  const en = { title: "Weddings" };
  const am = { title: "ሠርግ" };

  it("returns the requested language's row without a lang override", () => {
    expect(resolveTranslation({ en, am }, "am")).toEqual({ value: am });
    expect(resolveTranslation({ en, am }, "en")).toEqual({ value: en });
  });

  it("falls back from Amharic to English, marked as English", () => {
    expect(resolveTranslation({ en }, "am")).toEqual({ value: en, lang: "en" });
  });

  it("never presents Amharic as English", () => {
    expect(resolveTranslation({ am }, "en")).toBeNull();
    expect(resolveTranslation({}, "am")).toBeNull();
  });
});

describe("homepage placeholder content", () => {
  const fields: { path: string; value: { en?: string; am?: string } }[] = [];
  const walk = (node: unknown, path: string) => {
    if (node && typeof node === "object" && "en" in node) {
      fields.push({ path, value: node as { en?: string; am?: string } });
    } else if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`));
    } else if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) walk(child, path ? `${path}.${key}` : key);
    }
  };
  walk(homeContent, "");

  it("has English for every field (the fallback language)", () => {
    expect(fields.length).toBeGreaterThan(10);
    for (const { path, value } of fields) expect(value.en?.trim(), path).toBeTruthy();
  });

  it("has an Amharic draft in Ethiopic script for every field", () => {
    for (const { path, value } of fields) expect(value.am, path).toMatch(ETHIOPIC);
  });
});
