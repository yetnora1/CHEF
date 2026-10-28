import { describe, expect, it } from "vitest";
import { capabilitiesOf, PRIVILEGED_ROLES, ROLE_CAPABILITIES, roleEditing } from "@/features/staff/roles";
import { APP_PERMISSIONS, ROLE_PERMISSIONS, type AppPermission } from "@/lib/permissions/matrix";

const OWNER = { id: "owner", permissions: ROLE_PERMISSIONS.owner };
const ADMIN = { id: "admin", permissions: ROLE_PERMISSIONS.admin };
const EDITOR = { id: "editor", permissions: ROLE_PERMISSIONS.content_editor };

describe("role guide", () => {
  it("names every permission in exactly one capability", () => {
    const named = ROLE_CAPABILITIES.flatMap((capability): readonly AppPermission[] => capability.permissions);
    expect([...named].sort()).toEqual([...APP_PERMISSIONS].sort());
  });

  it("lists the owner's capabilities without the narrower assigned-inquiries one", () => {
    const owner = capabilitiesOf("owner");
    expect(owner).toContain("allInquiries");
    expect(owner).toContain("privilegedStaff");
    expect(owner).not.toContain("assignedInquiries");
  });

  it("matches the reviewed matrix for the other roles", () => {
    expect(capabilitiesOf("admin")).toEqual([
      "admin",
      "reports",
      "content",
      "allInquiries",
      "messages",
      "staff",
      "settings",
      "audit",
    ]);
    expect(capabilitiesOf("content_editor")).toEqual(["admin", "content"]);
    expect(capabilitiesOf("event_manager")).toEqual(["admin", "assignedInquiries"]);
    expect(capabilitiesOf("analyst")).toEqual(["admin", "reports"]);
  });
});

describe("who may change whose roles", () => {
  it("lets owners change anyone else, with every role available", () => {
    expect(roleEditing(OWNER, { id: "other", roles: ["owner"] })).toEqual({
      editable: true,
      lockedRoles: [],
    });
    expect(roleEditing(OWNER, { id: "other", roles: [] })).toEqual({ editable: true, lockedRoles: [] });
  });

  it("lets administrators manage non-privileged accounts, with owner and admin locked", () => {
    expect(roleEditing(ADMIN, { id: "other", roles: ["event_manager"] })).toEqual({
      editable: true,
      lockedRoles: PRIVILEGED_ROLES,
    });
  });

  it("keeps administrators away from owner and administrator accounts", () => {
    for (const role of PRIVILEGED_ROLES) {
      expect(roleEditing(ADMIN, { id: "other", roles: [role, "analyst"] })).toEqual({
        editable: false,
        reason: "privilegedAccount",
      });
    }
  });

  it("never offers changes to one's own roles", () => {
    expect(roleEditing(OWNER, { id: "owner", roles: ["owner"] })).toEqual({
      editable: false,
      reason: "self",
    });
  });

  it("offers nothing without users.manage", () => {
    expect(roleEditing(EDITOR, { id: "other", roles: [] })).toEqual({
      editable: false,
      reason: "noPermission",
    });
  });
});
