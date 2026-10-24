import { describe, expect, it } from "vitest";
import { ADMIN_HOME_PATH, safeAdminRedirect } from "@/lib/auth/redirect";

describe("safeAdminRedirect", () => {
  it.each([
    ["/admin/overview", "/admin/overview"],
    ["/admin/bookings?status=new#top", "/admin/bookings?status=new#top"],
    ["/admin", "/admin"],
  ])("keeps the in-app admin path %s", (input, expected) => {
    expect(safeAdminRedirect(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    "",
    "https://evil.example/admin",
    "//evil.example/admin",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "/en",
    "/administrator",
    "/admin/../en",
    "/admin/login",
    "/admin/\u0000overview",
    "/admin/" + "a".repeat(600),
  ])("falls back to the dashboard for %j", (input) => {
    expect(safeAdminRedirect(input)).toBe(ADMIN_HOME_PATH);
  });
});
