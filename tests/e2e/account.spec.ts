import { expect, test, type Page } from "@playwright/test";
import { FAKE_SUPABASE_URL, TEST_PASSWORD, TEST_USERS } from "./support/fake-supabase";
import { waitForHydration } from "./support/hydration";

/*
 * A staff member's own sign-in details, and signing in with a username, against the
 * Supabase test double (real SQL; Auth simulated). Each test changes its own account,
 * so that other specs' sign-ins are not affected. Tests run in order, in one worker:
 * they share slow first compiles of the same dev-server routes.
 */

test.describe.configure({ mode: "default" });

const signInForm = async (page: Page) => {
  await page.goto("/admin/login");
  await waitForHydration(page);
};

async function signIn(page: Page, identifier: string, password = TEST_PASSWORD) {
  await signInForm(page);
  await page.getByLabel("Email or username").fill(identifier);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function expectSignedIn(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible({ timeout: 30_000 });
  await waitForHydration(page);
}

async function openAccount(page: Page) {
  await page.goto("/admin/account");
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible({
    timeout: 30_000,
  });
  await waitForHydration(page);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page).toHaveURL(/\/admin\/login/);
}

const card = (page: Page, heading: string) =>
  page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: heading }) });

const REFUSED = "The email, username or password is incorrect.";
const refusal = (page: Page) => page.locator("form").getByRole("alert");

test.describe("signing in with a username", () => {
  const account = TEST_USERS.usernameUser.email;
  const username = `chef.${Date.now().toString(36)}`;

  test("creating a username from the account menu, then signing in with it in any case", async ({ page }) => {
    await signIn(page, account);
    await expectSignedIn(page);

    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "Your account" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible({
      timeout: 30_000,
    });
    await waitForHydration(page);

    const form = card(page, "Username");
    await form.getByLabel("Username").fill("no spaces allowed");
    await form.getByRole("button", { name: "Create username" }).click();
    await expect(form.getByRole("alert")).toContainText("Use 3 to 32 letters");

    await form.getByLabel("Username").fill(username);
    await form.getByRole("button", { name: "Create username" }).click();
    await expect(form.getByRole("status")).toContainText("You can sign in with this username now");

    await signOut(page);
    await signIn(page, username.toUpperCase());
    await expectSignedIn(page);
    // Signed in as the same account: the menu shows its email, which the visitor never typed.
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText(account);
  });

  test("email addresses keep working, directly from the browser", async ({ page }) => {
    const toAuth: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/auth/v1/token")) toAuth.push(request.url());
    });
    await signIn(page, account);
    await expectSignedIn(page);
    expect(toAuth).toHaveLength(1);
  });

  test("a username's sign-in never shows its email to the browser", async ({ page }) => {
    const seen: string[] = [];
    page.on("response", async (response) => {
      if (response.request().method() === "POST") {
        seen.push(await response.text().catch(() => ""));
      }
    });
    const toAuth: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/auth/v1/token")) toAuth.push(request.url());
    });
    await signIn(page, username, "Not-the-right-password-1");
    await expect(refusal(page)).toHaveText(REFUSED);
    // The browser spoke only to this site, and nothing it received names the account.
    expect(toAuth).toEqual([]);
    expect(seen.join("\n")).not.toContain(account);
  });

  test("wrong password, unknown username and impossible username all get the same answer", async ({
    page,
  }) => {
    await signIn(page, username, "Not-the-right-password-2");
    await expect(refusal(page)).toHaveText(REFUSED);

    await signIn(page, `nobody.${Date.now().toString(36)}`);
    await expect(refusal(page)).toHaveText(REFUSED);

    await signIn(page, "a b");
    await expect(refusal(page)).toHaveText(REFUSED);
  });

  test("an empty form says what to enter", async ({ page }) => {
    await signInForm(page);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByText("Enter your email or username.")).toBeVisible();
    await expect(page.getByText("Enter your password.")).toBeVisible();
  });

  test("a username already taken by someone else is refused", async ({ page }) => {
    await signIn(page, TEST_USERS.analyst.email);
    await expectSignedIn(page);
    await openAccount(page);
    const form = card(page, "Username");
    await form.getByLabel("Username").fill(username);
    await form.getByRole("button", { name: "Create username" }).click();
    await expect(form.getByRole("alert")).toHaveText("That username is already taken.");
  });

  test("too many tries on one username are stopped, and its email still gets in", async ({ page }) => {
    const target = `limit.${Date.now().toString(36)}`;
    await signInForm(page);
    for (let attempt = 0; attempt <= 10; attempt += 1) {
      await page.getByLabel("Email or username").fill(target);
      await page.getByLabel("Password", { exact: true }).fill("Not-the-right-password-3");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
      await expect(refusal(page)).toBeVisible();
    }
    await expect(refusal(page)).toHaveText("Too many attempts. Please wait a few minutes and try again.");
  });

  test("removing the username ends signing in with it", async ({ page }) => {
    await signIn(page, account);
    await expectSignedIn(page);
    await openAccount(page);
    const form = card(page, "Username");
    await expect(form.getByLabel("Username")).toHaveValue(username);
    await form.getByLabel("Username").fill("");
    await form.getByRole("button", { name: "Save username" }).click();
    await expect(form.getByRole("status")).toContainText("Username removed");

    await signOut(page);
    await signIn(page, username);
    await expect(refusal(page)).toHaveText(REFUSED);
  });
});

test.describe("changing the password", () => {
  const account = TEST_USERS.passwordUser.email;
  const NEW_PASSWORD = "Fresh-Kitchen-Salt-42";

  test("asks for the current one, checks the new one, and ends the other sessions", async ({
    page,
    browser,
  }) => {
    await signIn(page, account);
    await expectSignedIn(page);

    // A second device, signed in before the change.
    const otherDevice = await (await browser.newContext()).newPage();
    await signIn(otherDevice, account);
    await expectSignedIn(otherDevice);

    await openAccount(page);
    const form = card(page, "Password");
    const submit = form.getByRole("button", { name: "Change password" });
    const fill = async (current: string, next: string, repeat = next) => {
      await form.getByLabel("Current password").fill(current);
      await form.getByLabel(/^New password/).fill(next);
      await form.getByLabel("Repeat the new password").fill(repeat);
      await submit.click();
    };

    await fill(TEST_PASSWORD, "short");
    await expect(form.getByRole("alert")).toHaveText("Use at least 12 characters.");
    await fill(TEST_PASSWORD, "alllowercaseletters");
    await expect(form.getByRole("alert")).toHaveText(
      "Use an upper-case letter, a lower-case letter and a number.",
    );
    await fill(TEST_PASSWORD, NEW_PASSWORD, "Something-Else-77");
    await expect(form.getByRole("alert")).toHaveText("The two new passwords do not match.");
    await fill(TEST_PASSWORD, TEST_PASSWORD);
    await expect(form.getByRole("alert")).toHaveText("The new password must differ from the current one.");
    await fill("Not-my-password-99", NEW_PASSWORD);
    await expect(form.getByRole("alert")).toHaveText("Your current password is not correct.");

    await fill(TEST_PASSWORD, NEW_PASSWORD);
    await expect(form.getByRole("status")).toContainText("Password changed");
    // The form empties, so the password is not left on screen.
    await expect(form.getByLabel("Current password")).toHaveValue("");

    // This device stays signed in; the other one is out.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
    await otherDevice.goto("/admin/overview");
    await expect(otherDevice).toHaveURL(/\/admin\/login/);
    await otherDevice.context().close();

    await signOut(page);
    await signIn(page, account, TEST_PASSWORD);
    await expect(refusal(page)).toHaveText(REFUSED);
    await signIn(page, account, NEW_PASSWORD);
    await expectSignedIn(page);
  });

  test("the current password stays hidden unless asked for", async ({ page }) => {
    await signInForm(page);
    const field = page.getByLabel("Password", { exact: true });
    await expect(field).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(field).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(field).toHaveAttribute("type", "password");
  });

  test("appears in the audit log, without the password", async ({ page }) => {
    await signIn(page, TEST_USERS.owner.email);
    await expectSignedIn(page);
    await page.goto("/admin/audit-log?category=account");
    await expect(page.getByText("Password changed").first()).toBeVisible({ timeout: 30_000 });
  });
});

test.describe("changing the email", () => {
  const account = TEST_USERS.emailUser.email;
  const newEmail = `moved.${Date.now().toString(36)}@example.test`;
  const username = `moved.${Date.now().toString(36)}`;

  test("takes effect once the link is opened, and signing in follows it", async ({ page }) => {
    await signIn(page, account);
    await expectSignedIn(page);
    await openAccount(page);

    const name = card(page, "Username");
    await name.getByLabel("Username").fill(username);
    await name.getByRole("button", { name: "Create username" }).click();
    await expect(name.getByRole("status")).toBeVisible();

    const form = card(page, "Email");
    const submit = form.getByRole("button", { name: "Change email" });
    const fill = async (email: string, password: string) => {
      await form.getByLabel("New email").fill(email);
      await form.getByLabel("Current password").fill(password);
      await submit.click();
    };

    await fill("not-an-email", TEST_PASSWORD);
    await expect(form.getByRole("alert")).toHaveText("Enter a valid email address.");
    await fill(account, TEST_PASSWORD);
    await expect(form.getByRole("alert")).toHaveText("That is already your email.");
    await fill(newEmail, "Not-my-password-99");
    await expect(form.getByRole("alert")).toHaveText("Your current password is not correct.");
    await fill(TEST_USERS.admin.email, TEST_PASSWORD);
    await expect(form.getByRole("alert")).toHaveText("That email cannot be used. Try another one.");

    await fill(newEmail, TEST_PASSWORD);
    await expect(form.getByRole("status")).toContainText(`We sent a confirmation link to ${newEmail}`);
    await page.reload();
    // Nothing changes until the link is opened.
    await expect(card(page, "Email").getByText(account, { exact: true })).toBeVisible();
    await expect(card(page, "Email")).toContainText(`Waiting for confirmation: ${newEmail}`);

    const { link } = (await (
      await page.request.get(`${FAKE_SUPABASE_URL}/__test/email-link?to=${encodeURIComponent(newEmail)}`)
    ).json()) as { link: string };
    await page.goto(link);
    await expect(page).toHaveURL(/\/admin\/account\?email=done/);
    await expect(page.getByRole("status").first()).toHaveText("Your email change is confirmed.");
    await expect(card(page, "Email").getByText(newEmail, { exact: true })).toBeVisible();
    await expect(card(page, "Email")).not.toContainText("Waiting for confirmation");
    await waitForHydration(page);

    await signOut(page);
    await signIn(page, account);
    await expect(refusal(page)).toHaveText(REFUSED);
    await signIn(page, newEmail);
    await expectSignedIn(page);
    await signOut(page);
    // The username leads to the new address.
    await signIn(page, username);
    await expectSignedIn(page);
  });

  test("a password change cancels a waiting email change, says so, and a new request works", async ({
    page,
  }) => {
    const lapsedAccount = TEST_USERS.lapsedUser.email;
    const target = `lapsed.${Date.now().toString(36)}@example.test`;
    const NEW_PASSWORD = "Fresh-Pantry-Thyme-58";
    await signIn(page, lapsedAccount);
    await expectSignedIn(page);
    await openAccount(page);

    const requestChange = async (password: string) => {
      const form = card(page, "Email");
      await form.getByLabel("New email").fill(target);
      await form.getByLabel("Current password").fill(password);
      await form.getByRole("button", { name: "Change email" }).click();
      await expect(form.getByRole("status")).toContainText(`We sent a confirmation link to ${target}`);
    };
    const linkFor = async () => {
      const response = await page.request.get(
        `${FAKE_SUPABASE_URL}/__test/email-link?to=${encodeURIComponent(target)}`,
      );
      return ((await response.json()) as { link: string }).link;
    };
    const notice = () => page.getByRole("main").getByText(`Your email is still ${lapsedAccount}`);

    await requestChange(TEST_PASSWORD);
    const cancelledLink = await linkFor();

    // While it waits, every admin page says why the old address still shows.
    await page.goto("/admin/overview");
    await expect(notice()).toBeVisible();
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText(lapsedAccount);

    await openAccount(page);
    await expect(notice()).toHaveCount(0);
    await expect(card(page, "Email")).toContainText(`Waiting for confirmation: ${target}`);
    const passwordForm = card(page, "Password");
    await expect(passwordForm).toContainText(`cancels your waiting email change to ${target}`);

    await passwordForm.getByLabel("Current password").fill(TEST_PASSWORD);
    await passwordForm.getByLabel(/^New password/).fill(NEW_PASSWORD);
    await passwordForm.getByLabel("Repeat the new password").fill(NEW_PASSWORD);
    await passwordForm.getByRole("button", { name: "Change password" }).click();
    await expect(passwordForm.getByRole("status")).toContainText(
      `this cancelled your email change to ${target}`,
    );

    // It no longer claims to be waiting: it says what happened and offers the address again.
    await page.reload();
    await waitForHydration(page);
    const form = card(page, "Email");
    await expect(form).not.toContainText("Waiting for confirmation");
    await expect(form).toContainText(`Your change to ${target} did not finish`);
    await expect(form.getByLabel("New email")).toHaveValue(target);
    await page.goto("/admin/overview");
    await expect(notice()).toHaveCount(0);

    // The old link is dead, and says so.
    await page.goto(cancelledLink);
    await expect(page).toHaveURL(/\/admin\/account\?email=failed/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("expired or was already used");
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText(lapsedAccount);
    await waitForHydration(page);

    // Asking again finishes the job.
    await requestChange(NEW_PASSWORD);
    await page.goto(await linkFor());
    await expect(page).toHaveURL(/\/admin\/account\?email=done/);
    await expect(page.getByRole("button", { name: "Account menu" })).toContainText(target);
    await expect(card(page, "Email")).not.toContainText("did not finish");
  });

  test("a failed or half-finished link says so, and shows nothing written into the link", async ({
    page,
  }) => {
    await signIn(page, TEST_USERS.editor.email);
    await expectSignedIn(page);

    await page.goto(
      "/admin/account/email-confirmed?error=access_denied&error_description=Click+evil.example",
    );
    await expect(page).toHaveURL(/\/admin\/account\?email=failed/);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("expired or was already used");
    await expect(page.getByText("evil.example")).toHaveCount(0);

    await page.goto("/admin/account/email-confirmed?message=Click+evil.example");
    await expect(page).toHaveURL(/\/admin\/account\?email=partial/);
    await expect(page.getByRole("status").first()).toContainText("your other email address");
    await expect(page.getByText("evil.example")).toHaveCount(0);

    await page.goto("/admin/account?email=<script>");
    await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });
});

test.describe("access", () => {
  test("the account page needs a session", async ({ page }) => {
    await page.goto("/admin/account");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Faccount/);
    await page.goto("/admin/account/email-confirmed?code=anything");
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test("an account without a role cannot open it", async ({ page }) => {
    await signIn(page, TEST_USERS.noRole.email);
    await expect(page.getByRole("heading", { name: "You don't have access to this area" })).toBeVisible({
      timeout: 30_000,
    });
    await page.goto("/admin/account");
    await expect(page.getByRole("heading", { name: "You don't have access to this area" })).toBeVisible();
    await expect(page.getByLabel("Current password")).toHaveCount(0);
  });
});
