import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { E2E_CLIENT_IP_HEADER } from "./support/constants";
import { TEST_PASSWORD, TEST_USERS } from "./support/fake-supabase";
import { waitForHydration } from "./support/hydration";

/*
 * Runs against the dev server wired to the fake Supabase test double: every
 * data call executes the real SQL functions, grants and RLS on PGlite, with
 * CAPTCHA in the explicit local-bypass mode (see inquiries.spec.ts).
 */

test.beforeEach(async ({ page }) => {
  // Each test gets its own client "IP" so rate limits do not leak between tests.
  await page.setExtraHTTPHeaders({
    [E2E_CLIENT_IP_HEADER]: `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
  });
});

async function openContactPage(page: Page, path = "/en/contact") {
  await page.goto(path);
  await waitForHydration(page);
}

async function sendMessage(page: Page, subject: string): Promise<string> {
  await openContactPage(page);
  const form = page.getByRole("form", { name: "Send a message" });
  await form.getByLabel("Full name").fill("Selam Tesfaye");
  await form
    .getByRole("textbox", { name: "Email", exact: true })
    .fill(`selam-${randomUUID().slice(0, 8)}@example.test`);
  await form.getByLabel("Subject").fill(subject);
  await form
    .getByRole("textbox", { name: "Message" })
    .fill("Do you cater small family dinners at home?\nThank you.");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Send message" }).click();
  const reference = page.getByTestId("contact-reference");
  await expect(reference).toHaveText(/^CM-[0-9A-F]{10}$/, { timeout: 15_000 });
  return (await reference.textContent())!;
}

async function signIn(page: Page, email: string) {
  await page.goto("/admin/login");
  await waitForHydration(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible({ timeout: 15_000 });
  await waitForHydration(page);
}

test.describe("public contact form", () => {
  test("renders in English and Amharic beside the event inquiry shortcut", async ({ page }) => {
    await openContactPage(page);
    await expect(page.getByRole("heading", { level: 2, name: "Send a message" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Planning an event?" })).toBeVisible();

    await openContactPage(page, "/am/contact");
    await expect(page.getByRole("heading", { level: 2, name: "መልእክት ይላኩ" })).toBeVisible();
    await expect(page.getByLabel("ሙሉ ስም")).toBeVisible();
  });

  test("checks the fields before sending and moves focus to the first problem", async ({ page }) => {
    await openContactPage(page);
    const form = page.getByRole("form", { name: "Send a message" });
    await form.getByRole("button", { name: "Send message" }).click();
    const fullName = form.getByLabel("Full name");
    await expect(fullName).toBeFocused();
    await expect(fullName).toHaveAttribute("aria-invalid", "true");
    await expect(fullName).toHaveAccessibleDescription("This field is required.");
    await expect(form.getByText("This field is required.")).toHaveCount(3);
    await expect(form.getByText("Please accept to send your message.")).toBeVisible();
    // Optional fields are never flagged when left empty.
    await expect(form.getByLabel("Subject")).not.toHaveAttribute("aria-invalid");
    await expect(page.getByTestId("contact-reference")).toHaveCount(0);

    // Errors clear as the visitor fixes them.
    await fullName.fill("Selam Tesfaye");
    await expect(fullName).not.toHaveAttribute("aria-invalid");
  });

  test("sends a message and offers to write another", async ({ page }) => {
    await sendMessage(page, `Menu question ${randomUUID().slice(0, 6)}`);
    await expect(
      page.getByRole("heading", { name: "Thank you. Your message has been received" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Send another message" }).click();
    await expect(page.getByRole("form", { name: "Send a message" }).getByLabel("Full name")).toHaveValue("");
  });
});

test.describe("admin message inbox", () => {
  test("an owner reads a new message, replies by email and marks it handled", async ({ page }) => {
    const subject = `Tasting menu ${randomUUID().slice(0, 6)}`;
    const reference = await sendMessage(page, subject);

    await signIn(page, TEST_USERS.owner.email);
    await expect(
      page.getByRole("link", { name: /new messages? (is|are) waiting for a reply/ }),
    ).toBeVisible();
    await page.goto("/admin/messages");
    await waitForHydration(page);

    const card = page.getByRole("article", { name: subject });
    await expect(card).toBeVisible();
    await expect(card.getByText(reference)).toBeVisible();
    await expect(card.getByText("Do you cater small family dinners at home?")).toBeVisible();
    await expect(card.getByRole("link", { name: "Reply by email" })).toHaveAttribute(
      "href",
      new RegExp(
        `^mailto:selam-[0-9a-f]{8}@example\\.test\\?subject=Re%3A%20${encodeURIComponent(subject)}$`,
      ),
    );

    // A server action plus a re-render on the dev server: allow for a slow first compile.
    await card.getByRole("button", { name: "Mark as handled" }).click();
    await expect(page.getByRole("article", { name: subject })).toHaveCount(0, { timeout: 15_000 });

    await page.getByRole("link", { name: /^Handled/ }).click();
    const handled = page.getByRole("article", { name: subject });
    await expect(handled.getByText(/^Handled by Owner Test on /)).toBeVisible({ timeout: 15_000 });
    await expect(handled.getByRole("button", { name: "Move back to new" })).toBeVisible();
  });

  test("content editors cannot open the inbox", async ({ page }) => {
    await signIn(page, TEST_USERS.editor.email);
    await expect(page.getByRole("navigation").getByText("Messages", { exact: true })).toHaveCount(0);
    await page.goto("/admin/messages");
    await expect(page.getByRole("heading", { name: "You don't have access to this area" })).toBeVisible();
  });
});
