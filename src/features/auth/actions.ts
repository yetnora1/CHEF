"use server";

import { redirect } from "next/navigation";
import { ADMIN_LOGIN_PATH } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Ends this browser's session (other devices stay signed in). */
export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut({ scope: "local" });
  redirect(ADMIN_LOGIN_PATH);
}
