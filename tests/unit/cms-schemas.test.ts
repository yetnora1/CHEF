import { describe, expect, it } from "vitest";
import {
  CONTENT,
  needsPublishPermission,
  PUBLICATION_STATUSES,
  RESTRICTED_STATUSES,
  STATUS_ACTIONS,
  type FieldDef,
} from "@/features/cms/content-types";
import { cmsError } from "@/features/cms/errors";
import { PAGES } from "@/features/cms/pages";
import { formDataToValues, parseFields, parseSections, readSections } from "@/features/cms/schemas";

const UUID = "0b9f4a8e-5c1d-4f3a-9e2b-7d6c5b4a3f21";

const field = (def: Partial<FieldDef> & Pick<FieldDef, "kind">): FieldDef => ({ name: "value", ...def });
const parseOne = (def: FieldDef, raw: string | string[] | undefined) =>
  parseFields([def], { value: raw ?? "" });

describe("CMS field parsing (shared by the browser and the server actions)", () => {
  it("requires required text and stores empty optional text as null", () => {
    expect(parseOne(field({ kind: "text", required: true }), "   ")).toEqual({
      success: false,
      errors: { value: "required" },
    });
    expect(parseOne(field({ kind: "textarea" }), "\n \n")).toEqual({ success: true, data: { value: null } });
  });

  it("counts length in code points, like PostgreSQL char_length", () => {
    const def = field({ kind: "text", max: 3 });
    expect(parseOne(def, "ሠርግ")).toEqual({ success: true, data: { value: "ሠርግ" } });
    expect(parseOne(def, "🍲🍲🍲")).toEqual({ success: true, data: { value: "🍲🍲🍲" } });
    expect(parseOne(def, "ሠርጎች")).toEqual({ success: false, errors: { value: "tooLong" } });
  });

  it("normalises text and strips invisible and bidirectional control characters", () => {
    expect(parseOne(field({ kind: "text" }), "  Wedding‮  feasts​ ")).toEqual({
      success: true,
      data: { value: "Wedding feasts" },
    });
    expect(parseOne(field({ kind: "markup" }), "One\r\n\r\n\r\n\r\nTwo  \u0007")).toEqual({
      success: true,
      data: { value: "One\n\nTwo" },
    });
  });

  it("accepts only well-formed, lowercase slugs", () => {
    const slug = field({ kind: "slug", required: true });
    expect(parseOne(slug, " Wedding-Feasts ")).toEqual({ success: true, data: { value: "wedding-feasts" } });
    for (const bad of ["wedding feasts", "-feasts", "feasts-", "a--b", "ሠርግ", "a/b", "x".repeat(81)]) {
      expect(parseOne(slug, bad), bad).toEqual({ success: false, errors: { value: "invalidSlug" } });
    }
    expect(parseOne(slug, "")).toEqual({ success: false, errors: { value: "required" } });
  });

  it("parses display order as a bounded integer, defaulting to 0", () => {
    const order = field({ kind: "order" });
    expect(parseOne(order, "")).toEqual({ success: true, data: { value: 0 } });
    expect(parseOne(order, "-12")).toEqual({ success: true, data: { value: -12 } });
    for (const bad of ["1.5", "ten", "10000", "1e3x"]) {
      expect(parseOne(order, bad), bad).toEqual({ success: false, errors: { value: "invalidNumber" } });
    }
  });

  it("accepts only UUIDs for image and category references", () => {
    expect(parseOne(field({ kind: "image" }), "")).toEqual({ success: true, data: { value: null } });
    expect(parseOne(field({ kind: "image" }), UUID)).toEqual({ success: true, data: { value: UUID } });
    expect(parseOne(field({ kind: "category", required: true }), "")).toEqual({
      success: false,
      errors: { value: "required" },
    });
    for (const bad of ["1", "../etc/passwd", `${UUID}'; drop table x;--`, UUID.toUpperCase()]) {
      expect(parseOne(field({ kind: "image" }), bad), bad).toEqual({
        success: false,
        errors: { value: "invalidChoice" },
      });
    }
  });

  it("accepts only known dietary tags and event types", () => {
    expect(parseOne(field({ kind: "dietary" }), ["vegan", "vegan", "fasting"])).toEqual({
      success: true,
      data: { value: ["vegan", "fasting"] },
    });
    expect(parseOne(field({ kind: "dietary" }), ["vegan", "gluten-free"])).toEqual({
      success: false,
      errors: { value: "invalidChoice" },
    });
    expect(parseOne(field({ kind: "eventType" }), "wedding")).toEqual({
      success: true,
      data: { value: "wedding" },
    });
    expect(parseOne(field({ kind: "eventType" }), "")).toEqual({ success: true, data: { value: null } });
    expect(parseOne(field({ kind: "eventType" }), "rave")).toEqual({
      success: false,
      errors: { value: "invalidChoice" },
    });
  });

  it("reports every invalid field of a content type at once, and ignores unknown form fields", () => {
    const result = parseFields(CONTENT.service.translationFields, {
      title: "",
      summary: "x".repeat(501),
      status: "published",
      created_by: UUID,
    });
    expect(result).toEqual({ success: false, errors: { title: "required", summary: "tooLong" } });

    const valid = parseFields(CONTENT.service.translationFields, { title: "Weddings", status: "published" });
    expect(valid.success && Object.keys(valid.data).sort()).toEqual(
      ["body", "seo_description", "seo_title", "summary", "title"].sort(),
    );
  });
});

describe("page sections", () => {
  const home = PAGES.home;

  it("parses only the page's known sections and omits empty fields", () => {
    expect(
      parseSections(home, {
        "sections.hero.headline": "Ethiopian cuisine",
        "sections.hero.lede": "  ",
        "sections.unknown.headline": "ignored",
        "sections.hero.script": "ignored",
      }),
    ).toEqual({ success: true, data: { hero: { headline: "Ethiopian cuisine" } } });
  });

  it("reports errors under the form field name", () => {
    expect(
      parseSections(home, { "sections.hero.headline": "", "sections.about.body": "x".repeat(4001) }),
    ).toEqual({
      success: false,
      errors: { "sections.hero.headline": "required", "sections.about.body": "tooLong" },
    });
  });

  it("reads stored sections defensively", () => {
    expect(readSections(home, null)).toEqual({});
    expect(readSections(home, ["hero"])).toEqual({});
    expect(
      readSections(home, {
        hero: { headline: "Feasts", lede: 42, eyebrow: "   ", extra: "dropped" },
        about: { body: "x".repeat(4001) },
        services: ["not", "an", "object"],
        unknown: { heading: "dropped" },
      }),
    ).toEqual({ hero: { headline: "Feasts" } });
  });
});

describe("form data", () => {
  it("keeps repeated fields as arrays and skips files", () => {
    const data = new FormData();
    data.append("title", "Weddings");
    data.append("dietary_tags", "vegan");
    data.append("dietary_tags", "fasting");
    data.append("file", new Blob(["x"]), "x.txt");
    expect(formDataToValues(data)).toEqual({ title: "Weddings", dietary_tags: ["vegan", "fasting"] });
  });
});

describe("database errors shown to staff", () => {
  it("map to stable codes without exposing database text", () => {
    expect(cmsError({ code: "42501", message: "Not authorized to change published content" })).toBe(
      "forbidden",
    );
    expect(cmsError({ code: "23505", message: 'violates unique constraint "services_slug_unique"' })).toBe(
      "slugTaken",
    );
    expect(
      cmsError({ code: "23505", message: 'violates unique constraint "service_translations_pkey"' }),
    ).toBe("translationExists");
    expect(cmsError({ code: "P0001", hint: "review_required" })).toBe("reviewRequired");
    expect(cmsError({ code: "P0001", hint: null })).toBe("generic");
    expect(cmsError({ code: "22023", hint: "upload_missing" })).toBe("uploadMissing");
    expect(cmsError({ code: "23514" })).toBe("invalid");
    expect(cmsError({ code: "XX000", message: "internal" })).toBe("generic");
    expect(cmsError({})).toBe("generic");
  });

  it("explain a restricted delete as 'in use' on PostgreSQL 17 and 18", () => {
    for (const code of ["23503", "23001"]) {
      expect(cmsError({ code }, "delete"), code).toBe("inUse");
      expect(cmsError({ code }, "save"), code).toBe("invalid");
    }
  });
});

describe("workflow rules (mirror private.enforce_publish_permission)", () => {
  it("need publishing rights to enter, leave or stay in published or archived", () => {
    for (const from of PUBLICATION_STATUSES) {
      for (const to of PUBLICATION_STATUSES) {
        expect(needsPublishPermission(from, to), `${from} → ${to}`).toBe(
          RESTRICTED_STATUSES.has(from) || RESTRICTED_STATUSES.has(to),
        );
      }
    }
    expect(needsPublishPermission("draft", "in_review")).toBe(false);
    expect(needsPublishPermission("in_review", "draft")).toBe(false);
  });

  it("offer only real transitions", () => {
    for (const [from, targets] of Object.entries(STATUS_ACTIONS)) {
      expect(targets, from).not.toContain(from);
    }
    expect(STATUS_ACTIONS.archived).toEqual(["draft"]);
  });
});
