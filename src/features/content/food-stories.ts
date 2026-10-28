import type { Localized } from "@/lib/localization/translations";
import type { samplePhotos } from "./sample-photos";

/*
 * Short pieces about Ethiopian food for the homepage, shown in alternating
 * image-and-text rows after "Meet CHEF SIS". They describe the cuisine in
 * general (widely documented facts), never CHEF SIS's own dishes, menus or
 * history, which only the chef can supply. The Amharic is a draft for a fluent
 * speaker to review, like the rest of the site's Amharic placeholder copy.
 */

export type FoodStory = {
  key: string;
  photo: keyof typeof samplePhotos;
  eyebrow: Localized;
  title: Localized;
  body: Localized;
};

export const foodStories: FoodStory[] = [
  {
    key: "injera",
    photo: "injera",
    eyebrow: { en: "Injera", am: "እንጀራ" },
    title: { en: "Plate and bread in one", am: "ሳህንም ዳቦም" },
    body: {
      en: "Injera is a soft, slightly sour flatbread made from teff, a tiny grain grown in the Ethiopian highlands. The batter rests for days before it is poured onto a wide griddle, where it bakes into its familiar spongy surface. At the table it is both the plate and the spoon: torn by hand and used to scoop up every stew.",
      am: "እንጀራ በኢትዮጵያ ደጋማ አካባቢዎች ከሚበቅለው ጤፍ የሚዘጋጅ ለስላሳና ትንሽ ኮምጣጣ ቂጣ ነው። ሊጡ ለቀናት ኮምጥጦ በሰፊ ምጣድ ላይ ይጋገራል፤ የታወቀውን ዓይናማ ገጽታውን የሚያገኘውም እዚያ ነው። በማዕድ ላይ እንጀራ ሳህንም ማንኪያም ነው፤ በእጅ ተቆርሶ ወጡን ለማንሳት ያገለግላል።",
    },
  },
  {
    key: "wat",
    photo: "wat",
    eyebrow: { en: "Wat", am: "ወጥ" },
    title: { en: "Stews that take their time", am: "ጊዜ ወስደው የሚበስሉ ወጦች" },
    body: {
      en: "Wat is the slow-cooked heart of an Ethiopian meal. Onions cook down for a long time, then berbere, a deep red blend of chilli and warm spices, and spiced butter build its colour and warmth. Doro wat, chicken stewed with hard-boiled eggs, is the dish of holidays and celebrations.",
      am: "ወጥ የኢትዮጵያ ማዕድ ልብ ነው። ሽንኩርቱ ለረጅም ጊዜ ይቁላላል፤ ከዚያም በርበሬና ንጥር ቅቤ ቀለሙንና ጣዕሙን ይሰጡታል። ዶሮ ወጥ ከተቀቀለ እንቁላል ጋር የሚቀርብ የበዓላትና የደስታ ቀናት ምግብ ነው።",
    },
  },
  {
    key: "fasting",
    photo: "fasting",
    eyebrow: { en: "Fasting food", am: "የጾም ምግብ" },
    title: { en: "A feast without meat", am: "ሥጋ የሌለበት ድግስ" },
    body: {
      en: "On fasting days many Ethiopians eat no meat or dairy, and the table fills with vegetable dishes instead: shiro made from ground chickpeas, red lentils in berbere, collard greens, cabbage and potatoes. Served together on injera, they make a platter called beyaynetu, colourful enough for any guest, vegan or not.",
      am: "በጾም ቀናት ብዙ ኢትዮጵያውያን ሥጋና የወተት ተዋጽኦ አይመገቡም፤ ማዕዱም በአትክልት ምግቦች ይሞላል፦ ሽሮ፣ ምስር ወጥ፣ ጎመን፣ ጥቅል ጎመንና ድንች። በአንድ እንጀራ ላይ ሲቀርቡ በያይነቱ ይባላሉ፤ ለማንኛውም እንግዳ የሚስማማ ያሸበረቀ ገበታ ነው።",
    },
  },
];
