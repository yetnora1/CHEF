import type { Localized } from "@/lib/localization/translations";

/*
 * SAMPLE VIDEO — not CHEF SIS's work
 * ---------------------------------------------------------------------------
 * Short, silent loops of Ethiopian food from Pexels (Pexels License: free to use
 * and modify, no attribution required; credited anyway on /credits, where they
 * are also marked as samples). All six come from one shoot in Addis Ababa by the
 * same author. None shows an identifiable face. The files in public/videos were
 * cut to 4-7 seconds, cropped to 16:10 (keeping bystanders out of frame), resized
 * to 960px and re-encoded without sound. The reel's tiles play lighter 640px copies
 * (public/videos/preview, under half the size) so they start quickly; the 960px
 * file plays full screen. Each poster (public/videos/poster) is the clip's first
 * frame as a 480px WebP, half the weight of the 640px JPEG it replaced.
 *
 * Browsers cache /videos for a day (next.config.ts), so a changed clip needs a new
 * file name.
 *
 * The order fills the 3-column grid with food and the coffee ceremony mixed.
 *
 * Descriptions are English only until a fluent speaker writes the Amharic ones.
 */

export type SampleVideo = {
  key: string;
  /** 960x600, played in the full-screen viewer. */
  src: string;
  /** 640x400, played in the reel's tiles. */
  preview: string;
  poster: string;
  /** What the clip shows, for the credits page. */
  description: Localized;
  credit: { author: string; license: string; source: string };
};

export const sampleVideos: SampleVideo[] = [
  {
    key: "platter",
    src: "/videos/injera-platter.mp4",
    preview: "/videos/preview/injera-platter.mp4",
    poster: "/videos/poster/injera-platter.webp",
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
    key: "ceremony",
    src: "/videos/coffee-ceremony.mp4",
    preview: "/videos/preview/coffee-ceremony.mp4",
    poster: "/videos/poster/coffee-ceremony.webp",
    description: {
      en: "A coffee ceremony: freshly roasted beans are shown in the pan above rows of small cups.",
    },
    credit: {
      author: "kelly",
      license: "Pexels License",
      source: "https://www.pexels.com/video/a-woman-holding-a-pot-3967245/",
    },
  },
  {
    key: "shared",
    src: "/videos/shared-platter.mp4",
    preview: "/videos/preview/shared-platter.mp4",
    poster: "/videos/poster/shared-platter.webp",
    description: { en: "A shared injera platter on a table, seen from above." },
    credit: {
      author: "kelly",
      license: "Pexels License",
      source: "https://www.pexels.com/video/an-assorted-food-on-a-platter-3967242/",
    },
  },
  {
    key: "serving",
    src: "/videos/injera-service.mp4",
    preview: "/videos/preview/injera-service.mp4",
    poster: "/videos/poster/injera-service.webp",
    description: { en: "A stew being spooned onto a platter of injera already topped with other dishes." },
    credit: {
      author: "kelly",
      license: "Pexels License",
      source: "https://www.pexels.com/video/food-on-the-plate-3967276/",
    },
  },
  {
    key: "popcorn",
    src: "/videos/coffee-popcorn.mp4",
    preview: "/videos/preview/coffee-popcorn.mp4",
    poster: "/videos/poster/coffee-popcorn.webp",
    description: {
      en: "Coffee beans roasting beside a tray of popcorn on a floor strewn with petals and fresh grass, seen from above.",
    },
    credit: {
      author: "kelly",
      license: "Pexels License",
      source: "https://www.pexels.com/video/a-person-roasting-the-coffee-beans-3967268/",
    },
  },
  {
    key: "coffee",
    src: "/videos/coffee-roasting.mp4",
    preview: "/videos/preview/coffee-roasting.mp4",
    poster: "/videos/poster/coffee-roasting.webp",
    description: { en: "Coffee beans roasting in a pan over charcoal, among fresh grass and flowers." },
    credit: {
      author: "kelly",
      license: "Pexels License",
      source: "https://www.pexels.com/video/a-person-holding-a-pot-3967275/",
    },
  },
];
