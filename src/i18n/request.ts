import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import * as rootParams from "next/root-params";
import { getRequestConfig } from "next-intl/server";
import { isAppLocale, LOCALE_COOKIE, routing, type AppLocale } from "./routing";

export default getRequestConfig(async ({ locale: explicitLocale }) => {
  const locale = isAppLocale(explicitLocale) ? explicitLocale : await resolveRequestLocale();

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // Formatting defaults to the business's home time zone.
    timeZone: "Africa/Addis_Ababa",
  };
});

async function resolveRequestLocale(): Promise<AppLocale> {
  // Public routes: the [locale] root segment is authoritative.
  const segment = await rootParams.locale();
  if (segment !== undefined) {
    if (isAppLocale(segment)) return segment;
    notFound();
  }

  // Admin routes have no locale segment: use the saved preference.
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isAppLocale(saved) ? saved : routing.defaultLocale;
}
