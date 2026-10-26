import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { DemoBanner } from "@/components/layout/demo-banner";
import { SkipLink } from "@/components/layout/skip-link";
import { ThemeScript } from "@/components/theme/theme-script";
import { getClientMessages } from "@/i18n/client-messages";
import { fontVariables } from "@/lib/fonts";
import "../globals.css";

/*
 * Root layout of the admin application (separate from the public [locale]
 * root). Every admin response depends on the visitor's session and language
 * cookie, so nothing here is prerendered into a shared static shell.
 */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Admin");
  return {
    title: { default: `${t("appName")} · Chief Harena`, template: `%s · Chief Harena ${t("appName")}` },
    robots: { index: false, follow: false },
    referrer: "same-origin",
  };
}

export default async function AdminRootLayout({ children }: LayoutProps<"/admin">) {
  const locale = await getLocale();
  const t = await getTranslations("Common");
  // Admin labels mostly reach Client Components as props; only these namespaces are used
  // client-side everywhere. CMS screens add their own (features/cms/components/admin/cms-messages.tsx).
  const messages = await getClientMessages(["Common", "Theme", "Language", "Auth"]);

  return (
    <html lang={locale} className={fontVariables} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <NextIntlClientProvider messages={messages}>
          <SkipLink label={t("skipToContent")} />
          <DemoBanner />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
