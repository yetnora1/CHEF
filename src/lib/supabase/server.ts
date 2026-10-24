import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { AUTH_COOKIE_OPTIONS, getSupabasePublicConfig } from "./config";

/**
 * Supabase client for Server Components and Server Actions, acting as the
 * signed-in user (requests carry their JWT, so RLS applies). Returns null when
 * Supabase is not configured.
 *
 * Create one per request; never share a client between requests.
 */
export async function createSupabaseServerClient() {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  const cookieStore = await cookies();

  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot set cookies. The proxy refreshes sessions
          // before rendering, so this is safe to ignore there.
        }
      },
    },
  });
}
