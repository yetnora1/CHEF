import { describe, expect, it } from "vitest";
import { modulesFor } from "@/features/admin/modules";
import { ROLE_PERMISSIONS, type AppRole } from "@/lib/permissions/matrix";

const keysFor = (role: AppRole) => modulesFor(ROLE_PERMISSIONS[role]).map((m) => m.key);

describe("admin module visibility", () => {
  it("shows the owner every module", () => {
    expect(keysFor("owner")).toHaveLength(11);
  });

  it("never lists customer inquiries for content editors or analysts", () => {
    for (const role of ["content_editor", "analyst"] as const) {
      expect(keysFor(role)).not.toContain("bookings");
    }
  });

  it("limits event managers to the inquiry inbox", () => {
    expect(keysFor("event_manager")).toEqual(["overview", "bookings"]);
  });

  it("keeps user management and the audit log away from non-managers", () => {
    for (const role of ["content_editor", "event_manager", "analyst"] as const) {
      expect(keysFor(role)).not.toContain("users");
      expect(keysFor(role)).not.toContain("auditLog");
    }
  });
});
