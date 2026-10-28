import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getClientMessages } from "@/i18n/client-messages";

/** Messages for the staff screen's Client Components (the role editor and its dialog). */
export async function StaffMessages({ children }: { children: ReactNode }) {
  const messages = await getClientMessages(["AdminStaff", "Roles"]);
  return <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>;
}
