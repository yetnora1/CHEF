import type messages from "@/messages/en.json";
import type { routing } from "@/i18n/routing";

// English is the reference catalogue: every key used in code must exist in it,
// and tests/unit/messages.test.ts requires Amharic to define the same keys.
declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: typeof messages;
  }
}
