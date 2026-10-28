"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { authorizeAdmin } from "@/lib/auth/staff-session";
import { APP_ROLES } from "@/lib/permissions/matrix";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
 * Staff mutation: give one person a new set of roles. The action re-checks the
 * session and permission; public.set_user_roles applies the change in one
 * transaction through assign_role / revoke_role, which authorize again and
 * write the audit entries.
 */

export type RolesActionError =
  "errorGeneric" | "errorForbidden" | "errorSelf" | "errorPrivileged" | "errorLastOwner" | "errorNotFound";

export type RolesActionState =
  { status: "idle" } | { status: "success"; at: number } | { status: "error"; message: RolesActionError };

const inputSchema = z.object({
  userId: z.uuid(),
  roles: z.array(z.enum(APP_ROLES)).max(APP_ROLES.length),
});

export async function setUserRolesAction(
  _previous: RolesActionState,
  formData: FormData,
): Promise<RolesActionState> {
  const decision = await authorizeAdmin("users.manage");
  if (decision.kind !== "allow") return { status: "error", message: "errorForbidden" };

  const parsed = inputSchema.safeParse({ userId: formData.get("userId"), roles: formData.getAll("roles") });
  if (!parsed.success) return { status: "error", message: "errorGeneric" };
  if (parsed.data.userId === decision.session.user.id) return { status: "error", message: "errorSelf" };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "errorGeneric" };
  const { error } = await supabase.rpc("set_user_roles", {
    target_user_id: parsed.data.userId,
    new_roles: parsed.data.roles,
  });
  if (error) return { status: "error", message: explain(error) };

  refresh();
  return { status: "success", at: Date.now() };
}

/** The role functions raise 42501 with a reason in their own words (see the migrations). */
function explain(error: { code?: string; message?: string }): RolesActionError {
  if (error.code === "P0002") return "errorNotFound";
  if (error.code !== "42501") return "errorGeneric";
  const message = error.message ?? "";
  if (message.includes("own roles")) return "errorSelf";
  if (message.includes("last owner")) return "errorLastOwner";
  if (message.includes("privileged")) return "errorPrivileged";
  return "errorForbidden";
}
