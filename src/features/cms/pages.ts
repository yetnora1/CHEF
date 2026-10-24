import type { FieldDef } from "./content-types";

/*
 * Editable pages and their structured sections. Staff fill in these fields per
 * language; the database stores them in page_translations.sections (a bounded
 * JSON object) and the public pages read them through these definitions.
 * Adding a page needs a migration (public.pages_key_known) and a definition here.
 */

export const PAGE_KEYS = ["home", "about"] as const;
export type PageKey = (typeof PAGE_KEYS)[number];

export function isPageKey(value: unknown): value is PageKey {
  return (PAGE_KEYS as readonly unknown[]).includes(value);
}

export type SectionDef = {
  key: string;
  fields: readonly (FieldDef & { kind: "text" | "textarea" | "markup"; max: number })[];
};

export type PageDef = {
  key: PageKey;
  sections: readonly SectionDef[];
  /** Language-neutral image slots (public.page_images.slot). */
  imageSlots: readonly string[];
};

export const PAGES: Record<PageKey, PageDef> = {
  home: {
    key: "home",
    sections: [
      {
        key: "hero",
        fields: [
          { name: "eyebrow", kind: "text", max: 120 },
          { name: "headline", kind: "text", max: 160, required: true },
          { name: "lede", kind: "textarea", max: 400, rows: 3 },
        ],
      },
      {
        key: "about",
        fields: [
          { name: "heading", kind: "text", max: 160 },
          { name: "body", kind: "markup", max: 4000, rows: 6 },
        ],
      },
      {
        key: "services",
        fields: [
          { name: "heading", kind: "text", max: 160 },
          { name: "lede", kind: "textarea", max: 500, rows: 3 },
        ],
      },
      {
        key: "inquiry",
        fields: [
          { name: "heading", kind: "text", max: 160 },
          { name: "body", kind: "textarea", max: 600, rows: 3 },
        ],
      },
    ],
    imageSlots: ["hero", "about"],
  },
  about: {
    key: "about",
    sections: [
      {
        key: "intro",
        fields: [
          { name: "heading", kind: "text", max: 160, required: true },
          { name: "body", kind: "markup", max: 8000, rows: 8 },
        ],
      },
      {
        key: "story",
        fields: [
          { name: "heading", kind: "text", max: 160 },
          { name: "body", kind: "markup", max: 8000, rows: 8 },
        ],
      },
      {
        key: "philosophy",
        fields: [
          { name: "heading", kind: "text", max: 160 },
          { name: "body", kind: "markup", max: 8000, rows: 8 },
        ],
      },
    ],
    imageSlots: ["portrait", "story"],
  },
};

/** Section values: section → field → text (absent when empty). */
export type PageSections = Record<string, Record<string, string>>;
