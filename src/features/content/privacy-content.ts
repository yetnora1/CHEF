import type { AppLocale } from "@/i18n/routing";

/*
 * PRIVACY NOTICE: DRAFT FOR OWNER AND LEGAL REVIEW
 * ---------------------------------------------------------------------------
 * Describes what the website actually does today (Stage 2). It names no legal
 * entity, address, privacy officer or certification, because none has been
 * provided. Sections with `review` need business decisions from Chef Harena.
 * The Amharic text is a machine-assisted draft that also needs native-speaker
 * and legal review. Update LAST_UPDATED whenever the behaviour described here changes.
 */

export const PRIVACY_LAST_UPDATED = "2026-10-25";

export type PrivacySection = {
  id: string;
  heading: string;
  /** Shown before the list. */
  paragraphs?: string[];
  items?: string[];
  /** Shown after the list. */
  after?: string[];
  /** What the owner still has to decide or supply. */
  review?: string;
};

export const privacyContent: Record<
  AppLocale,
  { title: string; intro: string; translationNote?: string; sections: PrivacySection[] }
> = {
  en: {
    title: "How we handle your inquiry information",
    intro:
      "This notice explains what the Chef Harena website collects when you send an event inquiry, why, who can see it and what you can ask us to do with it.",
    sections: [
      {
        id: "who",
        heading: "Who is responsible",
        paragraphs: [
          "This website belongs to Chef Harena, an Ethiopian chef offering catering and culinary services for events.",
        ],
        review: "Add the legal name of the business, its registration details (if any) and a postal address.",
      },
      {
        id: "collect",
        heading: "What we collect",
        paragraphs: ["When you send the inquiry form, we store:"],
        items: [
          "your name and email address",
          "your phone number and preferred contact method, if you give them",
          "the type, date, approximate guest count and location of your event",
          "the services you ask for and any notes you add",
          "the date and time you accepted this notice, and the language you used",
        ],
      },
      {
        id: "security",
        heading: "Protecting the form from abuse",
        paragraphs: [
          "To stop automated spam, the form uses a security check provided by Cloudflare (Turnstile), which processes your IP address and technical browser information when the check runs.",
          "We also count how many inquiries come from the same connection or email address. For this we store a one-way coded version (a keyed hash) of your IP address and email address, not the addresses themselves, and delete these counts within about a day.",
        ],
      },
      {
        id: "use",
        heading: "Why we use it",
        items: [
          "to read, answer and follow up on your inquiry",
          "to plan and prepare a proposal for your event if you ask us to",
          "to keep the form safe from abuse",
        ],
        after: ["We do not use inquiry details for marketing and we do not sell them."],
      },
      {
        id: "access",
        heading: "Who can see it",
        paragraphs: [
          "Only authorised staff can see inquiries, according to their role: the owner and administrators can see all inquiries; event managers see only the inquiries assigned to them. Staff who edit website content, and staff who only see reports, cannot see your contact details.",
          "Your information is stored with our database provider (Supabase). If email notifications are switched on, an email provider sends a confirmation to you and an alert to us.",
        ],
        review:
          "Confirm the final list of service providers (database, website hosting, email) and where they store data.",
      },
      {
        id: "retention",
        heading: "How long we keep it",
        paragraphs: [
          "We keep inquiries for as long as we need them to respond to you and to manage any resulting event.",
        ],
        review:
          "Decide a retention period (for example, how long after an event or an unanswered inquiry records are deleted).",
      },
      {
        id: "rights",
        heading: "Your choices",
        paragraphs: [
          "You can ask us to show you, correct or delete the information from your inquiry. Please mention your inquiry reference.",
          "Contact details for these requests will be published here once Chef Harena has confirmed them.",
        ],
        review: "Provide the contact address for privacy requests.",
      },
      {
        id: "storage",
        heading: "Cookies and storage on this website",
        items: [
          "a language cookie (NEXT_LOCALE) that remembers English or Amharic for up to a year",
          "your light or dark theme choice, kept only in your browser's local storage",
          "sign-in cookies, used only on the staff admin pages",
          "the Cloudflare security check, which may use its own cookies or storage while it runs",
        ],
        after: ["The website does not use advertising or analytics trackers at present."],
      },
    ],
  },
  am: {
    title: "የጥያቄዎን መረጃ እንዴት እንደምንይዝ",
    intro:
      "ይህ መግለጫ የዝግጅት ጥያቄ ሲልኩ የChef Harena ድረ-ገጽ ምን እንደሚሰበስብ፣ ለምን፣ ማን ሊያየው እንደሚችል እና በእሱ ላይ ምን እንድናደርግ መጠየቅ እንደሚችሉ ያብራራል።",
    translationNote:
      "የአማርኛው ትርጉም ረቂቅ ነው፤ ከመታተሙ በፊት በአማርኛ ተናጋሪና በሕግ ባለሙያ መገምገም አለበት። ልዩነት ካለ የእንግሊዝኛውን ጽሑፍ ይመልከቱ።",
    sections: [
      {
        id: "who",
        heading: "ኃላፊው ማን ነው",
        paragraphs: ["ይህ ድረ-ገጽ ለዝግጅቶች የምግብ አገልግሎትና የምግብ ባህል ልምዶችን የሚያቀርቡት የኢትዮጵያዊው ሼፍ የChef Harena ነው።"],
        review: "የድርጅቱን ሕጋዊ ስም፣ የምዝገባ ዝርዝር (ካለ) እና የፖስታ አድራሻ ያክሉ።",
      },
      {
        id: "collect",
        heading: "የምንሰበስበው",
        paragraphs: ["የጥያቄ ቅጹን ሲልኩ የሚከተሉትን እናስቀምጣለን፦"],
        items: [
          "ስምዎንና የኢሜይል አድራሻዎን",
          "ከሰጡን ስልክ ቁጥርዎንና የሚመርጡትን የመገናኛ መንገድ",
          "የዝግጅትዎን አይነት፣ ቀን፣ የእንግዶች ግምታዊ ብዛትና ቦታ",
          "የሚጠይቋቸውን አገልግሎቶችና የሚያክሉትን ማስታወሻ",
          "ይህን መግለጫ የተቀበሉበትን ቀንና ሰዓት፣ እንዲሁም የተጠቀሙበትን ቋንቋ",
        ],
      },
      {
        id: "security",
        heading: "ቅጹን ከአላግባብ አጠቃቀም መጠበቅ",
        paragraphs: [
          "አውቶማቲክ አይፈለጌ መልዕክትን ለማስቆም ቅጹ በCloudflare (Turnstile) የሚቀርብ የደኅንነት ማረጋገጫ ይጠቀማል፤ ማረጋገጫው ሲሠራ የIP አድራሻዎንና ቴክኒካዊ የአሳሽ መረጃዎን ያስኬዳል።",
          "ከአንድ ግንኙነት ወይም ኢሜይል አድራሻ ምን ያህል ጥያቄዎች እንደሚመጡም እንቆጥራለን። ለዚህም አድራሻዎቹን ራሳቸውን ሳይሆን የIP አድራሻዎንና የኢሜይል አድራሻዎን ወደኋላ የማይመለስ የተመሰጠረ ቅጂ እናስቀምጣለን፤ እነዚህን ቆጠራዎች በአንድ ቀን ገደማ ውስጥ እንሰርዛለን።",
        ],
      },
      {
        id: "use",
        heading: "ለምን እንጠቀምበታለን",
        items: [
          "ጥያቄዎን ለማንበብ፣ ምላሽ ለመስጠትና ለመከታተል",
          "ከጠየቁን ዝግጅትዎን ለማቀድና የዋጋ ሐሳብ ለማዘጋጀት",
          "ቅጹን ከአላግባብ አጠቃቀም ለመጠበቅ",
        ],
        after: ["የጥያቄ ዝርዝሮችን ለማስታወቂያ አንጠቀምም፤ አንሸጥምም።"],
      },
      {
        id: "access",
        heading: "ማን ሊያየው ይችላል",
        paragraphs: [
          "ጥያቄዎችን ማየት የሚችሉት እንደ ሚናቸው የተፈቀደላቸው ሠራተኞች ብቻ ናቸው፤ ባለቤቱና አስተዳዳሪዎች ሁሉንም ጥያቄዎች ያያሉ፤ የዝግጅት አስተባባሪዎች የተመደቡላቸውን ጥያቄዎች ብቻ ያያሉ። የድረ-ገጹን ይዘት የሚያርትዑ ሠራተኞችና ሪፖርቶችን ብቻ የሚያዩ ሠራተኞች የመገኛ ዝርዝሮችዎን ማየት አይችሉም።",
          "መረጃዎ በመረጃ ቋት አቅራቢያችን (Supabase) ይቀመጣል። የኢሜይል ማሳወቂያዎች ከበሩ የኢሜይል አቅራቢ ለእርስዎ ማረጋገጫ፣ ለእኛ ደግሞ ማሳወቂያ ይልካል።",
        ],
        review: "የመጨረሻውን የአገልግሎት አቅራቢዎች ዝርዝር (የመረጃ ቋት፣ የድረ-ገጽ ማስተናገጃ፣ ኢሜይል) እና መረጃ የሚያስቀምጡበትን ቦታ ያረጋግጡ።",
      },
      {
        id: "retention",
        heading: "ለምን ያህል ጊዜ እናስቀምጠዋለን",
        paragraphs: ["ጥያቄዎችን ለእርስዎ ምላሽ ለመስጠትና ከዚያ የሚመጣን ዝግጅት ለማስተዳደር እስካስፈለገን ድረስ እናስቀምጣለን።"],
        review: "የማቆያ ጊዜ ይወስኑ (ለምሳሌ ከዝግጅት ወይም ምላሽ ካልተሰጠው ጥያቄ በኋላ መዛግብት ከምን ያህል ጊዜ በኋላ እንደሚሰረዙ)።",
      },
      {
        id: "rights",
        heading: "ምርጫዎችዎ",
        paragraphs: [
          "ከጥያቄዎ ያለውን መረጃ እንድናሳይዎ፣ እንድናስተካክል ወይም እንድንሰርዝ መጠየቅ ይችላሉ። እባክዎ የጥያቄዎን መለያ ቁጥር ይጥቀሱ።",
          "ለእነዚህ ጥያቄዎች የመገኛ አድራሻ Chef Harena ካረጋገጡ በኋላ እዚህ ይታተማል።",
        ],
        review: "ለግላዊነት ጥያቄዎች የመገኛ አድራሻ ያቅርቡ።",
      },
      {
        id: "storage",
        heading: "በዚህ ድረ-ገጽ ላይ ያሉ ኩኪዎችና ማከማቻ",
        items: [
          "እንግሊዝኛ ወይም አማርኛ መምረጥዎን እስከ አንድ ዓመት የሚያስታውስ የቋንቋ ኩኪ (NEXT_LOCALE)",
          "የመረጡት ብሩህ ወይም ጨለማ ገጽታ፣ በአሳሽዎ የአካባቢ ማከማቻ ውስጥ ብቻ የሚቀመጥ",
          "በሠራተኞች የአስተዳደር ገጾች ላይ ብቻ የሚያገለግሉ የመግቢያ ኩኪዎች",
          "በሚሠራበት ጊዜ የራሱን ኩኪዎች ወይም ማከማቻ ሊጠቀም የሚችለው የCloudflare የደኅንነት ማረጋገጫ",
        ],
        after: ["ድረ-ገጹ በአሁኑ ጊዜ የማስታወቂያ ወይም የትንታኔ መከታተያዎችን አይጠቀምም።"],
      },
    ],
  },
};
