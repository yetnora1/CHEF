import dishAyibGomen from "@/assets/samples/dish-ayib-gomen.jpg";
import dishBeyaynetu from "@/assets/samples/dish-beyaynetu.jpg";
import dishDoroWat from "@/assets/samples/dish-doro-wat.jpg";
import dishGomen from "@/assets/samples/dish-gomen.jpg";
import dishKikAlicha from "@/assets/samples/dish-kik-alicha.jpg";
import dishKitfo from "@/assets/samples/dish-kitfo.jpg";
import dishShiro from "@/assets/samples/dish-shiro.jpg";
import dishTibs from "@/assets/samples/dish-tibs.jpg";
import serviceCulinaryExperiences from "@/assets/samples/service-culinary-experiences.jpg";
import storyFasting from "@/assets/samples/story-fasting.jpg";
import storyInjera from "@/assets/samples/story-injera.jpg";
import storyWat from "@/assets/samples/story-wat.jpg";
import type { SitePhoto } from "./site-photo";

/*
 * SAMPLE PHOTOGRAPHY — not CHEF SIS's work
 * ---------------------------------------------------------------------------
 * Openly licensed photographs from Wikimedia Commons for the photo slots that
 * CHEF SIS's own photographs (chef-photos.ts) do not cover: the food stories,
 * the dishes and the culinary experiences card. A photo published through the
 * media library always takes precedence. The images carry no caption: the
 * credits page (/credits, linked from every page's footer) names each
 * photographer, licence and source, and says plainly that these are samples, not
 * the chef's food or events. None shows an identifiable face.
 *
 * Files in src/assets/samples are resized to 1600px on the long edge (the
 * dish-* photos, shown smaller, to 1200x900 4:3 crops); the
 * licences (CC BY / CC BY-SA) allow this with attribution, and the resized
 * copies keep the original licence. Descriptions are English only until a
 * fluent speaker writes the Amharic ones (docs/DESIGN_SYSTEM.md → Images).
 */

export type SamplePhoto = SitePhoto & {
  credit: { author: string; license: string; source: string };
};

export const samplePhotos = {
  "culinary-experiences": {
    src: serviceCulinaryExperiences,
    alt: { en: "A jebena on a charcoal stove beside a pan of freshly roasted coffee beans." },
    credit: {
      author: "Radosław Botev",
      license: "CC BY 3.0 PL",
      source: "https://commons.wikimedia.org/wiki/File:Ethiopian_Coffee_Ceremony_(1).jpg",
    },
  },
  injera: {
    src: storyInjera,
    alt: { en: "A freshly baked injera lifted from the griddle in a smoky kitchen." },
    credit: {
      author: "Natnael Tadele",
      license: "CC BY-SA 4.0",
      source: "https://commons.wikimedia.org/wiki/File:Fresh_Injera.JPG",
    },
  },
  wat: {
    src: storyWat,
    alt: { en: "A bowl of deep red doro wat with a hard-boiled egg, beside injera." },
    credit: {
      author: "stu_spivack",
      license: "CC BY-SA 2.0",
      source: "https://commons.wikimedia.org/wiki/File:Ethiopian_wat.jpg",
    },
  },
  fasting: {
    src: storyFasting,
    alt: { en: "A fasting platter of injera with lentils, split peas, greens, beetroot and potatoes." },
    credit: {
      author: "Rod Waddington",
      license: "CC BY-SA 2.0",
      source: "https://commons.wikimedia.org/wiki/File:Injera,_Fasting_Food,_Ethiopia_(11286899826).jpg",
    },
  },
  "dish-shiro": {
    src: dishShiro,
    alt: { en: "Shiro being spooned onto injera from a small black clay pot." },
    credit: {
      author: "David Stanley",
      license: "CC BY 2.0",
      source: "https://commons.wikimedia.org/wiki/File:Ethiopian_Shiro_(11354785095).jpg",
    },
  },
  "dish-kik-alicha": {
    src: dishKikAlicha,
    alt: { en: "A golden mound of kik alicha, yellow split peas, on injera beside gomen." },
    credit: {
      author: "stu_spivack",
      license: "CC BY-SA 2.0",
      source: "https://commons.wikimedia.org/wiki/File:KIK_ALICHA,_MISIR,_GOMEN_and_TIKIL_GOMEN.jpg",
    },
  },
  "dish-gomen": {
    src: dishGomen,
    alt: { en: "Dark, silky gomen, cooked collard greens, on injera between lentils and split peas." },
    credit: {
      author: "stu_spivack",
      license: "CC BY-SA 2.0",
      source: "https://commons.wikimedia.org/wiki/File:KIK_ALICHA,_MISIR,_GOMEN_and_TIKIL_GOMEN.jpg",
    },
  },
  "dish-beyaynetu": {
    src: dishBeyaynetu,
    alt: {
      en: "A tray of fasting beyaynetu: many small vegetable stews and salads on injera, with a green chilli.",
    },
    credit: {
      author: "Yonatan Solomon",
      license: "CC BY-SA 4.0",
      source: "https://commons.wikimedia.org/wiki/File:Beyaynetu_ethiopian_food.jpg",
    },
  },
  "dish-doro-wat": {
    src: dishDoroWat,
    alt: { en: "A piece of doro wat chicken and a hard-boiled egg in berbere sauce on injera." },
    credit: {
      author: "Edsel Little",
      license: "CC BY-SA 2.0",
      source: "https://commons.wikimedia.org/wiki/File:Injera_and_doro_wat.jpg",
    },
  },
  "dish-kitfo": {
    src: dishKitfo,
    alt: { en: "A platter of kitfo with ayib cheese, gomen, mitmita and rolled kocho bread on a leaf." },
    credit: {
      author: "Milo.G",
      license: "CC BY-SA 4.0",
      source: "https://commons.wikimedia.org/wiki/File:Kitfo_with_Ayibe..JPG",
    },
  },
  "dish-tibs": {
    src: dishTibs,
    alt: { en: "Tibs topped with green chilli in a clay pot over embers, with rolls of injera on a tray." },
    credit: {
      author: "Jean Rebiffé",
      license: "CC BY-SA 4.0",
      source: "https://commons.wikimedia.org/wiki/File:Tibs_in_Yod_Abyssinia.jpg",
    },
  },
  "dish-ayib-gomen": {
    src: dishAyibGomen,
    alt: { en: "Fresh white ayib cheese beside gomen on injera, with a bowl of red stew." },
    credit: {
      author: "stu_spivack",
      license: "CC BY-SA 2.0",
      source: "https://commons.wikimedia.org/wiki/File:Ayib_and_gomen.jpg",
    },
  },
} satisfies Record<string, SamplePhoto>;

/** The sample for a slot or service slug, if there is one. */
export function samplePhotoFor(key: string): SamplePhoto | null {
  return Object.hasOwn(samplePhotos, key) ? samplePhotos[key as keyof typeof samplePhotos] : null;
}
