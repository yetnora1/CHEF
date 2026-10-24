export const THEME_STORAGE_KEY = "chief-harena:theme";

export const THEME_PREFERENCES = ["light", "dark", "system"] as const;

export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export function isExplicitTheme(value: unknown): value is ResolvedTheme {
  return value === "light" || value === "dark";
}

/**
 * Runs synchronously in <head> before first paint. Only an explicit choice is
 * applied; with no stored choice, CSS `color-scheme: light dark` follows the
 * operating system, which also works with JavaScript disabled.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;
