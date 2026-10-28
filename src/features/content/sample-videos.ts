import type { Localized } from "@/lib/localization/translations";

/*
 * SAMPLE VIDEO — not CHEF SIS's work
 * ---------------------------------------------------------------------------
 * Short, silent loops of Ethiopian food from Pexels (Pexels License: free to use
 * and modify, no attribution required; credited anyway on /credits, where they
 * are also marked as samples). None shows an identifiable face. The files in
 * public/videos were shortened, cropped to 16:10, resized to 960px and
 * re-encoded without sound; each poster is the clip's first frame.
 *
 * Descriptions are English only until a fluent speaker writes the Amharic ones.
 */

export type SampleVideo = {
  key: string;
  src: string;
  poster: string;
  /** What the clip shows, for the credits page. */
  description: Localized;
  credit: { author: string; license: string; source: string };
};

export const sampleVideos: SampleVideo[] = [
  {
    key: "platter",
    src: "/videos/injera-platter.mp4",
    poster: "/videos/injera-platter.jpg",
    description: {
      en: "A close look at a platter of injera topped with stews, vegetables and fresh cheese.",
    },
    credit: {
      author: "kelly",
      license: "Pexels License",
      source: "https://www.pexels.com/video/food-dinner-meal-delicious-3967250/",
    },
  },
  {
    key: "shared",
    src: "/videos/shared-platter.mp4",
    poster: "/videos/shared-platter.jpg",
    description: { en: "A shared injera platter on a table, seen from above." },
    credit: {
      author: "kelly",
      license: "Pexels License",
      source: "https://www.pexels.com/video/an-assorted-food-on-a-platter-3967242/",
    },
  },
  {
    key: "coffee",
    src: "/videos/coffee-roasting.mp4",
    poster: "/videos/coffee-roasting.jpg",
    description: { en: "Coffee beans roasting in a pan over charcoal, among fresh grass and flowers." },
    credit: {
      author: "kelly",
      license: "Pexels License",
      source: "https://www.pexels.com/video/a-person-holding-a-pot-3967275/",
    },
  },
];
