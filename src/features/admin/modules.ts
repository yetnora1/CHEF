import type { AppPermission } from "@/lib/permissions/matrix";

/**
 * Admin module registry. A module is listed for a user who holds ANY of its
 * permissions. Visibility is a convenience only: each module's page and server
 * actions must still call authorizeAdmin() with the permission they need.
 */
export type AdminModuleKey =
  | "overview"
  | "bookings"
  | "messages"
  | "pages"
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
  { key: "bookings", href: "/admin/bookings", permissions: READ_BOOKINGS, status: "available" },
  { key: "messages", href: "/admin/messages", permissions: ["messages.read"], status: "available" },
  { key: "pages", href: "/admin/pages", permissions: ["content.read"], status: "available" },
  { key: "services", href: "/admin/services", permissions: ["content.read"], status: "available" },
  { key: "menu", href: "/admin/menu", permissions: ["content.read"], status: "available" },
  { key: "gallery", href: "/admin/gallery", permissions: ["content.read"], status: "available" },
  { key: "journal", href: "/admin/journal", permissions: ["content.read"], status: "available" },
  { key: "media", href: "/admin/media", permissions: ["media.write"], status: "available" },
  {
    key: "translations",
    href: "/admin/translations",
    permissions: ["translations.write"],
    status: "available",
  },
  { key: "users", href: "/admin/users", permissions: ["users.read"], status: "available" },
  { key: "settings", href: "/admin/settings", permissions: ["settings.manage"], status: "available" },
  { key: "auditLog", href: "/admin/audit-log", permissions: ["audit.read"], status: "available" },
];

export function modulesFor(permissions: readonly AppPermission[]): AdminModule[] {
  return ADMIN_MODULES.filter((module) => module.permissions.some((p) => permissions.includes(p)));
}

/** A module is current on its own page and on every page below it (entries, "new", categories). */
export function isModuleActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
