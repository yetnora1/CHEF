import { describe, expect, it } from "vitest";
import { decideAdminAccess, type StaffSession } from "@/lib/auth/access";
import { ROLE_PERMISSIONS, type AppRole } from "@/lib/permissions/matrix";

const signedIn = (roles: AppRole[]): StaffSession => ({
  status: "signed-in",
  user: { id: "00000000-0000-0000-0000-000000000001", email: "staff@example.test" },
  roles,
  permissions: [...new Set(roles.flatMap((role) => ROLE_PERMISSIONS[role]))],
});

describe("decideAdminAccess", () => {
  it("sends visitors without a session to the login page", () => {
    expect(decideAdminAccess({ status: "signed-out" }, "admin.access")).toEqual({
      kind: "login",
      reason: "signed-out",
    });
    expect(decideAdminAccess({ status: "unconfigured" }, "admin.access")).toEqual({
      kind: "login",
      reason: "unconfigured",
    });
  });

  it("forbids an authenticated user with no staff role", () => {
    expect(decideAdminAccess(signedIn([]), "admin.access").kind).toBe("forbidden");
  });

  it("requires admin.access in addition to the specific permission", () => {
    const session: StaffSession = {
      status: "signed-in",
      user: { id: "x", email: null },
      roles: [],
      permissions: ["bookings.read_all"],
    };
    expect(decideAdminAccess(session, "bookings.read_all").kind).toBe("forbidden");
  });

  it.each<[AppRole, Parameters<typeof decideAdminAccess>[1], "allow" | "forbidden"]>([
    ["owner", "users.manage_privileged", "allow"],
    ["admin", "users.manage_privileged", "forbidden"],
    ["admin", "bookings.read_all", "allow"],
    ["content_editor", "content.publish", "allow"],
    ["content_editor", "bookings.read_all", "forbidden"],
    ["content_editor", "users.manage", "forbidden"],
    ["event_manager", "bookings.read_assigned", "allow"],
    ["event_manager", "bookings.read_all", "forbidden"],
    ["event_manager", "content.write", "forbidden"],
    ["analyst", "reports.read", "allow"],
    ["analyst", "content.write", "forbidden"],
    ["analyst", "bookings.write_all", "forbidden"],
  ])("%s → %s is %s", (role, permission, expected) => {
    expect(decideAdminAccess(signedIn([role]), permission).kind).toBe(expected);
  });
});
