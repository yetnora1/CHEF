"use server";

import { cookies } from "next/headers";
import { isAppLocale, LOCALE_COOKIE } from "@/i18n/routing";

/**
 * Stores the admin interface language. The admin app has no locale in its
 * URLs, so it reads the same NEXT_LOCALE cookie the public site writes.
 */
export async function setAdminLocale(locale: unknown): Promise<void> {
  if (!isAppLocale(locale)) return;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
