import { THEME_INIT_SCRIPT } from "@/lib/theme";

/**
 * Applies a stored theme choice before first paint (see the Next.js guide
 * "Preventing flash before hydration"). Render inside <head> of each root
 * layout, and put suppressHydrationWarning on <html> because this script sets
 * data-theme before React hydrates.
 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
