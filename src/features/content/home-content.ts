import type { Localized } from "@/lib/localization/translations";

/*
 * PLACEHOLDER BUSINESS CONTENT — homepage
 * ---------------------------------------------------------------------------
 * Stands in for staff-managed content until the CMS stage moves it into
 * Supabase (pages / page_translations, services / service_translations).
 *
 * Rules followed here:
 *   - Only facts given in the project brief (the kinds of events served).
 *     No biography, awards, clients, testimonials, statistics or contact data.
 *   - Amharic is a machine-assisted draft that needs native-speaker review
 *     before launch (docs/LOCALIZATION.md lists every string to review).
 *   - Photo subjects describe the photograph to commission or supply; no stock
 *     photo is presented as CHEF SIS's work.
 */

export type ServicePreview = {
  slug: string;
  title: Localized;
  summary: Localized;
  photoSubject: Localized;
  /** False until CHEF SIS confirms the offering exists. */
};

export const homeContent = {
  hero: {
    eyebrow: {
      en: "Ethiopian chef · Weddings · Events · Private dining",
      am: "የኢትዮጵያ ምግብ ባለሙያ · ሠርግ · ዝግጅቶች · የግል ግብዣ",
    },
    headline: {
      en: "Ethiopian cuisine for your most important gatherings.",
      am: "ለልዩ አጋጣሚዎችዎ የተዘጋጀ የኢትዮጵያ ምግብ።",
    },
    lede: {
      en: "CHEF SIS prepares Ethiopian food for weddings, corporate events, summits and private occasions.",
      am: "CHEF SIS ለሠርግ፣ ለድርጅት ዝግጅቶች፣ ለጉባኤዎችና ለግል ግብዣዎች የኢትዮጵያ ምግብ ያዘጋጃሉ።",
    },
    photoSubject: {
      en: "a signature dish or a set event table",
      am: "ልዩ ምግብ ወይም የተዘጋጀ የዝግጅት ገበታ",
    },
  },
  about: {
    title: {
      en: "Meet CHEF SIS",
      am: "ከ CHEF SIS ጋር ይተዋወቁ",
    },
    body: {
      // No invented biography: the chef's own story replaces this through the CMS (Pages → Homepage).
      en: "Ethiopian food is made to be shared: injera is spread across the table and the stews are served side by side, so every guest eats from the same platter. CHEF SIS prepares this food for weddings, corporate events, summits and private occasions. Share your date, guest count and occasion, and CHEF SIS will review your request.",
      am: "የኢትዮጵያ ምግብ በጋራ የሚበላ ነው፤ እንጀራ በገበታው ላይ ይዘረጋል፣ ወጦቹም ጎን ለጎን ይቀርባሉ፤ ሁሉም እንግዳ ከአንድ ገበታ ይቋደሳል። CHEF SIS ይህንን ምግብ ለሠርግ፣ ለድርጅት ዝግጅቶች፣ ለጉባኤዎችና ለግል ግብዣዎች ያዘጋጃሉ። የዝግጅትዎን ቀን፣ የእንግዶች ብዛትና አይነት ያጋሩ፤ CHEF SIS ጥያቄዎን ይገመግማሉ።",
    },
    photoSubject: {
      en: "a portrait of CHEF SIS",
      am: "የ CHEF SIS ምስል",
    },
  },
  services: {
    title: {
      en: "Culinary services",
      am: "የምግብ አገልግሎቶች",
    },
    lede: {
      en: "Ethiopian menus prepared for celebrations, organisations and private tables. Full service descriptions are on their way.",
      am: "ለበዓላት፣ ለድርጅቶችና ለግል ግብዣዎች የሚዘጋጁ የኢትዮጵያ ምግቦች። ሙሉ የአገልግሎት መግለጫዎች በቅርቡ ይቀርባሉ።",
    },
    items: [
      {
        slug: "weddings",
        title: { en: "Weddings", am: "ሠርግ" },
        summary: {
          en: "Ethiopian menus for wedding celebrations and large family gatherings.",
          am: "ለሠርግ በዓላትና ለትላልቅ የቤተሰብ ስብሰባዎች የሚዘጋጅ የኢትዮጵያ ምግብ።",
        },
        photoSubject: { en: "a wedding feast", am: "የሠርግ ግብዣ" },
      },
      {
        slug: "corporate-events",
        title: { en: "Corporate events", am: "የድርጅት ዝግጅቶች" },
        summary: {
          en: "Catering for corporate functions, receptions and team celebrations.",
          am: "ለድርጅት ዝግጅቶች፣ ለእንግዳ መቀበያዎችና ለሠራተኞች በዓላት የምግብ አገልግሎት።",
        },
        photoSubject: { en: "a corporate reception", am: "የድርጅት የእንግዳ መቀበያ" },
      },
      {
        slug: "summits-and-conferences",
        title: { en: "Summits & conferences", am: "ጉባኤዎችና ኮንፈረንሶች" },
        summary: {
          en: "Ethiopian hospitality for summits, conferences and professional gatherings.",
          am: "ለጉባኤዎች፣ ለኮንፈረንሶችና ለሙያዊ ስብሰባዎች የኢትዮጵያ መስተንግዶ።",
        },
        photoSubject: { en: "a conference buffet", am: "የኮንፈረንስ የምግብ ገበታ" },
      },
      {
        slug: "culinary-experiences",
        title: { en: "Culinary experiences", am: "የምግብ ባህል ልምዶች" },
        summary: {
          en: "Ethiopian food experiences for visitors to Ethiopia.",
          am: "ኢትዮጵያን ለሚጎበኙ እንግዶች የኢትዮጵያ ምግብ ልምዶች።",
        },
        photoSubject: { en: "visitors sharing an Ethiopian meal", am: "የኢትዮጵያ ምግብ የሚጋሩ እንግዶች" },
      },
    ] satisfies ServicePreview[],
  },
} as const;
