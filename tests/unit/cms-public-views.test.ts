import { describe, expect, it } from "vitest";
import type {
  PublicImage,
  PublicMenuCategory,
  PublicPage,
  PublicServiceCard,
} from "@/features/cms/public-data";
import { aboutSections, galleryView, menuView, pageContent, serviceCards } from "@/features/cms/public-views";

/*
 * Published data → public view models: the language fallback policy
 * (requested language, else English marked lang="en", never Amharic on an
 * English page) and defensive handling of incomplete content.
 */

const image: PublicImage = {
  path: "assets/0b9f4a8e-5c1d-4f3a-9e2b-7d6c5b4a3f21/0123456789abcdef0123456789abcdef.jpg",
  width: 1200,
  height: 800,
  credit: null,
  alt: { en: "A table of injera and stews" },
};

const service = (slug: string, translations: PublicServiceCard["translations"]): PublicServiceCard => ({
  slug,
  image: null,
  translations,
});

describe("service cards", () => {
  const services = [
    service("weddings", {
      en: { title: "Weddings", summary: "Feasts" },
      am: { title: "ሠርግ", summary: null },
    }),
    service("summits", { en: { title: "Summits", summary: null } }),
    service("amharic-only", { am: { title: "ጉባኤ", summary: null } }),
  ];

  it("use the requested language and link each service", () => {
    expect(serviceCards(services, "am")[0]).toMatchObject({
      key: "weddings",
      href: "/services/weddings",
      title: { text: "ሠርግ", lang: undefined },
      summary: null,
    });
  });

  it("fall back to English on the Amharic site, marked as English", () => {
    expect(serviceCards(services, "am")[1]).toMatchObject({ title: { text: "Summits", lang: "en" } });
  });

  it("never show Amharic on the English site", () => {
    expect(serviceCards(services, "en").map((card) => card.key)).toEqual(["weddings", "summits"]);
  });
});

describe("menu", () => {
  const category = (slug: string, items: PublicMenuCategory["items"]): PublicMenuCategory => ({
    slug,
    translations: { en: { name: slug, description: null } },
    items,
  });

  it("hides categories without a dish shown in this language", () => {
    const menu = [
      category("mains", [
        {
          id: "1",
          dietary_tags: ["fasting"],
          image: null,
          translations: { am: { name: "ሽሮ", description: null } },
        },
      ]),
    ];
    expect(menuView(menu, "en")).toEqual([]);
    expect(menuView(menu, "am")[0]?.items[0]).toMatchObject({ name: { text: "ሽሮ" }, tags: ["fasting"] });
  });
});

describe("gallery", () => {
  it("skips photos without an image and labels the event type", () => {
    const items = galleryView(
      [
        { id: "1", event_type: "wedding", image, translations: {} },
        { id: "2", event_type: null, image: null, translations: { en: { caption: "Missing" } } },
      ] as Parameters<typeof galleryView>[0],
      "am",
      (type) => `label:${type}`,
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      caption: null,
      event: "label:wedding",
      image: { alt: image.alt.en, altLang: "en" },
    });
  });
});

describe("pages", () => {
  const page = {
    key: "about",
    translations: {
      en: {
        title: "About",
        seo_title: null,
        seo_description: null,
        sections: {
          intro: { heading: "The chef", body: "Story" },
          story: { body: 42 },
          injected: { x: "y" },
        },
      },
    },
    images: { portrait: image },
  } as unknown as PublicPage;

  it("read only known sections, in the fallback language", () => {
    const content = pageContent(page, "about", "am");
    expect(content).toMatchObject({
      lang: "en",
      title: "About",
      sections: { intro: { heading: "The chef" } },
    });
    expect(Object.keys(content!.sections)).toEqual(["intro"]);
    expect(aboutSections(content!)).toEqual([
      expect.objectContaining({
        key: "intro",
        heading: { text: "The chef", lang: "en" },
        image: expect.any(Object),
      }),
    ]);
  });

  it("return nothing without a translation to show", () => {
    expect(pageContent(null, "about", "en")).toBeNull();
    expect(pageContent({ ...page, translations: {} } as PublicPage, "about", "en")).toBeNull();
  });
});
