import { describe, expect, it } from "vitest";
import { modulesFor } from "@/features/admin/modules";
import { ROLE_PERMISSIONS, type AppRole } from "@/lib/permissions/matrix";

const keysFor = (role: AppRole) => modulesFor(ROLE_PERMISSIONS[role]).map((m) => m.key);

describe("admin module visibility", () => {
  it("shows the owner every module", () => {
    expect(keysFor("owner")).toHaveLength(12);
  });

  const CMS_MODULES = ["pages", "services", "menu", "gallery", "journal", "media", "translations"];

  it("gives content editors exactly the content modules", () => {
    expect(keysFor("content_editor")).toEqual(["overview", ...CMS_MODULES]);
  });

  it("lists no content module for event managers or analysts", () => {
    for (const role of ["event_manager", "analyst"] as const) {
      for (const key of CMS_MODULES) expect(keysFor(role), `${role} ${key}`).not.toContain(key);
    }
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
