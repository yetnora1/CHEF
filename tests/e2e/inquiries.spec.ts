import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { E2E_CLIENT_IP_HEADER } from "./support/constants";
import { TEST_PASSWORD, TEST_USERS } from "./support/fake-supabase";

/*
 * Runs against the dev server wired to the fake Supabase test double: Auth is
 * simulated, but every data call executes the real SQL functions, grants and
 * RLS on PGlite. CAPTCHA runs in the explicit local-bypass mode (production
 * builds refuse it; see tests/unit/inquiry-config.test.ts).
 */

const unique = () => randomUUID().slice(0, 8);

test.beforeEach(async ({ page }) => {
  // Each test gets its own client "IP" so rate limits do not leak between tests.
  await page.setExtraHTTPHeaders({
    [E2E_CLIENT_IP_HEADER]: `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
  });
});

type InquiryInput = {
  name: string;
  email: string;
  eventType?: string;
  guests?: string;
  requirements?: string;
  eventDate?: string;
};

async function fillInquiry(page: Page, input: InquiryInput) {
  await page.getByLabel("Full name").fill(input.name);
  await page.getByRole("textbox", { name: "Email", exact: true }).fill(input.email);
  await page.getByLabel("Type of event").selectOption(input.eventType ?? "wedding");
  if (input.eventDate) await page.getByLabel("Event date").fill(input.eventDate);
  await page.getByLabel("Approximate number of guests").fill(input.guests ?? "120");
  await page
    .getByLabel("What would you like Chief Harena to provide?")
    .fill(input.requirements ?? "Dinner for guests");
  await page.getByRole("checkbox").check();
}

async function submitInquiry(page: Page, input: InquiryInput): Promise<string> {
  await page.goto("/en/book");
  await fillInquiry(page, input);
  await page.getByRole("button", { name: "Send inquiry" }).click();
  const reference = page.getByTestId("inquiry-reference");
  await expect(reference).toHaveText(/^CH-[0-9A-F]{10}$/, { timeout: 15_000 });
  return (await reference.textContent())!;
}

async function signIn(page: Page, email: string) {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible({ timeout: 15_000 });
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
}

test.describe("public inquiry form", () => {
  test("renders in English and Amharic with the local-testing notice", async ({ page }) => {
    await page.goto("/en/book");
    await expect(page.getByRole("heading", { level: 1, name: "Tell us about your event" })).toBeVisible();
    await expect(
      page.getByText("Development mode: the security check (CAPTCHA) is switched off"),
    ).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeVisible();

    await page.goto("/am/book");
    await expect(page.getByRole("heading", { level: 1, name: "ስለ ዝግጅትዎ ይንገሩን" })).toBeVisible();
    await expect(page.getByLabel("ሙሉ ስም")).toBeVisible();
    await expect(page.getByRole("button", { name: "ጥያቄውን ይላኩ" })).toBeVisible();
  });

  test("validates in the browser with an accessible error summary", async ({ page }) => {
    await page.goto("/en/book");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    const summary = page.getByRole("alert").filter({ hasText: "Please check" });
    await expect(summary).toBeFocused();
    await expect(summary).toContainText("Please check 6 fields");
    await expect(page.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");

    await page.getByLabel("Approximate number of guests").fill("0");
    await expect(page.getByText("There must be at least 1 guest.")).toBeVisible();
    await page.getByRole("textbox", { name: "Email", exact: true }).fill("not-an-email");
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
  });

  test("rejects past event dates", async ({ page }) => {
    await page.goto("/en/book");
    await fillInquiry(page, { name: "Date Tester", email: `date-${unique()}@example.test` });
    await page.getByLabel("Event date").fill("2020-01-01");
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.getByText("Choose a date from tomorrow onwards.")).toBeVisible();
  });

  test("accepts a valid inquiry with an honest acknowledgement", async ({ page }) => {
    const reference = await submitInquiry(page, {
      name: "Selam Tesfaye",
      email: `selam-${unique()}@example.test`,
    });
    const panel = page.getByRole("status");
    await expect(panel).toContainText("Your inquiry has been received");
    await expect(panel).toContainText("This is not a booking confirmation");
    await expect(panel).toContainText(reference);
    // No email is configured here, so nothing may claim an email was sent.
    await expect(page.locator("main")).not.toContainText(/email (has been|was) sent|check your inbox/i);
  });

  test("a retried submission after a network failure does not create a duplicate", async ({ page }) => {
    const email = `retry-${unique()}@example.test`;
    let dropped = false;
    await page.route("**/en/book", async (route) => {
      if (route.request().method() === "POST" && !dropped) {
        dropped = true;
        await route.fetch(); // the server receives and stores it…
        await route.abort("connectionreset"); // …but the browser never hears back
        return;
      }
      await route.continue();
    });

    await page.goto("/en/book");
    await fillInquiry(page, { name: "Retry Tester", email });
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText("The connection was interrupted");

    await page.getByRole("button", { name: "Send inquiry" }).click();
    const reference = await page.getByTestId("inquiry-reference").textContent({ timeout: 15_000 });

    await signIn(page, TEST_USERS.owner.email);
    await page.goto(`/admin/bookings?q=${encodeURIComponent(email)}`);
    const rows = page.locator("table tbody tr");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(reference!);
  });

  test("rate-limits repeated submissions from one source", async ({ page }) => {
    // The per-IP limit (5 per 10 minutes) counts in fixed windows aligned to the
    // epoch, so a burst that crosses a boundary is split between two windows and
    // the sixth request is allowed (a documented gap: docs/SECURITY_MODEL.md).
    // Start the burst well inside one window.
    const windowMs = 10 * 60 * 1000;
    const remainingMs = windowMs - (Date.now() % windowMs);
    if (remainingMs < 60_000) {
      test.slow();
      await page.waitForTimeout(remainingMs + 1_000);
    }
    await page.setExtraHTTPHeaders({ [E2E_CLIENT_IP_HEADER]: "203.0.113.77" });
    for (let i = 0; i < 5; i++) {
      await submitInquiry(page, { name: `Burst ${i}`, email: `burst-${i}-${unique()}@example.test` });
    }
    await page.goto("/en/book");
    await fillInquiry(page, { name: "Burst 6", email: `burst-6-${unique()}@example.test` });
    await page.getByRole("button", { name: "Send inquiry" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(
      "Too many inquiries have been sent from this connection",
    );
  });

  test("stores markup as inert text that staff see literally", async ({ page }) => {
    const payload = `<img src=x onerror="window.__xss=1"><script>window.__xss=1</script>`;
    const email = `xss-${unique()}@example.test`;
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });

    const reference = await submitInquiry(page, { name: "Markup Tester", email, requirements: payload });
    await signIn(page, TEST_USERS.owner.email);
    await page.goto(`/admin/bookings/${reference}`);
    await expect(page.getByText(payload, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
  });

  test.describe("on a phone", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the form fits the screen and can be submitted", async ({ page }) => {
      await page.goto("/en/book");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const box = await page.getByLabel("Full name").boundingBox();
      expect(box!.width).toBeGreaterThan(300);
      await fillInquiry(page, { name: "Mobile Tester", email: `mobile-${unique()}@example.test` });
      await page.getByRole("button", { name: "Send inquiry" }).click();
      await expect(page.getByTestId("inquiry-reference")).toBeVisible({ timeout: 15_000 });
    });
  });
});

test.describe("admin inquiry workflow", () => {
  test("owner reviews, assigns and annotates; the event manager then works it", async ({ page }) => {
    const email = `workflow-${unique()}@example.test`;
    const reference = await submitInquiry(page, {
      name: "Workflow Customer",
      email,
      eventType: "corporate",
      eventDate: "2027-03-14",
    });

    await signIn(page, TEST_USERS.owner.email);
    await page.goto(`/admin/bookings?q=${encodeURIComponent(email)}`);
    await expect(page.locator("table tbody tr").first()).toContainText("14 Mar 2027");
    await page.getByRole("link", { name: reference }).click();
    await expect(page.getByRole("heading", { level: 1, name: reference })).toBeVisible();
    await expect(page.locator("dd", { hasText: "14 Mar 2027" })).toBeVisible();

    // Only valid next steps are offered.
    const statusSelect = page.getByLabel("New status");
    const options = await statusSelect.locator("option:not([disabled])").allTextContents();
    expect(options).toEqual(["Reviewed", "Contacted", "Declined", "Cancelled"]);

    await statusSelect.selectOption("in_review");
    await page.getByLabel("Note (optional, kept in the history)").fill("Checked the date");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByText("New → Reviewed")).toBeVisible();
    await expect(page.getByText("Checked the date")).toBeVisible();

    // Assignment is offered only to staff who can work inquiries.
    const assignee = page.getByLabel("Assign to");
    const staff = await assignee.locator("option").allTextContents();
    expect(staff).toContain("Manager Test");
    expect(staff).not.toContain("Editor Test");
    expect(staff).not.toContain("Analyst Test");
    await assignee.selectOption({ label: "Manager Test" });
    await page.getByRole("button", { name: "Save assignment" }).click();
    await expect(page.getByLabel("Assign to")).toHaveValue(/.+/);

    await page.getByLabel("Add note").fill("Customer prefers a buffet");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Customer prefers a buffet")).toBeVisible();

    await signOut(page);
    await signIn(page, TEST_USERS.manager.email);
    await page.goto("/admin/bookings");
    await page.getByRole("link", { name: reference }).click();
    await expect(page.getByText("Customer prefers a buffet")).toBeVisible();
    await expect(page.getByLabel("Assign to")).toHaveCount(0);

    // Confirming asks for explicit confirmation first.
    await page.getByLabel("New status").selectOption("contacted");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByText("Reviewed → Contacted")).toBeVisible();
    await page.getByLabel("New status").selectOption("confirmed");
    await page.getByRole("button", { name: "Update status" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Confirm only when the date, services and terms have been agreed");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Contacted → Confirmed")).toHaveCount(0);
  });

  test("an event manager cannot open inquiries assigned to nobody or to others", async ({ page }) => {
    const reference = await submitInquiry(page, {
      name: "Unassigned Customer",
      email: `unassigned-${unique()}@example.test`,
    });

    await signIn(page, TEST_USERS.manager.email);
    await page.goto("/admin/bookings");
    await expect(page.getByRole("link", { name: reference })).toHaveCount(0);

    await page.goto(`/admin/bookings/${reference}`);
    await expect(page.getByRole("heading", { name: "Inquiry not found" })).toBeVisible();
    await expect(page.getByText("Unassigned Customer")).toHaveCount(0);
  });

  test("content editors and analysts cannot open the inbox; analysts see counts only", async ({ page }) => {
    const reference = await submitInquiry(page, {
      name: "Private Customer",
      email: `private-${unique()}@example.test`,
    });

    await signIn(page, TEST_USERS.editor.email);
    await page.goto("/admin/bookings");
    await expect(page.getByRole("heading", { name: "You don't have access to this area" })).toBeVisible();
    await page.goto(`/admin/bookings/${reference}`);
    await expect(page.getByText("Private Customer")).toHaveCount(0);
    await signOut(page);

    await signIn(page, TEST_USERS.analyst.email);
    await expect(page.getByRole("heading", { name: "Inquiries at a glance" })).toBeVisible();
    await expect(page.getByText("All inquiries")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open the inbox" })).toHaveCount(0);
    await page.goto("/admin/bookings");
    await expect(page.getByRole("heading", { name: "You don't have access to this area" })).toBeVisible();
  });

  test("the inbox filters by status and paginates", async ({ page }) => {
    await submitInquiry(page, {
      name: "Filter Customer",
      email: `filter-${unique()}@example.test`,
      eventType: "summit",
    });
    await signIn(page, TEST_USERS.admin.email);
    await page.goto("/admin/bookings?status=new&type=summit");
    const rows = page.locator("table tbody tr");
    expect(await rows.count()).toBeGreaterThan(0);
    for (const row of await rows.all()) {
      await expect(row).toContainText("New");
      await expect(row).toContainText("Conference or summit");
    }
    await expect(page.getByText(/\d+–\d+ of \d+/)).toBeVisible();
  });

  test("on a phone the inbox filters fold away and open on request", async ({ page }) => {
    await signIn(page, TEST_USERS.admin.email);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/bookings");
    const toggle = page.getByRole("button", { name: "Filter inquiries" });
    const search = page.getByRole("searchbox", { name: "Search" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(search).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(search).toBeVisible();

    // Active filters keep the panel open, and the toggle says how many apply.
    await page.goto("/admin/bookings?status=new&type=summit");
    await expect(page.getByRole("button", { name: /Filter inquiries\s*2 active/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(search).toBeVisible();
  });
});
