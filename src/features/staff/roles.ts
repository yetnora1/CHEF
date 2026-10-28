import { ROLE_PERMISSIONS, type AppPermission, type AppRole } from "@/lib/permissions/matrix";

/** Granting or removing these, or changing an account that holds one, needs users.manage_privileged. */
export const PRIVILEGED_ROLES = ["owner", "admin"] as const satisfies readonly AppRole[];

export function isPrivilegedRole(role: AppRole): boolean {
  return (PRIVILEGED_ROLES as readonly AppRole[]).includes(role);
}

export type RoleEditing =
  | { editable: true; lockedRoles: readonly AppRole[] }
  | { editable: false; reason: "noPermission" | "self" | "privilegedAccount" };

/**
 * Which roles the signed-in person may change for one account. Mirrors
 * private.assert_can_manage_roles_of, so the form offers only what the database
 * will accept; the database still decides (and writes the audit entries).
 */
export function roleEditing(
  actor: { id: string; permissions: readonly AppPermission[] },
  target: { id: string; roles: readonly AppRole[] },
): RoleEditing {
  if (!actor.permissions.includes("users.manage")) return { editable: false, reason: "noPermission" };
  if (actor.id === target.id) return { editable: false, reason: "self" };
  const privileged = actor.permissions.includes("users.manage_privileged");
  if (!privileged && target.roles.some(isPrivilegedRole))
    return { editable: false, reason: "privilegedAccount" };
  return { editable: true, lockedRoles: privileged ? [] : PRIVILEGED_ROLES };
}

type Capability = {
  key: string;
  permissions: readonly AppPermission[];
  /** Left out of a role's list when the role also has this broader capability. */
  impliedBy?: string;
};

/**
 * Plain-language capabilities for the "what each role can do" guide. Each one
 * is a group of permissions; a role has it when it holds all of them. Derived
 * from the reviewed matrix, so the guide cannot drift from the real rules (a
 * unit test checks every permission is covered exactly once).
 */
export const ROLE_CAPABILITIES = [
  { key: "admin", permissions: ["admin.access"] },
  { key: "reports", permissions: ["reports.read"] },
  {
    key: "content",
    permissions: ["content.read", "content.write", "content.publish", "media.write", "translations.write"],
  },
  { key: "allInquiries", permissions: ["bookings.read_all", "bookings.write_all", "bookings.assign"] },
  {
    key: "assignedInquiries",
    permissions: ["bookings.read_assigned", "bookings.write_assigned"],
    impliedBy: "allInquiries",
  },
  { key: "eraseInquiries", permissions: ["bookings.delete"] },
  { key: "messages", permissions: ["messages.read", "messages.write"] },
  { key: "staff", permissions: ["users.read", "users.manage"] },
  { key: "privilegedStaff", permissions: ["users.manage_privileged"] },
  { key: "settings", permissions: ["settings.manage"] },
  { key: "audit", permissions: ["audit.read"] },
] as const satisfies readonly Capability[];

export type RoleCapability = (typeof ROLE_CAPABILITIES)[number]["key"];

function holds(role: AppRole, permissions: readonly AppPermission[]): boolean {
  const granted: readonly AppPermission[] = ROLE_PERMISSIONS[role];
  return permissions.every((permission) => granted.includes(permission));
}

/** What one role can do, in guide order, without capabilities a broader one already covers. */
export function capabilitiesOf(role: AppRole): RoleCapability[] {
  const held = ROLE_CAPABILITIES.filter((capability) => holds(role, capability.permissions));
  const keys = new Set<string>(held.map((capability) => capability.key));
  return held
    .filter((capability: Capability) => !(capability.impliedBy && keys.has(capability.impliedBy)))
    .map((capability) => capability.key);
}
