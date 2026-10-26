export const THEME_STORAGE_KEY = "chef-harena:theme";

/** Light is the default; dark applies only when chosen with the theme button. */
export type Theme = "light" | "dark";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

/**
 * Runs synchronously in <head> before first paint. A stored choice is applied
 * as data-theme; with none, CSS renders the light theme (the device's
 * light/dark setting is deliberately ignored), also with JavaScript disabled.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;
