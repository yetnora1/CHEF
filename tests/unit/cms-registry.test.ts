import { describe, expect, it } from "vitest";
import { CONTENT, CONTENT_TYPES } from "@/features/cms/content-types";
import { fieldLabelKey, imageSlotKey, sectionFieldKey, sectionTitleKey } from "@/features/cms/message-keys";
import { PAGE_KEYS, PAGES } from "@/features/cms/pages";
import am from "@/messages/am.json";
import en from "@/messages/en.json";

/*
 * The admin builds some message keys from registry names (message-keys.ts),
 * which next-intl cannot type-check. Every key the registry can produce must
 * exist in both catalogues, or the admin would show raw keys.
 */

type Tree = { [key: string]: string | Tree };

const catalogues = { en: en.AdminCms as Tree, am: am.AdminCms as Tree };

function lookup(tree: Tree, key: string): string | Tree | undefined {
  let node: string | Tree | undefined = tree;
  for (const part of key.split(".")) node = typeof node === "object" ? node[part] : undefined;
  return node;
}

function expectMessage(key: string) {
  for (const [locale, tree] of Object.entries(catalogues)) {
    expect(typeof lookup(tree, key), `${locale}.json: AdminCms.${key}`).toBe("string");
  }
}

describe("content registry messages", () => {
  it("label every field of every content type", () => {
    for (const type of CONTENT_TYPES) {
      for (const field of [...CONTENT[type].entityFields, ...CONTENT[type].translationFields]) {
        expectMessage(fieldLabelKey(field.name));
      }
    }
  });

  it("title every page section, label its fields and name its image slots", () => {
    for (const key of PAGE_KEYS) {
      const page = PAGES[key];
      expect(page.key).toBe(key);
      for (const section of page.sections) {
        expectMessage(sectionTitleKey(key, section.key));
        for (const field of section.fields) expectMessage(sectionFieldKey(key, section.key, field.name));
      }
      for (const slot of page.imageSlots) expectMessage(imageSlotKey(key, slot));
    }
  });

  it("give every content type its names and screens", () => {
    for (const type of CONTENT_TYPES) {
      for (const part of ["singular", "plural", "intro", "new", "edit", "empty"])
        expectMessage(`types.${type}.${part}`);
    }
    for (const key of PAGE_KEYS) expectMessage(`pageNames.${key}`);
  });

  it("keep each content type's admin path under its module", () => {
    for (const type of CONTENT_TYPES) {
      expect(CONTENT[type].basePath, type).toMatch(new RegExp(`^/admin/${CONTENT[type].module}(/|$)`));
    }
  });
});
