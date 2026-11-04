import { describe, expect, it } from "vitest";
import type { PublicSiteMediaRow } from "@/features/cms/public-data";
import { siteMedia } from "@/features/cms/site-media";
import { BUNDLED_MEDIA } from "@/features/content/bundled-media";
import { chefPhotos, HOME_PHOTOS, SLOTS } from "@/features/content/chef-photos";
import { dishes } from "@/features/content/dishes";
import { foodStories } from "@/features/content/food-stories";
import { samplePhotos } from "@/features/content/sample-photos";
import { sampleVideos } from "@/features/content/sample-videos";
import { sniffVideoType, VIDEO_TYPES } from "@/features/media/video";

const ID = "11111111-1111-4111-8111-111111111111";
const IMAGE_PATH = `assets/${ID}/${"a".repeat(32)}.jpg`;
const VIDEO_PATH = `assets/${ID}/${"b".repeat(32)}.mp4`;

const row = (fields: Partial<PublicSiteMediaRow>): PublicSiteMediaRow => ({
  id: ID,
  key: null,
  kind: "image",
  removed: false,
  credit: null,
  alt: {},
  file: null,
  ...fields,
});

describe("the bundled media catalogue", () => {
  it("holds every photograph and video the site ships", () => {
    expect(BUNDLED_MEDIA.size).toBe(
      Object.keys(chefPhotos).length + Object.keys(samplePhotos).length + sampleVideos.length,
    );
  });

  it("says where each file appears, so staff can decide what to change", () => {
    for (const [key, file] of BUNDLED_MEDIA) {
      expect(file.placements.length, key).toBeGreaterThan(0);
    }
    expect(BUNDLED_MEDIA.get(`chef/${SLOTS.hero}`)?.placements).toContainEqual({ place: "hero" });
    expect(BUNDLED_MEDIA.get(`chef/${HOME_PHOTOS[0]}`)?.placements).toContainEqual({ place: "mosaic" });
    expect(BUNDLED_MEDIA.get("video/platter")?.placements).toEqual([{ place: "reel" }]);
    expect(BUNDLED_MEDIA.get(`sample/${foodStories[0]!.photo}`)?.placements[0]?.place).toBe("story");
    expect(BUNDLED_MEDIA.get(`sample/${dishes[0]!.photo}`)?.placements[0]?.place).toBe("dish");
  });

  it("marks samples, which need a credit, and the chef's own photographs, which do not", () => {
    expect(BUNDLED_MEDIA.get("sample/injera")?.credit?.author).toBe(samplePhotos.injera.credit.author);
    expect(BUNDLED_MEDIA.get("chef/banquet-hall")?.credit).toBeNull();
  });
});

describe("the website's media as they stand", () => {
  it("are as bundled when the database has nothing to say, or cannot be read", () => {
    for (const rows of [null, []]) {
      const site = siteMedia(rows);
      expect(site.chef("banquet-hall")).toEqual(chefPhotos["banquet-hall"]);
      expect(site.sample("injera")).toEqual(samplePhotos.injera);
      expect(site.videos().map((clip) => clip.key)).toEqual(sampleVideos.map((video) => video.key));
      expect(site.gallery("en")).toHaveLength(Object.keys(chefPhotos).length);
      expect(site.bundledInUse("sample/injera")).toBe(true);
    }
  });

  it("use staff's descriptions, and keep the bundled one for a language they did not touch", () => {
    const site = siteMedia([row({ key: "chef/banquet-hall", alt: { am: "የግብዣ አዳራሽ" } })]);
    expect(site.chef("banquet-hall")?.alt).toEqual({
      en: chefPhotos["banquet-hall"].alt.en,
      am: "የግብዣ አዳራሽ",
    });
    expect(site.chef("banquet-hall")?.src).toBe(chefPhotos["banquet-hall"].src);
  });

  it("show the upload in place of a replaced file, with no blur placeholder and the upload's own description", () => {
    const file = { path: IMAGE_PATH, width: 800, height: 600 };
    const site = siteMedia([row({ key: "chef/banquet-hall", file, alt: { en: "New" } })]);
    const photo = site.chef("banquet-hall");
    expect(photo?.src).toEqual({ src: `/media/${IMAGE_PATH}`, width: 800, height: 600 });
    expect(photo?.src.blurDataURL).toBeUndefined();
    expect(photo?.alt).toEqual({ en: "New" });
    // Its kind still files it in the gallery.
    expect(photo?.kind).toBe(chefPhotos["banquet-hall"].kind);
  });

  it("do not describe an upload with the words of the file it replaced", () => {
    const file = { path: IMAGE_PATH, width: 800, height: 600 };
    const site = siteMedia([row({ key: "chef/banquet-hall", file })]);
    expect(site.chef("banquet-hall")?.alt).toEqual({});
  });

  it("leave out what was deleted, and tell a deleted slot from one that never had a photo", () => {
    const site = siteMedia([
      row({ key: `chef/${SLOTS.hero}`, removed: true }),
      row({ key: "sample/injera", removed: true }),
    ]);
    expect(site.chef(SLOTS.hero!)).toBeNull();
    expect(site.sample("injera")).toBeNull();
    expect(site.slot("hero")).toBeNull();
    expect(site.slot("about")).toEqual(chefPhotos[SLOTS.about!]);
    expect(site.slot("no-such-service")).toBeUndefined();
    expect(site.gallery("en").map((photo) => photo.key)).not.toContain(SLOTS.hero);
  });

  it("find service cards by slug, among the chef's photographs and then the samples", () => {
    const site = siteMedia(null);
    expect(site.slot("weddings")).toEqual(chefPhotos[SLOTS.weddings!]);
    expect(site.slot("culinary-experiences")).toEqual(samplePhotos["culinary-experiences"]);
    // Never an inherited property of the lookup tables.
    expect(site.slot("constructor")).toBeUndefined();
  });

  it("keep the homepage mosaic full, without repeating the hero or Meet CHEF SIS", () => {
    const deleted = HOME_PHOTOS[1]!;
    const site = siteMedia([row({ key: `chef/${deleted}`, removed: true })]);
    const keys = site.mosaic("en").map((photo) => photo.key);
    expect(keys).toHaveLength(HOME_PHOTOS.length);
    expect(keys).not.toContain(deleted);
    expect(keys).not.toContain(SLOTS.hero);
    expect(keys).not.toContain(SLOTS.about);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("empty the mosaic only when every photograph is gone", () => {
    const site = siteMedia(Object.keys(chefPhotos).map((key) => row({ key: `chef/${key}`, removed: true })));
    expect(site.mosaic("en")).toEqual([]);
    expect(site.gallery("en")).toEqual([]);
  });

  it("list uploaded videos first, then the bundled clips still on the site", () => {
    const site = siteMedia([
      row({
        id: "uploaded",
        kind: "video",
        alt: { en: "Mine" },
        file: { path: VIDEO_PATH, width: 1280, height: 720 },
      }),
      row({ key: "video/ceremony", kind: "video", removed: true }),
      row({
        key: "video/shared",
        kind: "video",
        alt: { en: "Replaced" },
        file: { path: VIDEO_PATH, width: 1280, height: 720 },
      }),
      row({ key: "video/platter", kind: "video", alt: { en: "Edited" } }),
    ]);
    const clips = site.videos();
    expect(clips[0]).toEqual({
      key: "uploaded",
      src: `/media/${VIDEO_PATH}`,
      preview: `/media/${VIDEO_PATH}`,
      poster: null,
      description: { en: "Mine" },
    });
    expect(clips.map((clip) => clip.key)).not.toContain("ceremony");
    const shared = clips.find((clip) => clip.key === "shared");
    expect(shared).toMatchObject({
      src: `/media/${VIDEO_PATH}`,
      poster: null,
      description: { en: "Replaced" },
    });
    const platter = clips.find((clip) => clip.key === "platter");
    expect(platter).toMatchObject({ src: "/videos/injera-platter.mp4", description: { en: "Edited" } });
    expect(platter?.poster).toBe("/videos/injera-platter.jpg");
  });

  it("credit a bundled sample only while it is the file on the site", () => {
    const file = { path: IMAGE_PATH, width: 800, height: 600 };
    const site = siteMedia([
      row({ key: "sample/injera", removed: true }),
      row({ key: "sample/wat", file }),
      row({ key: "sample/fasting", alt: { en: "Edited" } }),
    ]);
    expect(site.bundledInUse("sample/injera")).toBe(false);
    expect(site.bundledInUse("sample/wat")).toBe(false);
    expect(site.bundledInUse("sample/fasting")).toBe(true);
  });

  it("list an upload's credit once staff recorded one", () => {
    const image = { path: IMAGE_PATH, width: 800, height: 600 };
    const video = { path: VIDEO_PATH, width: 1280, height: 720 };
    const site = siteMedia([
      row({ id: "a", key: "sample/wat", file: image, credit: "A. Photographer", alt: { en: "Stew" } }),
      row({ id: "b", kind: "video", file: video, credit: "A. Filmmaker" }),
      row({ id: "c", key: "sample/injera", file: image }),
      row({ id: "d", key: "sample/fasting", removed: true, credit: "Stale" }),
    ]);
    expect(site.uploadedCredits()).toEqual([
      {
        key: "a",
        kind: "image",
        thumbnail: { src: `/media/${IMAGE_PATH}`, width: 800, height: 600 },
        description: { en: "Stew" },
        credit: "A. Photographer",
      },
      { key: "b", kind: "video", thumbnail: null, description: {}, credit: "A. Filmmaker" },
    ]);
  });
});

describe("video signatures", () => {
  const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
  const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0, 0, 0]);

  it("recognise MP4 and WebM by their content", () => {
    expect(sniffVideoType(mp4)).toBe("video/mp4");
    expect(sniffVideoType(webm)).toBe("video/webm");
    expect(Object.keys(VIDEO_TYPES)).toEqual(["video/mp4", "video/webm"]);
  });

  it("refuse anything else, whatever it is called", () => {
    const text = (value: string) => new TextEncoder().encode(value);
    expect(sniffVideoType(text("<html><script>alert(1)</script>"))).toBeNull();
    expect(sniffVideoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBeNull();
    expect(sniffVideoType(new Uint8Array())).toBeNull();
  });
});
