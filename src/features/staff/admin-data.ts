import "server-only";
import { z } from "zod";
import { isAppRole, type AppRole } from "@/lib/permissions/matrix";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/*
 * Admin reads of staff accounts, with the signed-in staff member's own Supabase
 * client. public.list_staff answers only for users.read and raises otherwise.
 */

export class StaffDataError extends Error {
  constructor(operation: string, cause: unknown) {
    super(`Staff could not be loaded: ${operation}`, { cause });
    this.name = "StaffDataError";
  }
}

const rowSchema = z.object({
  user_id: z.uuid(),
  email: z.string().nullable(),
  display_name: z.string().nullable(),
  roles: z.array(z.string()).transform((roles) => roles.filter(isAppRole)),
  created_at: z.string().nullable(),
  last_sign_in_at: z.string().nullable(),
});

export type StaffMember = {
  id: string;
  email: string | null;
  displayName: string | null;
  /** The display name, else the email: what the admin shows for this person. */
  name: string;
  roles: AppRole[];
  createdAt: string | null;
  lastSignInAt: string | null;
};

export async function listStaff(): Promise<StaffMember[]> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new StaffDataError("client", "Supabase is not configured");
  const { data, error } = await supabase.rpc("list_staff");
  if (error) throw new StaffDataError("list_staff", error);
  return z
    .array(rowSchema)
    .parse(data ?? [])
    .map((row) => ({
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      name: row.display_name ?? row.email ?? row.user_id,
      roles: row.roles,
      createdAt: row.created_at,
      lastSignInAt: row.last_sign_in_at,
    }));
}
