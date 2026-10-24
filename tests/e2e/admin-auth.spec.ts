import { expect, test, type Page } from "@playwright/test";
import { TEST_PASSWORD, TEST_USERS } from "./support/fake-supabase";

/*
 * Runs against a dev server whose Supabase URL points at the fake Supabase test
 * double (tests/e2e/support/fake-supabase.ts). The application code is
 * unmodified: these tests exercise the real proxy, Server Component
 * authorization and UI, with roles served the way get_my_access() serves them.
 */

async function signIn(page: Page, email: string, password = TEST_PASSWORD, path = "/admin/login") {
  await page.goto(path);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

const adminNav = (page: Page) => page.getByRole("navigation", { name: "Admin" }).first();

test.describe("admin authentication", () => {
  test("redirects visitors without a session to the login page", async ({ page }) => {
    await page.goto("/admin/overview");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Foverview$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByText("There is no public registration.")).toBeVisible();
  });

  test("rejects a wrong password with a generic message", async ({ page }) => {
    await signIn(page, TEST_USERS.owner.email, "wrong-password");
    await expect(page.locator("form").getByRole("alert")).toHaveText("The email or password is incorrect.");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("does not reveal whether an account exists", async ({ page }) => {
    await signIn(page, "nobody@example.test", "wrong-password");
    await expect(page.locator("form").getByRole("alert")).toHaveText("The email or password is incorrect.");
  });

  test("validates the form before contacting the server", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Enter your password.")).toBeVisible();
  });

  test("ignores a forged session cookie", async ({ page, context }) => {
    const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const forgedJwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
      sub: "00000000-0000-0000-0000-000000000001",
      role: "authenticated",
      app_metadata: { role: "owner" },
      exp: Math.floor(Date.now() / 1000) + 3600,
    })}.forged-signature`;
    const session = {
      access_token: forgedJwt,
      refresh_token: "forged",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: "00000000-0000-0000-0000-000000000001", role: "authenticated", aud: "authenticated" },
    };
    await context.addCookies([
      { name: "sb-127-auth-token", value: `base64-${b64(session)}`, domain: "localhost", path: "/" },
    ]);

    await page.goto("/admin/overview");
    await expect(page).toHaveURL(/\/admin\/login/);
    await expect(page.getByText("Modules for your role")).toHaveCount(0);
  });

  test("never redirects off-site after sign-in", async ({ page }) => {
    await signIn(page, TEST_USERS.owner.email, TEST_PASSWORD, "/admin/login?next=https://evil.example/steal");
    await expect(page).toHaveURL(/^http:\/\/localhost:3101\/admin\/overview$/);
  });
});

test.describe("role-based admin access", () => {
  test("a signed-in user without a staff role is denied", async ({ page }) => {
    await signIn(page, TEST_USERS.noRole.email);
    await expect(page.getByRole("heading", { name: "You don't have access to this area" })).toBeVisible();
    await expect(adminNav(page)).toHaveCount(0);
    await expect(page.getByText("Modules for your role")).toHaveCount(0);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByLabel("Password")).toBeVisible();
  });

  test("an analyst sees only the overview", async ({ page }) => {
    await signIn(page, TEST_USERS.analyst.email);
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    const nav = adminNav(page);
    await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await expect(nav.getByText("Inquiries & bookings")).toHaveCount(0);
    await expect(nav.getByText("Staff & roles")).toHaveCount(0);
    await expect(page.getByText("No modules are available for your role yet.")).toBeVisible();
  });

  test("a content editor sees content modules but no customer or security modules", async ({ page }) => {
    await signIn(page, TEST_USERS.editor.email);
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Translations" })).toBeVisible();
    const nav = adminNav(page);
    await expect(nav.getByText("Services")).toBeVisible();
    await expect(nav.getByText("Translations")).toBeVisible();
    for (const hidden of ["Inquiries & bookings", "Staff & roles", "Audit log", "Settings"]) {
      await expect(nav.getByText(hidden, { exact: true })).toHaveCount(0);
    }
  });

  test("an owner sees every module, keeps the session on reload, and can sign out", async ({ page }) => {
    await signIn(page, TEST_USERS.owner.email);
    const nav = adminNav(page);
    await expect(nav.getByRole("link", { name: "Inquiries & bookings" })).toBeVisible();
    for (const visible of ["Staff & roles", "Audit log", "Settings"]) {
      await expect(nav.getByText(visible, { exact: true })).toBeVisible();
    }

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();

    await page.getByRole("button", { name: "Account menu" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByText(TEST_USERS.owner.email)).toBeVisible();
    await expect(menu.getByText("Owner", { exact: true })).toBeVisible();
    await menu.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);

    await page.goto("/admin/overview");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("the admin interface switches to Amharic", async ({ page, context }) => {
    await signIn(page, TEST_USERS.owner.email);
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    await page.getByRole("group", { name: "Language" }).first().getByRole("button", { name: "አማርኛ" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "am");
    await expect(page.getByRole("heading", { level: 1, name: "አጠቃላይ እይታ" })).toBeVisible();
    expect((await context.cookies()).find((c) => c.name === "NEXT_LOCALE")?.value).toBe("am");
  });
});
