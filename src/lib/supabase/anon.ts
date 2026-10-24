import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./config";

/*
 * A Supabase client with the publishable key and NO session: every request is
 * an anonymous visitor's, so RLS returns published content only. Used for the
 * public website's cached reads and public image delivery, where reading
 * cookies is not allowed (shared cache) and would never be appropriate.
 */

let client: SupabaseClient | null | undefined;

export function createSupabaseAnonClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const config = getSupabasePublicConfig();
  client = config
    ? createClient(config.url, config.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    : null;
  return client;
}
