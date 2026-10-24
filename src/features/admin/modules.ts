import type { AppPermission } from "@/lib/permissions/matrix";

/**
 * Admin module registry. A module is listed for a user who holds ANY of its
 * permissions. Visibility is a convenience only: each module's page and server
 * actions must still call authorizeAdmin() with the permission they need.
 */
export type AdminModuleKey =
  | "overview"
  | "inquiries"
  | "bookings"
  | "services"
  | "menu"
  | "gallery"
  | "journal"
  | "media"
  | "translations"
  | "users"
  | "settings"
  | "auditLog";

export type AdminModule = {
  key: AdminModuleKey;
  href: `/admin/${string}`;
  permissions: readonly AppPermission[];
  /** Planned modules render as non-interactive placeholders until they are built. */
  status: "available" | "planned";
};

const READ_BOOKINGS = ["bookings.read_all", "bookings.read_assigned"] as const;

export const ADMIN_MODULES: readonly AdminModule[] = [
  { key: "overview", href: "/admin/overview", permissions: ["admin.access"], status: "available" },
  { key: "inquiries", href: "/admin/inquiries", permissions: READ_BOOKINGS, status: "planned" },
  { key: "bookings", href: "/admin/bookings", permissions: READ_BOOKINGS, status: "planned" },
  { key: "services", href: "/admin/services", permissions: ["content.read"], status: "planned" },
  { key: "menu", href: "/admin/menu", permissions: ["content.read"], status: "planned" },
  { key: "gallery", href: "/admin/gallery", permissions: ["content.read"], status: "planned" },
  { key: "journal", href: "/admin/journal", permissions: ["content.read"], status: "planned" },
  { key: "media", href: "/admin/media", permissions: ["media.write"], status: "planned" },
  {
    key: "translations",
    href: "/admin/translations",
    permissions: ["translations.write"],
    status: "planned",
  },
  { key: "users", href: "/admin/users", permissions: ["users.read"], status: "planned" },
  { key: "settings", href: "/admin/settings", permissions: ["settings.manage"], status: "planned" },
  { key: "auditLog", href: "/admin/audit-log", permissions: ["audit.read"], status: "planned" },
];

export function modulesFor(permissions: readonly AppPermission[]): AdminModule[] {
  return ADMIN_MODULES.filter((module) => module.permissions.some((p) => permissions.includes(p)));
}
