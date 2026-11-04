import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The signed-in staff member's own username; RLS limits the read to their row. */
export async function getMyUsername(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_my_username");
  if (error) throw new Error("The username could not be loaded", { cause: error });
  return typeof data === "string" ? data : null;
}
