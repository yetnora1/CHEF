"use client";

import { THEME_INIT_SCRIPT } from "@/lib/theme";

/**
 * Applies a stored theme choice before first paint (see the Next.js guide
 * "Preventing flash before hydration"). Render inside <head> of each root
 * layout, and put suppressHydrationWarning on <html> because this script sets
 * data-theme before React hydrates.
 *
 * The server sends an executable script, which the browser runs while parsing
 * the HTML. When React renders it again in the browser (for example a
 * not-found page rendered on the client), it is an inert `text/plain` block:
 * the theme is already applied, and React does not warn about rendering a
 * script it would never execute. suppressHydrationWarning covers the type
 * difference.
 */
export function ThemeScript() {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
    />
  );
}
