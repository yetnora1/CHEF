import type { Localized } from "@/lib/localization/translations";
import type { samplePhotos } from "./sample-photos";

/*
 * Well-known Ethiopian dishes for the homepage's "fasting and non-fasting"
 * grid. Like the food stories, they describe the cuisine in general (widely
 * documented facts), never CHEF SIS's own menu, which only the chef can
 * supply. Fasting (ye-tsom) dishes contain no meat, dairy or eggs; non-fasting
 * (ye-fisik) dishes do. The Amharic is a draft for a fluent speaker to review.
 */

export type DishKind = "fasting" | "non-fasting";

export type Dish = {
  key: string;
  kind: DishKind;
  photo: keyof typeof samplePhotos;
  /** The dish's name: a transliteration in English, its own name in Amharic. */
  name: Localized;
  description: Localized;
};

export const dishes: Dish[] = [
  {
    key: "shiro",
    kind: "fasting",
    photo: "dish-shiro",
    name: { en: "Shiro", am: "ሽሮ" },
    description: {
      en: "A smooth stew of ground chickpeas or broad beans, simmered with onion, garlic and berbere. Everyday comfort food, often brought to the table still bubbling in a clay pot.",
      am: "ከሽምብራ ወይም ከባቄላ ዱቄት በሽንኩርት፣ በነጭ ሽንኩርትና በበርበሬ የሚዘጋጅ ለስላሳ ወጥ። የዕለት ተዕለት ተወዳጅ ምግብ ሲሆን ብዙ ጊዜ በሸክላ ድስት እየተንተከተከ ይቀርባል።",
    },
  },
  {
    key: "kik-alicha",
    kind: "fasting",
    photo: "dish-kik-alicha",
    name: { en: "Kik alicha", am: "ክክ አልጫ" },
    description: {
      en: "Yellow split peas cooked gently with onion, garlic, ginger and turmeric. Alicha means mild: no berbere, just a golden, soothing stew.",
      am: "ክክ በሽንኩርት፣ በነጭ ሽንኩርት፣ በዝንጅብልና በእርድ በዝግታ ይበስላል። አልጫ ያለ በርበሬ የሚሠራ ለስላሳ ወጥ ነው፤ ቀለሙም ወርቃማ ነው።",
    },
  },
  {
    key: "gomen",
    kind: "fasting",
    photo: "dish-gomen",
    name: { en: "Gomen", am: "ጎመን" },
    description: {
      en: "Collard greens cooked slowly with onion, garlic and green chilli until silky and deep green. On fasting days it is made with oil instead of butter.",
      am: "ጎመን በሽንኩርት፣ በነጭ ሽንኩርትና በቃሪያ በዝግታ ይበስላል፤ ለስላሳና ጥቁር አረንጓዴ ይሆናል። በጾም ቀናት ከቅቤ ይልቅ በዘይት ይሠራል።",
    },
  },
  {
    key: "beyaynetu",
    kind: "fasting",
    photo: "dish-beyaynetu",
    name: { en: "Beyaynetu", am: "በያይነቱ" },
    description: {
      en: "A bit of every kind: a fasting platter where lentils, split peas, potatoes, beetroot, cabbage and green beans share one injera.",
      am: "በያይነቱ ማለት ከሁሉም ዓይነት ትንሽ ማለት ነው፦ ምስር፣ ክክ፣ ድንች፣ ቀይ ሥር፣ ጥቅል ጎመንና ፎሶሊያ በአንድ እንጀራ ላይ የሚቀርቡበት የጾም ገበታ።",
    },
  },
  {
    key: "doro-wat",
    kind: "non-fasting",
    photo: "dish-doro-wat",
    name: { en: "Doro wat", am: "ዶሮ ወጥ" },
    description: {
      en: "Chicken simmered for hours in onions, berbere and spiced butter, served with hard-boiled eggs. The dish of holidays, above all when the long fast ends at Easter.",
      am: "ዶሮ በሽንኩርት፣ በበርበሬና በንጥር ቅቤ ለሰዓታት ይበስላል፤ ከተቀቀለ እንቁላል ጋር ይቀርባል። የበዓላት ምግብ ነው፤ በተለይም ረጅሙ ጾም በፋሲካ ሲፈታ።",
    },
  },
  {
    key: "kitfo",
    kind: "non-fasting",
    photo: "dish-kitfo",
    name: { en: "Kitfo", am: "ክትፎ" },
    description: {
      en: "Finely minced lean beef with spiced butter and mitmita chilli, eaten raw or barely warmed (leb leb), traditionally with fresh ayib cheese and gomen.",
      am: "በንጥር ቅቤና በሚጥሚጣ የተቀመመ የተከተፈ ሥጋ፤ ጥሬ ወይም ለብ ለብ ተደርጎ ይበላል፤ በባህሉ ከአይብና ከጎመን ጋር ይቀርባል።",
    },
  },
  {
    key: "tibs",
    kind: "non-fasting",
    photo: "dish-tibs",
    name: { en: "Tibs", am: "ጥብስ" },
    description: {
      en: "Pieces of beef or lamb seared with onion, rosemary and green chilli, often brought sizzling in a clay pot over embers to share.",
      am: "የበሬ ወይም የበግ ሥጋ ቁርጥራጭ በሽንኩርት፣ በሮዝመሪና በቃሪያ ይጠበሳል፤ ብዙ ጊዜ በፍም ላይ ባለ የሸክላ ማቅረቢያ እየተንጣጣ ለጋራ ይቀርባል።",
    },
  },
  {
    key: "ayib-gomen",
    kind: "non-fasting",
    photo: "dish-ayib-gomen",
    name: { en: "Ayib and gomen", am: "አይብና ጎመን" },
    description: {
      en: "Ayib, a fresh, mild cheese, served beside gomen. Cool and soft, it balances the heat of berbere stews.",
      am: "አይብ ቀላል ጣዕም ያለው ትኩስ አይብ ሲሆን ብዙ ጊዜ ከጎመን ጋር ይቀርባል። ቀዝቃዛና ለስላሳ በመሆኑ የበርበሬ ወጦችን ቅመም ያለዝባል።",
    },
  },
];
