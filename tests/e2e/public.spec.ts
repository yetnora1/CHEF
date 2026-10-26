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
    // The inquiry band describes the form that exists (Stage 2), not one still to come.
    await expect(page.getByText("through the inquiry form")).toBeVisible();
    // Demo mode is off in every normal build.
    await expect(page.getByText("Demo mode.")).toHaveCount(0);
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

  test("the header marks the current page", async ({ page }) => {
    const planEvent = page.getByRole("banner").getByRole("link", { name: "Plan an event" });
    await page.goto("/en/book");
    await expect(planEvent).toHaveAttribute("aria-current", "page");
    await page.goto("/en/privacy");
    await expect(planEvent).not.toHaveAttribute("aria-current");
  });

  test("tablets get the menu button; the inline navigation starts at desktop width", async ({ page }) => {
    // With every section published the five inline links would not fit beside the actions.
    for (const width of [768, 1000]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/en");
      await expect(page.getByRole("navigation", { name: "Primary" }), `${width}`).toBeHidden();
      await expect(page.getByRole("button", { name: "Open menu" }), `${width}`).toBeVisible();
      await expect(page.getByRole("banner").getByRole("link", { name: "Plan an event" })).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${width}`).toBeLessThanOrEqual(0);
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/en");
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();
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

test.describe("content pages without a content database", () => {
  test("list pages show an empty state and ask not to be indexed", async ({ page }) => {
    for (const [path, heading] of [
      ["/en/services", "Culinary services"],
      ["/en/menu", "The menu"],
      ["/en/gallery", "Gallery"],
      ["/en/journal", "Journal"],
      ["/am/services", "የምግብ አገልግሎቶች"],
    ] as const) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(heading);
      await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute("content", /noindex/);
    }
    await expect(page.getByRole("link", { name: "ዝግጅት ያቅዱ" }).last()).toHaveAttribute("href", "/am/book");
  });

  test("the About page and unknown entries show the not-found page and are never indexed", async ({
    page,
  }) => {
    // Prerendered at build time: a real 404.
    for (const path of ["/en/about", "/am/about", "/en/services/__none__"]) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }
    // A slug without a prerendered page streams from the shell on its first request, so the
    // status may be 200 ("soft 404", docs/CMS.md#caching); Next.js then caches the 404.
    for (const [path, heading] of [
      ["/en/services/wedding-feasts", "We couldn't find that page"],
      ["/am/journal/first-post", "ገጹን ማግኘት አልቻልንም"],
    ] as const) {
      const response = await page.goto(path);
      expect([200, 404], path).toContain(response?.status());
      await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(heading);
      await expect(page.locator('meta[name="robots"]').first(), path).toHaveAttribute("content", /noindex/);
      await expect.poll(async () => (await page.request.get(path)).status(), { message: path }).toBe(404);
    }
  });

  test("navigation links homepage sections until pages are published", async ({ page }) => {
    await page.goto("/en");
    const nav = page.getByRole("navigation", { name: "Primary" });
    await expect(nav.getByRole("link", { name: "The chef" })).toHaveAttribute("href", "/en#about");
    await expect(nav.getByRole("link", { name: "Services" })).toHaveAttribute("href", "/en#services");
    for (const hidden of ["Menu", "Gallery", "Journal"]) {
      await expect(nav.getByRole("link", { name: hidden, exact: true })).toHaveCount(0);
    }
  });

  test("no image is served, and nothing outside generated names", async ({ request }) => {
    const image = await request.get(
      "/media/assets/0b9f4a8e-5c1d-4f3a-9e2b-7d6c5b4a3f21/0123456789abcdef0123456789abcdef.jpg",
    );
    expect(image.status()).toBe(404);
    expect(image.headers()["cache-control"]).toBe("no-store");
    expect(image.headers()["x-content-type-options"]).toBe("nosniff");
    for (const path of ["/media/..%2F..%2Fpackage.json", "/media/assets/x/y.svg", "/media/robots.txt"]) {
      expect((await request.get(path)).status(), path).toBe(404);
    }
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
