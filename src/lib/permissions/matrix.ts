/**
 * The role → permission matrix.
 *
 * The database (public.role_permissions, seeded by migration) is the runtime
 * source of truth: the server asks Postgres for the signed-in user's effective
 * permissions, and RLS policies check the same table. This file is the reviewed
 * specification of that matrix. tests/integration/db fails if the two drift.
 *
 * Changing access therefore takes two edits: a new migration and this file.
 */

export const APP_ROLES = ["owner", "admin", "content_editor", "event_manager", "analyst"] as const;

export type AppRole = (typeof APP_ROLES)[number];

export const APP_PERMISSIONS = [
  "admin.access",
  "reports.read",
  "content.read",
  "content.write",
  "content.publish",
  "media.write",
  "translations.write",
  "bookings.read_all",
  "bookings.read_assigned",
  "bookings.write_all",
  "bookings.write_assigned",
  "bookings.assign",
  "bookings.delete",
  "messages.read",
  "messages.write",
  "users.read",
  "users.manage",
  "users.manage_privileged",
  "settings.manage",
  "audit.read",
] as const;

export type AppPermission = (typeof APP_PERMISSIONS)[number];

export const ROLE_PERMISSIONS = {
  owner: APP_PERMISSIONS,
  admin: [
    "admin.access",
    "reports.read",
    "content.read",
    "content.write",
    "content.publish",
    "media.write",
    "translations.write",
    "bookings.read_all",
    "bookings.write_all",
    "bookings.assign",
    "messages.read",
    "messages.write",
    "users.read",
    "users.manage",
    "settings.manage",
    "audit.read",
  ],
  content_editor: [
    "admin.access",
    "content.read",
    "content.write",
    "content.publish",
    "media.write",
    "translations.write",
  ],
  event_manager: ["admin.access", "bookings.read_assigned", "bookings.write_assigned"],
  analyst: ["admin.access", "reports.read"],
} as const satisfies Record<AppRole, readonly AppPermission[]>;

export function isAppRole(value: unknown): value is AppRole {
  return (APP_ROLES as readonly unknown[]).includes(value);
}

export function isAppPermission(value: unknown): value is AppPermission {
  return (APP_PERMISSIONS as readonly unknown[]).includes(value);
}
