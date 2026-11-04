import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
 * Where an email-change confirmation link lands, by way of Supabase Auth, which has
 * already applied the confirmation. This only refreshes the session and picks the
 * message to show: never the text in the link, which anyone could write. Opened on
 * another device, the code cannot be exchanged; the change still stands. Signed out,
 * the proxy sends the visitor to sign in first, and the query string is lost.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  let outcome: "done" | "partial" | "failed" | null = null;
  if (searchParams.has("error") || searchParams.has("error_code")) {
    outcome = "failed";
  } else if (searchParams.has("message")) {
    // Secure email change: the link sent to the other address is still to be opened.
    outcome = "partial";
  } else if (code) {
    const supabase = await createSupabaseServerClient();
    await supabase?.auth.exchangeCodeForSession(code).catch(() => null);
    outcome = "done";
  }

  const target = new URL("/admin/account", request.url);
  if (outcome) target.searchParams.set("email", outcome);
  return NextResponse.redirect(target);
}
