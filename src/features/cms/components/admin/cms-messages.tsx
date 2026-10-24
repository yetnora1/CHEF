import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getClientMessages } from "@/i18n/client-messages";

/**
 * Messages for the CMS's Client Components (forms, pickers, dialogs). Unlike
 * the smaller admin screens, CMS forms are generated from the content registry,
 * so they read labels through next-intl instead of receiving each as a prop.
 */
export async function CmsMessages({ children }: { children: ReactNode }) {
  const messages = await getClientMessages([
    "Common",
    "AdminCms",
    "PublicationStatus",
    "DietaryTag",
    "EventType",
  ]);
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
