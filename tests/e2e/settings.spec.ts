import { expect, test, type Page } from "@playwright/test";
import { TEST_PASSWORD, TEST_USERS } from "./support/fake-supabase";
import { waitForHydration } from "./support/hydration";

/*
 * Site settings change the public site for everyone (contact details, footer
 * links, the inquiry form), so this file runs in its own Playwright project
 * after all other admin tests, one test at a time, and every test puts back
 * what it changed. The values are test data in the fake database only.
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

async function openSettings(page: Page) {
  await page.goto("/admin/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await waitForHydration(page);
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();
}

const field = (page: Page, name: string) => page.getByRole("textbox", { name, exact: true });

const DETAILS = {
  Email: "hello@chef.example.test",
  Phone: "+251 11 000 0000",
  "WhatsApp number": "+251 91 000 0000",
  "Telegram username": "@chef_e2e_test",
  "Location in English": "Test City",
  "Location in Amharic": "የሙከራ ከተማ",
  Instagram: "instagram.com/chef.e2e.test",
} as const;

test.describe("site settings", () => {
  test("rejects a link to another website and saves nothing", async ({ page }) => {
    await signIn(page, TEST_USERS.admin.email);
    await openSettings(page);
    await field(page, "Instagram").fill("https://instagram.com.evil.example/chef");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Some details are not valid. Check the highlighted fields." }),
    ).toBeVisible();
    await expect(field(page, "Instagram")).toHaveAttribute("aria-invalid", "true");
    await expect(
      page.getByText("Enter a link to a page on this platform, starting with https://"),
    ).toBeVisible();
    await expect(field(page, "Instagram")).toBeFocused();

    await page.goto("/en/contact");
    await expect(page.getByRole("heading", { name: "Direct contact" })).toHaveCount(0);
  });

  test("contact details and social links appear on the public site", async ({ page, browser, baseURL }) => {
    // Leaving the form with unsaved changes asks first; these tests leave on purpose.
    page.on("dialog", (dialog) => void dialog.accept());
    // An anonymous visitor in a browser of their own (opening /am also switches the admin's language).
    const visitorContext = await browser.newContext({ baseURL });
    const visitor = await visitorContext.newPage();

    await signIn(page, TEST_USERS.owner.email);
    await openSettings(page);
    for (const [label, value] of Object.entries(DETAILS)) await field(page, label).fill(value);
    await save(page);

    await visitor.goto("/en/contact");
    const details = visitor.getByRole("heading", { name: "Direct contact" }).locator("..");
    await expect(details.getByRole("link", { name: "+251 11 000 0000" })).toHaveAttribute(
      "href",
      "tel:+251110000000",
    );
    await expect(details.getByRole("link", { name: "+251 91 000 0000" })).toHaveAttribute(
      "href",
      "https://wa.me/251910000000",
    );
    await expect(details.getByRole("link", { name: "@chef_e2e_test" })).toHaveAttribute(
      "href",
      "https://t.me/chef_e2e_test",
    );
    await expect(details.getByRole("link", { name: "hello@chef.example.test" })).toHaveAttribute(
      "href",
      "mailto:hello@chef.example.test",
    );
    await expect(details.getByText("Test City")).toBeVisible();
    await expect(
      visitor.getByRole("navigation", { name: "Social media" }).getByRole("link", { name: "Instagram" }),
    ).toHaveAttribute("href", "https://instagram.com/chef.e2e.test");

    // The Amharic location waits for a fluent speaker's review: English is shown, marked as English.
    await visitor.goto("/am/contact");
    await expect(visitor.getByText("Test City")).toHaveAttribute("lang", "en");
    await expect(visitor.getByText("የሙከራ ከተማ")).toHaveCount(0);

    await openSettings(page);
    await page.getByRole("checkbox", { name: /Reviewed by a fluent Amharic speaker/ }).check();
    await save(page);
    await expect(page.getByText(/^Reviewed \d/)).toBeVisible();
    await visitor.goto("/am/contact");
    await expect(visitor.getByText("የሙከራ ከተማ")).toBeVisible();

    // Editing the Amharic text clears the review again.
    await openSettings(page);
    await field(page, "Location in Amharic").fill("የሙከራ ከተማ 2");
    await expect(
      page.getByRole("checkbox", { name: /Reviewed by a fluent Amharic speaker/ }),
    ).not.toBeChecked();
    await expect(
      page.getByText("The text changed, so the review will be cleared when you save."),
    ).toBeVisible();

    // Each save is in the audit log, naming the changed fields.
    await page.goto("/admin/audit-log?category=settings");
    const entries = page.getByRole("listitem").filter({ hasText: "Website settings saved" });
    await expect(entries.last()).toContainText("Changed: Email, Phone");
    await expect(entries.first()).toContainText("Changed: Amharic location review");
    await expect(entries.first()).toContainText(`by ${TEST_USERS.owner.name}`);
    await expect(entries.first().getByRole("link", { name: "Website settings" })).toHaveAttribute(
      "href",
      "/admin/settings",
    );

    // Put the settings back for the other tests.
    await openSettings(page);
    for (const label of Object.keys(DETAILS)) await field(page, label).fill("");
    await save(page);
    await visitor.goto("/en/contact");
    await expect(visitor.getByRole("heading", { name: "Direct contact" })).toHaveCount(0);
    await expect(visitor.getByRole("navigation", { name: "Social media" })).toHaveCount(0);
    await visitorContext.close();
  });

  test("staff can pause new event inquiries and open them again", async ({ page }) => {
    await signIn(page, TEST_USERS.owner.email);
    await openSettings(page);
    const toggle = page.getByRole("switch", { name: /Accept new event inquiries/ });
    await expect(toggle).toBeChecked();
    await page.getByText("Accept new event inquiries").click();
    await expect(toggle).not.toBeChecked();
    await page.getByRole("button", { name: "Save settings" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Pause new event inquiries?" });
    await dialog.getByRole("button", { name: "Pause and save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Settings saved." })).toBeVisible();

    await page.goto("/en/book");
    await expect(page.getByRole("heading", { name: "New inquiries are paused" })).toBeVisible();
    await expect(page.getByRole("status").getByRole("link", { name: "Contact" })).toHaveAttribute(
      "href",
      "/en/contact",
    );
    await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);

    await openSettings(page);
    await page.getByText("Accept new event inquiries").click();
    await expect(toggle).toBeChecked();
    await save(page);
    await page.goto("/en/book");
    await expect(page.getByRole("heading", { name: "New inquiries are paused" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
  });
});
