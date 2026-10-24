import { expect, test } from "@playwright/test";

// Production build with no Supabase secret key and no CAPTCHA keys.
test.describe("inquiry page without server configuration", () => {
  test("says plainly that online inquiries are not open, and shows no form", async ({ page }) => {
    await page.goto("/en/book");
    await expect(page.getByRole("heading", { level: 1, name: "Tell us about your event" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Online inquiries are not open yet" })).toBeVisible();
    await expect(page.locator("form input[name=fullName]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send inquiry" })).toHaveCount(0);
    await expect(page.getByText("An inquiry is not a booking.")).toBeVisible();
  });

  test("is localized in Amharic", async ({ page }) => {
    await page.goto("/am/book");
    await expect(page.locator("html")).toHaveAttribute("lang", "am");
    await expect(page.getByRole("heading", { level: 1, name: "ስለ ዝግጅትዎ ይንገሩን" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "የመስመር ላይ ጥያቄዎች ገና አልተከፈቱም" })).toBeVisible();
  });

  test("is reached from the homepage call to action", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("link", { name: "Plan an event" }).first().click();
    await expect(page).toHaveURL(/\/en\/book$/);
  });
});

test.describe("privacy notice", () => {
  test("explains inquiry data handling and is marked as a draft for review", async ({ page }) => {
    await page.goto("/en/privacy");
    await expect(
      page.getByRole("heading", { level: 1, name: "How we handle your inquiry information" }),
    ).toBeVisible();
    await expect(page.getByRole("note")).toContainText("Draft for review");
    await expect(page.getByRole("heading", { name: "What we collect" })).toBeVisible();
    expect(await page.getByText("Owner review required").count()).toBeGreaterThan(0);
  });

  test("Amharic version is identified as a translation draft", async ({ page }) => {
    await page.goto("/am/privacy");
    await expect(page.locator("html")).toHaveAttribute("lang", "am");
    await expect(page.getByRole("note")).toContainText("የአማርኛው ትርጉም ረቂቅ ነው");
  });

  test("is linked from the footer", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL(/\/en\/privacy$/);
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 360, height: 780 } });

  test("booking and privacy pages fit a small phone", async ({ page }) => {
    for (const path of ["/en/book", "/am/book", "/en/privacy", "/am/privacy"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
});
