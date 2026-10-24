import { expect, test } from "@playwright/test";

// Runs against the production build started WITHOUT Supabase configuration.
test.describe("admin without Supabase configuration", () => {
  test("fails closed and explains the missing setup", async ({ page }) => {
    const response = await page.goto("/admin/overview");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Foverview$/);
    await expect(page.getByRole("heading", { name: "Authentication is not configured" })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Admin" })).toHaveCount(0);
    expect(response?.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  });

  test("the admin index redirects into the same gate", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("redirects at the proxy before rendering any protected markup", async ({ request }) => {
    for (const path of ["/admin/overview", "/admin/bookings", "/admin/users"]) {
      const response = await request.get(path, { maxRedirects: 0 });
      expect(response.status(), path).toBe(307);
      expect(response.headers()["location"], path).toMatch(/\/admin\/login\?next=/);
      expect(response.headers()["cache-control"], path).toContain("no-store");
    }
  });
});
