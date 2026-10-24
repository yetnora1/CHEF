import { createBrowserClient } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS, getSupabasePublicConfig } from "./config";

/**
 * Supabase client for Client Components. Uses only the publishable key; the
 * session is stored in cookies so the server can read it.
 */
export function createSupabaseBrowserClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;
  return createBrowserClient(config.url, config.publishableKey, { cookieOptions: AUTH_COOKIE_OPTIONS });
}
