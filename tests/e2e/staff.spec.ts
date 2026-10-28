import { expect, test, type Page } from "@playwright/test";
import { TEST_PASSWORD, TEST_USERS } from "./support/fake-supabase";
import { waitForHydration } from "./support/hydration";

/*
 * Staff & roles and the audit log, against the fake Supabase test double: role
 * changes run the real set_user_roles / assign_role / revoke_role functions on
 * PGlite. Only the dedicated "newcomer" account's roles change, and the tests
 * run in order because each builds on the previous one.
 */

test.describe.configure({ mode: "serial" });

async function signIn(page: Page, email: string) {
  await page.goto("/admin/login");
  await waitForHydration(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible({ timeout: 15_000 });
}

async function openStaff(page: Page) {
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { level: 1, name: "Staff & roles" })).toBeVisible();
  await waitForHydration(page);
}

const row = (page: Page, name: string) =>
  page
    .getByRole("listitem")
    .filter({ has: page.getByText(name, { exact: true }) })
    .first();

test.describe("staff and roles", () => {
  test("lists every account with its roles, and explains how to add staff", async ({ page }) => {
    await signIn(page, TEST_USERS.owner.email);
    await openStaff(page);
    await expect(page.getByRole("heading", { name: "Adding a staff member" })).toBeVisible();

    const me = row(page, TEST_USERS.owner.name);
    await expect(me.getByText("You", { exact: true })).toBeVisible();
    await expect(me.getByText("You cannot change your own roles. Ask an owner to do it.")).toBeVisible();
    await expect(me.getByRole("button", { name: /Change roles/ })).toHaveCount(0);

    const newcomer = row(page, TEST_USERS.newcomer.name);
    await expect(newcomer.getByRole("list", { name: `Roles of ${TEST_USERS.newcomer.name}` })).toHaveText(
      "No role",
    );

    // The guide comes from the reviewed permission matrix (Owner, Administrator, Content editor,
    // Event manager, Analyst); seeing all inquiries includes the assigned ones.
    const guide = page.getByRole("table", { name: "What each role can do" });
    await expect(
      guide.getByRole("row", { name: /^See and update the inquiries assigned to them/ }).getByRole("cell"),
    ).toHaveText(["Yes", "Yes", "No", "Yes", "No"]);
    await expect(guide.getByRole("row", { name: /^Read the audit log/ }).getByRole("cell")).toHaveText([
      "Yes",
      "Yes",
      "No",
      "No",
      "No",
    ]);
  });

  test("an owner gives and removes roles, confirming owner-level access", async ({ page }) => {
    await signIn(page, TEST_USERS.owner.email);
    await openStaff(page);
    const newcomer = row(page, TEST_USERS.newcomer.name);

    await newcomer.getByRole("button", { name: `Change roles: ${TEST_USERS.newcomer.name}` }).click();
    await newcomer.getByRole("checkbox", { name: /^Event manager/ }).check();
    await newcomer.getByRole("button", { name: "Save roles" }).click();
    await expect(newcomer.getByRole("status")).toHaveText("Roles saved.");
    await expect(newcomer.getByRole("list", { name: `Roles of ${TEST_USERS.newcomer.name}` })).toHaveText(
      "Event manager",
    );

    // Administrator access is confirmed before it is saved.
    await newcomer.getByRole("button", { name: `Change roles: ${TEST_USERS.newcomer.name}` }).click();
    await newcomer.getByRole("checkbox", { name: /^Administrator/ }).check();
    await newcomer.getByRole("checkbox", { name: /^Event manager/ }).uncheck();
    await newcomer.getByRole("button", { name: "Save roles" }).click();
    const dialog = page.getByRole("alertdialog", {
      name: `Change the roles of ${TEST_USERS.newcomer.name}?`,
    });
    await expect(dialog).toContainText("Adds: Administrator.");
    await expect(dialog).toContainText("Removes: Event manager.");
    await dialog.getByRole("button", { name: "Save roles" }).click();
    await expect(newcomer.getByRole("list", { name: `Roles of ${TEST_USERS.newcomer.name}` })).toHaveText(
      "Administrator",
    );
  });

  test("an administrator cannot change owners or administrators", async ({ page }) => {
    await signIn(page, TEST_USERS.admin.email);
    await openStaff(page);
    await expect(
      row(page, TEST_USERS.owner.name).getByText(
        "Only an owner can change the roles of an owner or administrator.",
      ),
    ).toBeVisible();
    // The newcomer is an administrator now (previous test).
    await expect(
      row(page, TEST_USERS.newcomer.name).getByRole("button", { name: /Change roles/ }),
    ).toHaveCount(0);

    // A non-privileged account can be edited, without the owner and admin roles.
    const manager = row(page, TEST_USERS.manager.name);
    await manager.getByRole("button", { name: `Change roles: ${TEST_USERS.manager.name}` }).click();
    await expect(manager.getByRole("checkbox", { name: /^Owner/ })).toBeDisabled();
    await expect(manager.getByRole("checkbox", { name: /^Administrator/ })).toBeDisabled();
    await expect(manager.getByRole("checkbox", { name: /^Analyst/ })).toBeEnabled();
    await manager.getByRole("button", { name: "Cancel" }).click();
  });

  test("removing every role is confirmed and leaves the account without access", async ({ page }) => {
    await signIn(page, TEST_USERS.owner.email);
    await openStaff(page);
    const newcomer = row(page, TEST_USERS.newcomer.name);
    await newcomer.getByRole("button", { name: `Change roles: ${TEST_USERS.newcomer.name}` }).click();
    await newcomer.getByRole("checkbox", { name: /^Administrator/ }).uncheck();
    await newcomer.getByRole("button", { name: "Save roles" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("will have no role and will no longer be able to open the admin.");
    await dialog.getByRole("button", { name: "Save roles" }).click();
    await expect(newcomer.getByRole("list", { name: `Roles of ${TEST_USERS.newcomer.name}` })).toHaveText(
      "No role",
    );
  });

  test("the audit log shows each role change in plain language", async ({ page }) => {
    await signIn(page, TEST_USERS.owner.email);
    await page.goto("/admin/audit-log?category=role");
    await expect(page.getByRole("heading", { level: 1, name: "Audit log" })).toBeVisible();
    const entries = page.getByRole("listitem").filter({ hasText: TEST_USERS.newcomer.name });
    await expect(entries.filter({ hasText: "Role given: Event manager" })).toHaveCount(1);
    await expect(entries.filter({ hasText: "Role given: Administrator" })).toHaveCount(1);
    await expect(entries.filter({ hasText: "Role removed: Administrator" })).toHaveCount(1);
    await expect(entries.first()).toContainText(`by ${TEST_USERS.owner.name}`);
    await expect(entries.first().getByRole("link", { name: TEST_USERS.newcomer.name })).toHaveAttribute(
      "href",
      /^\/admin\/users#staff-[0-9a-f-]{36}$/,
    );

    // Filters narrow the log; other areas stay out of the role filter.
    await expect(page.getByRole("combobox", { name: "Area" })).toHaveValue("role");
    await expect(page.getByText("Website settings saved")).toHaveCount(0);
  });

  for (const role of ["editor", "manager", "analyst"] as const) {
    test(`a ${role} cannot open staff, settings or the audit log`, async ({ page }) => {
      await signIn(page, TEST_USERS[role].email);
      for (const path of ["/admin/users", "/admin/settings", "/admin/audit-log"]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { name: "You don't have access to this area" })).toBeVisible();
      }
    });
  }
});
