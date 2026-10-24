import type { AppLocale } from "@/i18n/routing";

/** Dates and times are shown in the business's time zone in both languages. */
export const BUSINESS_TIME_ZONE = "Africa/Addis_Ababa";

const intlLocale = (locale: AppLocale) => (locale === "am" ? "am-ET" : "en-GB");

/**
 * Formats a calendar date without shifting it across time zones. Accepts
 * `YYYY-MM-DD` (as the Data API returns `date` columns) or a full ISO string.
 */
export function formatCalendarDate(locale: AppLocale, isoDate: string): string {
  const day = isoDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return isoDate;
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

export function formatTimestamp(locale: AppLocale, iso: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(new Date(iso));
}
