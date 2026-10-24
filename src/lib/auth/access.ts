import type { AppPermission, AppRole } from "@/lib/permissions/matrix";

export type StaffUser = {
  id: string;
  email: string | null;
};

export type StaffSession =
  | { status: "unconfigured" }
  | { status: "signed-out" }
  | {
      status: "signed-in";
      user: StaffUser;
      roles: AppRole[];
      permissions: AppPermission[];
    };

export type SignedInStaffSession = Extract<StaffSession, { status: "signed-in" }>;

export type AccessDecision =
  | { kind: "allow"; session: SignedInStaffSession }
  | { kind: "login"; reason: "unconfigured" | "signed-out" }
  | { kind: "forbidden"; session: SignedInStaffSession };

/**
 * Pure authorization decision for admin pages. Every protected route requires
 * `admin.access` plus its own permission (or any one of a list, e.g.
 * bookings.read_all OR bookings.read_assigned); anything else is denied.
 */
export function decideAdminAccess(
  session: StaffSession,
  required: AppPermission | readonly AppPermission[],
): AccessDecision {
  if (session.status !== "signed-in") return { kind: "login", reason: session.status };

  const granted = new Set(session.permissions);
  const anyOf = typeof required === "string" ? [required] : required;
  if (granted.has("admin.access") && anyOf.some((p) => granted.has(p))) return { kind: "allow", session };

  return { kind: "forbidden", session };
}

export function hasPermission(
  session: SignedInStaffSession,
  permission: AppPermission | readonly AppPermission[],
): boolean {
  const wanted = typeof permission === "string" ? [permission] : permission;
  return wanted.some((p) => session.permissions.includes(p));
}
