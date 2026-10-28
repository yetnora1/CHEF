import { BeforePaintScript } from "@/components/layout/before-paint-script";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

/** Applies a stored theme choice before first paint. Render inside <head> of each root layout. */
export function ThemeScript() {
  return <BeforePaintScript code={THEME_INIT_SCRIPT} />;
}
