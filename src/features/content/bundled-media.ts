import type { StaticImageData } from "next/image";
import type { Localized } from "@/lib/localization/translations";
import { chefPhotos, GALLERY_PHOTOS, HOME_PHOTOS, SLOTS, type ChefPhotoKey } from "./chef-photos";
import { dishes } from "./dishes";
import { foodStories } from "./food-stories";
import { homeContent } from "./home-content";
import { samplePhotos, type SamplePhoto } from "./sample-photos";
import { sampleVideos } from "./sample-videos";

/*
 * The photographs and videos that ship with the site, as the media library sees
 * them. Each has a row in public.media_assets with the same key (bundled_key,
 * seeded by migration 20261104100000; a test keeps the two in step), which lets
 * staff edit its description, replace its file or take it off the site. Adding a
 * bundled file therefore also needs a migration.
 */

export const chefMediaKey = (key: string) => `chef/${key}`;
export const sampleMediaKey = (key: string) => `sample/${key}`;
export const videoMediaKey = (key: string) => `video/${key}`;

/** Where a bundled file appears on the website, for staff deciding what to change. */
export type BundledPlacement =
  | { place: "hero" | "about" | "mosaic" | "gallery" | "reel" }
  | { place: "service" | "story" | "dish"; name: Localized };

export type MediaCredit = SamplePhoto["credit"];

export type BundledMedia = { alt: Localized; credit: MediaCredit | null; placements: BundledPlacement[] } & (
  | { kind: "image"; src: StaticImageData }
  | { kind: "video"; src: string; poster: string; width: number; height: number }
);

const serviceName = (slug: string): Localized =>
  homeContent.services.items.find((item) => item.slug === slug)?.title ?? { en: slug };

function chefPlacements(key: ChefPhotoKey): BundledPlacement[] {
  const placements: BundledPlacement[] = [];
  for (const [slot, photo] of Object.entries(SLOTS)) {
    if (photo !== key) continue;
    if (slot === "hero" || slot === "about") placements.push({ place: slot });
    else placements.push({ place: "service", name: serviceName(slot) });
  }
  if (HOME_PHOTOS.includes(key)) placements.push({ place: "mosaic" });
  if (GALLERY_PHOTOS.includes(key)) placements.push({ place: "gallery" });
  return placements;
}

function samplePlacements(key: string): BundledPlacement[] {
  return [
    ...homeContent.services.items
      .filter((item) => item.slug === key)
      .map((item): BundledPlacement => ({ place: "service", name: item.title })),
    ...foodStories
      .filter((story) => story.photo === key)
      .map((story): BundledPlacement => ({ place: "story", name: story.title })),
    ...dishes
      .filter((dish) => dish.photo === key)
      .map((dish): BundledPlacement => ({ place: "dish", name: dish.name })),
  ];
}

export const BUNDLED_MEDIA: ReadonlyMap<string, BundledMedia> = new Map<string, BundledMedia>([
  ...(Object.keys(chefPhotos) as ChefPhotoKey[]).map((key): [string, BundledMedia] => [
    chefMediaKey(key),
    {
      kind: "image",
      src: chefPhotos[key].src,
      alt: chefPhotos[key].alt,
      credit: null,
      placements: chefPlacements(key),
    },
  ]),
  ...Object.entries(samplePhotos).map(([key, photo]): [string, BundledMedia] => [
    sampleMediaKey(key),
    {
      kind: "image",
      src: photo.src,
      alt: photo.alt,
      credit: photo.credit,
      placements: samplePlacements(key),
    },
  ]),
  ...sampleVideos.map((video): [string, BundledMedia] => [
    videoMediaKey(video.key),
    {
      kind: "video",
      src: video.src,
      poster: video.poster,
      width: 960,
      height: 600,
      alt: video.description,
      credit: video.credit,
      placements: [{ place: "reel" }],
    },
  ]),
]);
