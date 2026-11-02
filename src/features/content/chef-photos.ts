import type { StaticImageData } from "next/image";
import banquetHall from "@/assets/chef/banquet-hall.jpg";
import beefRisotto from "@/assets/chef/beef-risotto.jpg";
import buffetHall from "@/assets/chef/buffet-hall.jpg";
import chefAtBuffet from "@/assets/chef/chef-at-buffet.jpg";
import chefAtStove from "@/assets/chef/chef-at-stove.jpg";
import chefBuffetTrays from "@/assets/chef/chef-buffet-trays.jpg";
import chefChafingLine from "@/assets/chef/chef-chafing-line.jpg";
import chickenPlatter from "@/assets/chef/chicken-platter.jpg";
import crumbedCutlets from "@/assets/chef/crumbed-cutlets.jpg";
import eveningBuffet from "@/assets/chef/evening-buffet.jpg";
import fingerFood from "@/assets/chef/finger-food.jpg";
import friedPotatoes from "@/assets/chef/fried-potatoes.jpg";
import injeraPlatter from "@/assets/chef/injera-platter.jpg";
import meatAndRice from "@/assets/chef/meat-and-rice.jpg";
import roastDrumsticks from "@/assets/chef/roast-drumsticks.jpg";
import saladPlatters from "@/assets/chef/salad-platters.jpg";
import salmonBowl from "@/assets/chef/salmon-bowl.jpg";
import sushiPlatter from "@/assets/chef/sushi-platter.jpg";
import toppedToast from "@/assets/chef/topped-toast.jpg";
import vegetablePlatter from "@/assets/chef/vegetable-platter.jpg";
import type { AppLocale } from "@/i18n/routing";
import { resolveLocalized } from "@/lib/localization/translations";
import type { SitePhoto } from "./site-photo";

/*
 * CHEF SIS'S OWN PHOTOGRAPHS
 * ---------------------------------------------------------------------------
 * The chef's buffets, platters, plated dishes and kitchen, supplied by the owner
 * on 2026-11-02 as phone pictures. They fill the homepage hero, "Meet CHEF SIS",
 * three service cards, the homepage photo mosaic and the /gallery page until
 * photography is published through the media library (a published image always
 * takes precedence). Being CHEF SIS's own, they carry no credit.
 *
 * The files in src/assets/chef are as supplied (at most 1280px, no camera
 * metadata), except that four lost their bottom 8%, which held a camera-model
 * stamp. Left out at the owner's request: photos showing guests' faces, recipe
 * cards and stock-style pictures that are not the chef's work. Descriptions are
 * English only until a fluent speaker writes the Amharic ones.
 */

/** "event": a buffet, hall or the chef at work; "dish": a tray, platter or plate. */
export type ChefPhotoKind = "event" | "dish";

export type ChefPhoto = SitePhoto & { kind: ChefPhotoKind };

/** In gallery order, events and dishes mixed. */
export const chefPhotos = {
  "chicken-platter": {
    src: chickenPlatter,
    kind: "dish",
    alt: {
      en: "Roast chicken drumsticks piled on a steel tray, ringed with orange pepper and topped with a yellow pepper cut into a flower.",
    },
  },
  "chef-at-buffet": {
    src: chefAtBuffet,
    kind: "event",
    alt: {
      en: "A chef in a white coat and toque points along a line of chafing dishes, beside a tray of roast chicken.",
    },
  },
  "sushi-platter": {
    src: sushiPlatter,
    kind: "dish",
    alt: { en: "Rows of sushi rolls laid out on a banana leaf." },
  },
  "injera-platter": {
    src: injeraPlatter,
    kind: "dish",
    alt: {
      en: "A round platter of injera with dark red stews, fresh ayib cheese and green chillies, rolled injera around the edge.",
    },
  },
  "banquet-hall": {
    src: banquetHall,
    kind: "event",
    alt: {
      en: "A banquet room with platters of food on a red tablecloth, chafing dishes along the wall and woven mesob baskets at the side.",
    },
  },
  "finger-food": {
    src: fingerFood,
    kind: "dish",
    alt: {
      en: "Trays of finger food on cocktail sticks, a platter of halved eggs and a plate of small round bites.",
    },
  },
  "salad-platters": {
    src: saladPlatters,
    kind: "dish",
    alt: { en: "A row of oval platters of salads on a red cloth, decorated with tomato roses." },
  },
  "chef-chafing-line": {
    src: chefChafingLine,
    kind: "event",
    alt: { en: "A chef in a white coat beside a long row of steel chafing dishes in a banquet hall." },
  },
  "roast-drumsticks": {
    src: roastDrumsticks,
    kind: "dish",
    alt: { en: "A steel tray packed with rows of roasted chicken drumsticks." },
  },
  "vegetable-platter": {
    src: vegetablePlatter,
    kind: "dish",
    alt: {
      en: "A large injera platter of split peas, lentils, greens and other vegetable dishes around a fresh salad.",
    },
  },
  "evening-buffet": {
    src: eveningBuffet,
    kind: "event",
    alt: {
      en: "An evening buffet table of carved fruit, salads and meat platters, with a flame burning at the back.",
    },
  },
  "beef-risotto": {
    src: beefRisotto,
    kind: "dish",
    alt: { en: "Dark braised beef on risotto with green peas, on a white plate." },
  },
  "buffet-hall": {
    src: buffetHall,
    kind: "event",
    alt: {
      en: "A long buffet of chafing dishes down one side of a hall, with a chef walking between the tables.",
    },
  },
  "salmon-bowl": {
    src: salmonBowl,
    kind: "dish",
    alt: {
      en: "Glazed salmon pieces in a white bowl with ribbons of courgette and carrot, edamame beans and sesame seeds.",
    },
  },
  "chef-at-stove": {
    src: chefAtStove,
    kind: "event",
    alt: { en: "A chef in a dark coat and white toque cooking at large pots in a restaurant kitchen." },
  },
  "topped-toast": {
    src: toppedToast,
    kind: "dish",
    alt: {
      en: "Thick toast topped with a creamy filling, a dark glaze and fine strips of cucumber and red onion.",
    },
  },
  "meat-and-rice": {
    src: meatAndRice,
    kind: "dish",
    alt: { en: "A plate of stewed meat in a dark sauce with two mounds of rice, on lettuce." },
  },
  "crumbed-cutlets": {
    src: crumbedCutlets,
    kind: "dish",
    alt: { en: "A steel tray piled high with golden breadcrumbed cutlets." },
  },
  "chef-buffet-trays": {
    src: chefBuffetTrays,
    kind: "event",
    alt: { en: "A chef in a white coat beside a counter of steel trays filled with stews, rice and meat." },
  },
  "fried-potatoes": {
    src: friedPotatoes,
    kind: "dish",
    alt: { en: "A steel tray of golden fried potato slices." },
  },
} satisfies Record<string, ChefPhoto>;

export type ChefPhotoKey = keyof typeof chefPhotos;

/** Page slots with one of these photographs: the homepage hero and "Meet CHEF SIS", and service cards by slug. */
const SLOTS: Record<string, ChefPhotoKey> = {
  hero: "chef-at-buffet",
  about: "chef-chafing-line",
  weddings: "banquet-hall",
  "corporate-events": "finger-food",
  "summits-and-conferences": "buffet-hall",
};

/** The photograph for a slot or service slug, if there is one. */
export function chefPhotoFor(slot: string): ChefPhoto | null {
  return Object.hasOwn(SLOTS, slot) ? chefPhotos[SLOTS[slot]] : null;
}

/**
 * The homepage mosaic, in tile order: a large tile, a tall one, then single
 * tiles. None repeats a photograph shown in a slot higher up the page.
 */
export const HOME_PHOTOS: ChefPhotoKey[] = [
  "salad-platters",
  "sushi-platter",
  "chicken-platter",
  "injera-platter",
  "vegetable-platter",
  "beef-risotto",
  "chef-at-stove",
  "evening-buffet",
];

export const GALLERY_PHOTOS = Object.keys(chefPhotos) as ChefPhotoKey[];

/** A photograph ready for the mosaic, the gallery and the photo viewer (client components). */
export type GalleryPhoto = {
  key: ChefPhotoKey;
  src: StaticImageData;
  alt: string;
  lang?: string;
  kind: ChefPhotoKind;
};

export function galleryPhotos(keys: ChefPhotoKey[], locale: AppLocale): GalleryPhoto[] {
  return keys.map((key) => {
    const { src, alt, kind } = chefPhotos[key];
    const description = resolveLocalized(alt, locale);
    return { key, src, alt: description?.text ?? "", lang: description?.lang, kind };
  });
}
