import { expect, test, type Page } from "@playwright/test";

const WHITE = "rgb(255, 255, 255)";
const BLACK = "rgb(10, 10, 10)";

// The page colour is on <html> (it paints the canvas); <body> stays transparent so the glass backdrop shows.
const pageBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

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
    await expect(page).toHaveTitle(/CHEF SIS/);
    await expect(page.locator('link[rel="alternate"][hreflang="am"]')).toHaveAttribute("href", /\/am$/);
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
    // The site-wide preview banner was removed at the owner's request (Stage 3.6).
    await expect(page.getByText("Preview: placeholder copy")).toHaveCount(0);
    // The inquiry band and the "to be confirmed" service badge were removed (owner's request).
    await expect(page.getByText("Planning a celebration or event?")).toHaveCount(0);
    await expect(page.getByText("Offering to be confirmed")).toHaveCount(0);
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
    // Headings and body text share one Ethiopic face; the serif display face is gone.
    expect(loadedFamilies.some((family) => family.includes("Noto Sans Ethiopic"))).toBe(true);
    expect(loadedFamilies.some((family) => family.includes("Noto Serif Ethiopic"))).toBe(false);
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

  test("the flag toggle switches language without jumping to the top", async ({ page }) => {
    await page.goto("/en");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(500);

    // The header is sticky, so the toggle is still reachable at the bottom of the page.
    await page.getByRole("group", { name: "Language" }).first().getByRole("link", { name: "አማርኛ" }).click();
    await expect(page).toHaveURL(/\/am$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "am");
    // The Amharic page is a little taller or shorter, so allow some drift, but no jump to the top.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(before / 2);

    // One toggle: on the Amharic page it offers English.
    await expect(
      page.getByRole("group", { name: "ቋንቋ" }).first().getByRole("link", { name: "English" }),
    ).toBeVisible();
  });

  test("the contact page is linked everywhere and holds only the message form", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("contentinfo").getByRole("link", { name: "Contact" }).click();
    await expect(page).toHaveURL(/\/en\/contact$/);
    await expect(page.getByRole("heading", { level: 1, name: "Contact" })).toBeVisible();
    // No contact details are confirmed yet, so none are shown (never invented).
    await expect(page.getByRole("heading", { name: "Direct contact" })).toHaveCount(0);
    // Without a backend the message form stays closed and says so.
    await expect(
      page.getByRole("status").filter({ hasText: "The contact form is not open yet" }),
    ).toBeVisible();
    await expect(page.locator("form input[name=fullName]")).toHaveCount(0);
    // The event inquiry shortcut was removed from this page (owner's request); the inquiry
    // form stays reachable from the homepage call to action, the phone menu and the footer.
    await expect(page.getByRole("main").getByRole("link", { name: "Start your inquiry" })).toHaveCount(0);

    await page.goto("/am/contact");
    await expect(page.getByRole("heading", { level: 1, name: "ያግኙን" })).toBeVisible();
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

test.describe("food videos", () => {
  const reel = (page: Page) => page.getByRole("region", { name: "Short videos of Ethiopian food" });

  test("six silent loops under the hero, with one button to pause and play them", async ({ page }) => {
    await page.goto("/en");
    const videos = reel(page).locator("video");
    await expect(videos).toHaveCount(6);
    for (const video of await videos.all()) {
      expect(await video.evaluate((v: HTMLVideoElement) => v.muted && v.loop && !v.controls)).toBe(true);
    }
    await reel(page).getByRole("button", { name: "Pause the videos" }).click();
    await expect(reel(page).getByRole("button", { name: "Play the videos" })).toBeVisible();
    expect(await videos.evaluateAll((all: HTMLVideoElement[]) => all.every((v) => v.paused))).toBe(true);
  });

  test("a tile opens its clip full screen, with previous, next and minimize", async ({ page }) => {
    await page.goto("/en");
    const tiles = reel(page).getByRole("button", { name: /^Watch full screen: / });
    await expect(tiles).toHaveCount(6);
    // The tiles play light previews; the viewer plays the full-quality file.
    await expect(reel(page).locator("video").first()).toHaveAttribute("src", /^\/videos\/preview\//);

    await tiles.first().click();
    const viewer = page.getByRole("dialog");
    await expect(viewer).toBeVisible();
    await expect(viewer.locator("video")).toHaveAttribute("src", /^\/videos\/[a-z-]+\.mp4$/);
    await expect(viewer.getByText("1 / 6")).toBeVisible();
    // The tiles pause while a clip plays full screen.
    expect(
      await reel(page)
        .locator("video")
        .evaluateAll((all: HTMLVideoElement[]) => all.every((v) => v.paused)),
    ).toBe(true);

    await viewer.getByRole("button", { name: "Next video" }).click();
    await expect(viewer.getByText("2 / 6")).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(viewer.getByText("1 / 6")).toBeVisible();
    await viewer.getByRole("button", { name: "Previous video" }).click();
    await expect(viewer.getByText("6 / 6")).toBeVisible();
    await viewer.getByRole("button", { name: "Pause the video" }).click();
    expect(await viewer.locator("video").evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);

    await viewer.getByRole("button", { name: "Exit full screen" }).click();
    await expect(viewer).toBeHidden();
    await expect(tiles.first()).toBeFocused();
  });

  test("stay paused for visitors who prefer reduced motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/en");
    await expect(reel(page).getByRole("button", { name: "Play the videos" })).toBeVisible();
    expect(
      await reel(page)
        .locator("video")
        .evaluateAll((all: HTMLVideoElement[]) => all.every((v) => v.paused)),
    ).toBe(true);
  });

  test("are credited, with the photos, on the credits page", async ({ page }) => {
    await page.goto("/en/credits");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Photo and video credits");
    await expect(page.getByRole("link", { name: "Original on Pexels" })).toHaveCount(6);
    await expect(page.getByRole("link", { name: "Original on Wikimedia Commons" })).toHaveCount(9);
  });
});

test.describe("theme", () => {
  // The device prefers dark; the site ignores that and opens in light.
  test.use({ colorScheme: "dark" });

  test("opens in light whatever the device prefers", async ({ page }) => {
    await page.goto("/en");
    await expect(page.locator("html")).not.toHaveAttribute("data-theme", /.*/);
    expect(await pageBackground(page)).toBe(WHITE);
  });

  test("one button switches between light and dark and remembers the choice", async ({ page }) => {
    await page.goto("/en");
    const toggle = page.getByRole("button", { name: "Dark theme" });
    // aria-pressed appears once the button is hydrated, so clicks after this count.
    await expect(toggle).toHaveAttribute("aria-pressed", "false");

    await toggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    // A direct switch: no menu of choices opens.
    await expect(page.getByRole("menu")).toHaveCount(0);
    expect(await pageBackground(page)).toBe(BLACK);

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await pageBackground(page)).toBe(BLACK);

    await page.goto("/am");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const amToggle = page.getByRole("button", { name: "ጨለማ ገጽታ" });
    await expect(amToggle).toHaveAttribute("aria-pressed", "true");

    await amToggle.click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect(amToggle).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => localStorage.getItem("chef-harena:theme"))).toBe("light");
    expect(await pageBackground(page)).toBe(WHITE);
  });

  test("applies a stored theme before first paint", async ({ page, request }) => {
    // The theme script is inline in <head>, ahead of any body content.
    const html = await (await request.get("/en")).text();
    expect(html.indexOf("chef-harena:theme")).toBeGreaterThan(-1);
    expect(html.indexOf("chef-harena:theme")).toBeLessThan(html.indexOf("<body"));

    await page.addInitScript(() => {
      localStorage.setItem("chef-harena:theme", "dark");
      document.addEventListener("DOMContentLoaded", () => {
        (window as unknown as { themeAtParse: string | null }).themeAtParse =
          document.documentElement.getAttribute("data-theme");
      });
    });
    await page.goto("/en");
    expect(
      await page.evaluate(() => (window as unknown as { themeAtParse: string | null }).themeAtParse),
    ).toBe("dark");
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
    const contact = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "Contact" });
    await page.goto("/en/contact");
    await expect(contact).toHaveAttribute("aria-current", "page");
    await page.goto("/en/privacy");
    await expect(contact).not.toHaveAttribute("aria-current");
  });

  test("tablets get the menu button; the inline navigation starts at desktop width", async ({ page }) => {
    // With every section published the five inline links would not fit beside the actions.
    for (const width of [768, 1000]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/en");
      await expect(page.getByRole("navigation", { name: "Primary" }), `${width}`).toBeHidden();
      await expect(page.getByRole("button", { name: "Open menu" }), `${width}`).toBeVisible();
      // No "Plan an event" button in the header bar (owner's request).
      await expect(page.getByRole("banner").getByRole("link", { name: "Plan an event" })).toHaveCount(0);
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
