import "server-only";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { z } from "zod";
import { isAppPermission, isAppRole } from "@/lib/permissions/matrix";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decideAdminAccess, type AccessDecision, type StaffSession } from "./access";
import { ADMIN_LOGIN_PATH } from "./redirect";

/*
 * Data Access Layer for staff identity and authorization.
 *
 * - Identity comes from Supabase Auth via getUser(), which validates the
 *   session with the Auth server on every request (revoked sessions and
 *   deleted users are rejected immediately).
 * - Roles and permissions come from Postgres (public.get_my_access), never from
 *   cookies, JWT metadata, URL parameters or client state.
 * - Results are memoised per request with React cache(), so layouts, pages and
 *   components can each call it cheaply.
 */

const accessRowSchema = z.object({
  roles: z.array(z.string()).transform((roles) => roles.filter(isAppRole)),
  permissions: z.array(z.string()).transform((permissions) => permissions.filter(isAppPermission)),
});

export class AccessLookupError extends Error {
  constructor(cause: unknown) {
    super("Staff permissions could not be loaded", { cause });
    this.name = "AccessLookupError";
  }
}

export const getStaffSession = cache(async (): Promise<StaffSession> => {
  // Sessions are per request and time-dependent (token expiry): never prerender.
  await connection();
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "unconfigured" };

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) return { status: "signed-out" };

  const { data, error } = await supabase.rpc("get_my_access").single();
  if (error) throw new AccessLookupError(error);

  const parsed = accessRowSchema.safeParse(data);
  if (!parsed.success) throw new AccessLookupError(parsed.error);

  return {
    status: "signed-in",
    user: { id: user.id, email: user.email ?? null },
    roles: parsed.data.roles,
    permissions: parsed.data.permissions,
  };
});

/**
 * Call at the top of every protected admin page, layout and server action.
 * Redirects to the login page without a session; returns a "forbidden"
 * decision (render <AccessDenied />) when the permission is missing.
 */
export async function authorizeAdmin(
  required: Parameters<typeof decideAdminAccess>[1],
): Promise<Exclude<AccessDecision, { kind: "login" }>> {
  const decision = decideAdminAccess(await getStaffSession(), required);
  if (decision.kind === "login") redirect(ADMIN_LOGIN_PATH);
  return decision;
}
