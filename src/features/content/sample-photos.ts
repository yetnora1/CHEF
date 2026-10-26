import type { StaticImageData } from "next/image";
import type { Localized } from "@/lib/localization/translations";
import aboutCoffeeCeremony from "@/assets/samples/about-coffee-ceremony.jpg";
import heroFeast from "@/assets/samples/hero-feast.jpg";
import serviceCorporateEvents from "@/assets/samples/service-corporate-events.jpg";
import serviceCulinaryExperiences from "@/assets/samples/service-culinary-experiences.jpg";
import serviceSummits from "@/assets/samples/service-summits.jpg";
import serviceWeddings from "@/assets/samples/service-weddings.jpg";

/*
 * SAMPLE PHOTOGRAPHY — not Chief Harena's work
 * ---------------------------------------------------------------------------
 * Openly licensed photographs from Wikimedia Commons that fill the photo slots
 * until Chief Harena's own photography is published through the media library
 * (a published image always takes precedence). Every one is shown with a
 * visible "Sample photo" label and its credit, so none can be mistaken for the
 * chef's food or events. None shows an identifiable face.
 *
 * Files in src/assets/samples are resized to 1600px on the long edge; the
 * licences (CC BY / CC BY-SA) allow this with attribution, and the resized
 * copies keep the original licence. Descriptions are English only until a
 * fluent speaker writes the Amharic ones (docs/DESIGN_SYSTEM.md → Images).
 */

export type SamplePhoto = {
  src: StaticImageData;
  /** What the photograph shows, for the image's alt text. */
  alt: Localized;
  credit: { author: string; license: string; source: string };
};

export const samplePhotos = {
  hero: {
    src: heroFeast,
    alt: { en: "A table laid with rolled injera, bread, fresh cheese and bowls of stews and meat." },
    credit: {
      author: "FrogsLegs71",
      license: "CC BY-SA 3.0",
      source: "https://commons.wikimedia.org/wiki/File:Injera_and_traditional_platter_in_Ethopia.jpg",
    },
  },
  about: {
    src: aboutCoffeeCeremony,
    alt: {
      en: "A clay jebena of coffee above a brazier of smouldering incense, ready for a coffee ceremony.",
    },
    credit: {
      author: "ProtoplasmaKid",
      license: "CC BY-SA 4.0",
      source: "https://commons.wikimedia.org/wiki/File:Coffee_ceremony_of_Ethiopia_and_Eritrea_5.jpg",
    },
  },
  weddings: {
    src: serviceWeddings,
    alt: { en: "A large platter of injera topped with stews, greens, fresh cheese and boiled eggs." },
    credit: {
      author: "Miguel Discart",
      license: "CC BY-SA 2.0",
      source:
        "https://commons.wikimedia.org/wiki/File:A_formal_serving_of_wat_atop_injera_in_Brussels,_Belgium.jpg",
    },
  },
  "corporate-events": {
    src: serviceCorporateEvents,
    alt: {
      en: "Coffee ceremony sets laid out on fresh grass: clay jebenas, trays of small cups and roasted coffee.",
    },
    credit: {
      author: "Khajitdadddy",
      license: "CC BY-SA 4.0",
      source: "https://commons.wikimedia.org/wiki/File:Ethiopian_Coffee_Ceremony_Set.jpg",
    },
  },
  "summits-and-conferences": {
    src: serviceSummits,
    alt: { en: "A shared platter of injera with an assortment of meat and vegetable stews." },
    credit: {
      author: "Jean Rebiffé",
      license: "CC BY-SA 4.0",
      source: "https://commons.wikimedia.org/wiki/File:Non-fasting_Beyaynetu_in_Yod_Abyssinia_1.jpg",
    },
  },
  "culinary-experiences": {
    src: serviceCulinaryExperiences,
    alt: { en: "A jebena on a charcoal stove beside a pan of freshly roasted coffee beans." },
    credit: {
      author: "Radosław Botev",
      license: "CC BY 3.0 PL",
      source: "https://commons.wikimedia.org/wiki/File:Ethiopian_Coffee_Ceremony_(1).jpg",
    },
  },
} satisfies Record<string, SamplePhoto>;

/** The sample for a slot or service slug, if there is one. */
export function samplePhotoFor(key: string): SamplePhoto | null {
  return Object.hasOwn(samplePhotos, key) ? samplePhotos[key as keyof typeof samplePhotos] : null;
}
