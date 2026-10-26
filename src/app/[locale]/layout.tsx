import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { DemoBanner } from "@/components/layout/demo-banner";
import { PreviewNotice } from "@/components/layout/preview-notice";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SkipLink } from "@/components/layout/skip-link";
import { ThemeScript } from "@/components/theme/theme-script";
import { getClientMessages } from "@/i18n/client-messages";
import { routing } from "@/i18n/routing";
import { fontVariables } from "@/lib/fonts";
import { SITE_URL } from "@/lib/site";
import "../globals.css";

// Cache Components requires every root parameter to be known at build time.
export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f0e6" },
    { media: "(prefers-color-scheme: dark)", color: "#171d1a" },
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("Metadata");

  return {
    metadataBase: SITE_URL,
    title: { default: t("homeTitle"), template: `%s · ${t("siteName")}` },
    description: t("homeDescription"),
    applicationName: t("siteName"),
    alternates: {
      canonical: `/${locale}`,
      languages: { en: "/en", am: "/am", "x-default": "/en" },
    },
    openGraph: {
      type: "website",
      siteName: t("siteName"),
      locale: locale === "am" ? "am_ET" : "en_US",
    },
  };
}

export default async function PublicRootLayout({ children }: LayoutProps<"/[locale]">) {
  // Validated against the supported locales in src/i18n/request.ts (404 otherwise).
  const locale = await getLocale();
  const t = await getTranslations("Common");
  const messages = await getClientMessages(["Common", "Theme", "Language", "Navigation"]);

  return (
    <html lang={locale} className={fontVariables} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider messages={messages}>
          <SkipLink label={t("skipToContent")} />
          <DemoBanner />
          <PreviewNotice />
          <SiteHeader />
          <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
            {children}
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
