import { expect, test, type Page } from "@playwright/test";

const IVORY = "rgb(245, 240, 230)";
const CHARCOAL = "rgb(23, 29, 26)";

const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test.describe("locale routing", () => {
  test("redirects / to English by default", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
  });

  test.describe("with an Amharic browser", () => {
    test.use({ locale: "am-ET" });

    test("redirects / to Amharic", async ({ page }) => {
      await page.goto("/");
      await expect(page).toHaveURL(/\/am$/);
    });
  });

  test("renders the English homepage without console errors", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Ethiopian cuisine for your most important gatherings.",
    );
    await expect(page).toHaveTitle(/Chief Harena/);
    await expect(page.locator('link[rel="alternate"][hreflang="am"]')).toHaveAttribute("href", /\/am$/);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByText("Preview: placeholder copy and photography")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("renders the Amharic homepage in Amharic with Ethiopic fonts", async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await page.goto("/am");
    await expect(page.locator("html")).toHaveAttribute("lang", "am");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ለልዩ አጋጣሚዎችዎ የተዘጋጀ የኢትዮጵያ ምግብ።");
    await expect(page.getByRole("navigation", { name: "ዋና ማውጫ" })).toBeVisible();

    await page.evaluate(() => document.fonts.ready);
    const loadedFamilies = await page.evaluate(() =>
      [...document.fonts].filter((face) => face.status === "loaded").map((face) => face.family),
    );
    // A face only loads when glyphs in its unicode-range are actually rendered.
    expect(loadedFamilies.some((family) => family.includes("Noto Sans Ethiopic"))).toBe(true);
    expect(loadedFamilies.some((family) => family.includes("Noto Serif Ethiopic"))).toBe(true);
    expect(errors).toEqual([]);
  });

  test("language switcher keeps the page and remembers the choice", async ({ page, context }) => {
    await page.goto("/en");
    await page.getByRole("group", { name: "Language" }).first().getByRole("link", { name: "አማርኛ" }).click();
    await expect(page).toHaveURL(/\/am$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "am");

    const cookie = (await context.cookies()).find((c) => c.name === "NEXT_LOCALE");
    expect(cookie?.value).toBe("am");

    await page.goto("/");
    await expect(page).toHaveURL(/\/am$/);
  });

  test("unknown pages return a localized 404", async ({ page }) => {
    const en = await page.goto("/en/this-page-does-not-exist");
    expect(en?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("We couldn't find that page");

    const am = await page.goto("/am/this-page-does-not-exist");
    expect(am?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("ገጹን ማግኘት አልቻልንም");
  });
});

test.describe("theme", () => {
  test.use({ colorScheme: "dark" });

  test("follows the operating system on first visit", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
    expect(await bodyBackground(page)).toBe(CHARCOAL);
  });

  test("persists an explicit choice across reloads and navigation", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("button", { name: /^Theme/ }).click();
    await page.getByRole("menuitemradio", { name: "Light" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await bodyBackground(page)).toBe(IVORY);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    expect(await bodyBackground(page)).toBe(IVORY);

    await page.goto("/am");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: /^ገጽታ/ }).click();
    await page.getByRole("menuitemradio", { name: "እንደ መሣሪያው" }).click();
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
    expect(await page.evaluate(() => localStorage.getItem("chief-harena:theme"))).toBeNull();
    expect(await bodyBackground(page)).toBe(CHARCOAL);
  });

  test("applies a stored theme before first paint", async ({ page, request }) => {
    // The theme script is inline in <head>, ahead of any body content.
    const html = await (await request.get("/en")).text();
    expect(html.indexOf("chief-harena:theme")).toBeGreaterThan(-1);
    expect(html.indexOf("chief-harena:theme")).toBeLessThan(html.indexOf("<body"));

    await page.addInitScript(() => {
      localStorage.setItem("chief-harena:theme", "light");
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as { themeAtParse: string | null }).themeAtParse =
          document.documentElement.getAttribute("data-theme");
      });
    });
    await page.goto("/en");
    expect(
      await page.evaluate(() => (window as unknown as { themeAtParse: string | null }).themeAtParse),
    ).toBe("light");
  });
});

test.describe("accessibility basics", () => {
  test("skip link is the first focus stop and moves focus to main content", async ({ page }) => {
    await page.goto("/en");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main-content")).toBeFocused();
  });

  test("mobile menu is a modal dialog that closes with Escape", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/en");
    const trigger = page.getByRole("button", { name: "Open menu" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Menu" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("link", { name: "Services" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("has no horizontal overflow at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const path of ["/en", "/am"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test.describe("with reduced motion requested", () => {
    test.use({ reducedMotion: "reduce" });

    test("disables smooth scrolling", async ({ page }) => {
      await page.goto("/en");
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe(
        "auto",
      );
    });
  });
});

test.describe("security headers", () => {
  test("are sent with public pages", async ({ request }) => {
    const response = await request.get("/en");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("robots.txt keeps crawlers out of the admin", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /admin");
  });
});
