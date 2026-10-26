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
 *     photo is presented as Chef Harena's work.
 */

export type ServicePreview = {
  slug: string;
  title: Localized;
  summary: Localized;
  photoSubject: Localized;
  /** False until Chef Harena confirms the offering exists. */
  confirmed: boolean;
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
      en: "Chef Harena prepares Ethiopian food for weddings, corporate events, summits and private occasions.",
      am: "Chef Harena ለሠርግ፣ ለድርጅት ዝግጅቶች፣ ለጉባኤዎችና ለግል ግብዣዎች የኢትዮጵያ ምግብ ያዘጋጃሉ።",
    },
    photoSubject: {
      en: "a signature dish or a set event table",
      am: "ልዩ ምግብ ወይም የተዘጋጀ የዝግጅት ገበታ",
    },
  },
  about: {
    title: {
      en: "Meet Chef Harena",
      am: "ከ Chef Harena ጋር ይተዋወቁ",
    },
    body: {
      en: "Chef Harena's story, training and culinary philosophy will appear here, in the chef's own words, once provided.",
      am: "የ Chef Harena የሕይወት ታሪክ፣ ሥልጠና እና የምግብ ፍልስፍና ከሼፉ ሲደርስ በራሳቸው አገላለጽ እዚህ ይቀርባል።",
    },
    photoSubject: {
      en: "a portrait of Chef Harena",
      am: "የ Chef Harena ምስል",
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
        confirmed: true,
      },
      {
        slug: "corporate-events",
        title: { en: "Corporate events", am: "የድርጅት ዝግጅቶች" },
        summary: {
          en: "Catering for corporate functions, receptions and team celebrations.",
          am: "ለድርጅት ዝግጅቶች፣ ለእንግዳ መቀበያዎችና ለሠራተኞች በዓላት የምግብ አገልግሎት።",
        },
        photoSubject: { en: "a corporate reception", am: "የድርጅት የእንግዳ መቀበያ" },
        confirmed: true,
      },
      {
        slug: "summits-and-conferences",
        title: { en: "Summits & conferences", am: "ጉባኤዎችና ኮንፈረንሶች" },
        summary: {
          en: "Ethiopian hospitality for summits, conferences and professional gatherings.",
          am: "ለጉባኤዎች፣ ለኮንፈረንሶችና ለሙያዊ ስብሰባዎች የኢትዮጵያ መስተንግዶ።",
        },
        photoSubject: { en: "a conference buffet", am: "የኮንፈረንስ የምግብ ገበታ" },
        confirmed: true,
      },
      {
        slug: "culinary-experiences",
        title: { en: "Culinary experiences", am: "የምግብ ባህል ልምዶች" },
        summary: {
          en: "Ethiopian food experiences for visitors to Ethiopia.",
          am: "ኢትዮጵያን ለሚጎበኙ እንግዶች የኢትዮጵያ ምግብ ልምዶች።",
        },
        photoSubject: { en: "visitors sharing an Ethiopian meal", am: "የኢትዮጵያ ምግብ የሚጋሩ እንግዶች" },
        confirmed: false,
      },
    ] satisfies ServicePreview[],
  },
  inquiry: {
    title: {
      en: "Planning a celebration or event?",
      am: "በዓል ወይም ዝግጅት እያቀዱ ነው?",
    },
    body: {
      en: "Share your date, guest count and occasion through the inquiry form, and Chef Harena will review your request.",
      am: "በጥያቄ ቅጹ የዝግጅትዎን ቀን፣ የእንግዶች ብዛትና አይነት ያጋሩ፤ Chef Harena ጥያቄዎን ይገመግማሉ።",
    },
  },
} as const;
