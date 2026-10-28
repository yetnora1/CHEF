import { expect, test, type Locator, type Page } from "@playwright/test";
import sharp from "sharp";
import { TEST_PASSWORD, TEST_USERS } from "./support/fake-supabase";
import { waitForHydration } from "./support/hydration";

/*
 * Content management end to end: the dev server against the fake Supabase
 * test double (tests/e2e/support/fake-supabase.ts), so every write goes
 * through the real grants, RLS policies and triggers (on PGlite), and Storage
 * through the real storage.objects policies. Each test creates its own
 * uniquely named content, so tests do not depend on each other or on the
 * inquiry specs sharing the database. Tests in this file run in order, in one
 * worker: they share slow first compiles of the same dev-server routes.
 */

test.describe.configure({ mode: "default" });

const ADMIN_ORIGIN = "http://localhost:3101";
const unique = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function signIn(page: Page, email: string) {
  await page.goto("/admin/login");
  await waitForHydration(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible({ timeout: 30_000 });
  await waitForHydration(page);
}

const png = (width = 640, height = 480) =>
  sharp({ create: { width, height, channels: 3, background: { r: 196, g: 120, b: 64 } } })
    .png()
    .toBuffer();

const publicationCard = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: "Publication" }) });

const detailsCard = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: "Details" }) });

const languagePanel = (page: Page, language: "English" | "Amharic") =>
  page.getByRole("tabpanel", { name: new RegExp(`^${language}`) });

/** Clicks a workflow button in `scope`, confirms the dialog and waits for the server. */
async function changeStatus(page: Page, scope: Locator, action: string) {
  await scope.getByRole("button", { name: action, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: action, exact: true }).click();
  await expect(scope.getByText("Status changed.")).toBeVisible();
}

/**
 * Not published: the not-found page, never indexable, without the entry's text. The status is
 * 404, except that a production server may answer a slug's first request with a streamed 200
 * ("soft 404", docs/CMS.md#caching).
 */
async function expectNotPublic(page: Page, path: string, text: string) {
  const response = await page.request.get(path);
  expect([200, 404], path).toContain(response.status());
  const html = await response.text();
  expect(html, path).toMatch(/<meta name="robots" content="noindex"/);
  expect(html, path).not.toContain(text);
}

/** Creates a draft service (English title and slug) and returns its edit URL. */
async function createService(page: Page, slug: string, title: string): Promise<string> {
  await page.goto("/admin/services/new");
  await page.getByLabel("Title (English)").fill(title);
  await page.getByLabel("Web address").fill(slug);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/admin\/services\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return new URL(page.url()).pathname;
}

async function saveEnglish(page: Page, fields: { summary?: string; body?: string }) {
  const english = languagePanel(page, "English");
  if (fields.summary !== undefined) await english.getByLabel(/^Summary/).fill(fields.summary);
  if (fields.body !== undefined) await english.getByLabel(/^Text/).fill(fields.body);
  await english.getByRole("button", { name: "Save", exact: true }).click();
  await expect(english.getByRole("status")).toHaveText("Saved.");
}

/** Publishes the English version, then the entry itself. */
async function publishEnglishAndEntry(page: Page) {
  await changeStatus(page, languagePanel(page, "English"), "Publish");
  await changeStatus(page, publicationCard(page), "Publish");
}

test.beforeAll(async ({ browser }) => {
  // Compile the CMS routes once before the tests time them.
  test.setTimeout(300_000);
  const page = await browser.newPage({ baseURL: ADMIN_ORIGIN });
  await signIn(page, TEST_USERS.editor.email);
  for (const path of [
    "/admin/services",
    "/admin/services/new",
    "/admin/pages",
    "/admin/media",
    "/admin/translations",
    "/admin/menu",
    "/en/services",
    "/en/services/__none__",
    "/en/about",
    "/en/menu",
  ]) {
    await page.goto(path).catch(() => undefined);
  }
  await page.close();
});

test.describe("editorial workflow", () => {
  test("an editor drafts, previews and publishes a service; visitors see it only once published", async ({
    page,
  }) => {
    await signIn(page, TEST_USERS.editor.email);
    const slug = unique("wedding-feasts");
    const title = `Wedding feasts ${slug.slice(-6)}`;
    const editUrl = await createService(page, slug, title);

    await saveEnglish(page, {
      summary: "Celebration menus for every guest.",
      body: "## What we cook\n\n- Injera\n- **Doro wat**\n\nWrite to us [here](/en/book).",
    });

    // A draft is not public.
    await expectNotPublic(page, `/en/services/${slug}`, title);

    // Staff preview it, privately.
    await page.getByRole("link", { name: "Preview (English)" }).click();
    await expect(page.getByText("Preview in English")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "What we cook" })).toBeVisible();
    await page.getByRole("link", { name: "Back to editing" }).click();
    await expect(page).toHaveURL(new RegExp(`${editUrl}$`));

    // The English version alone is not enough: the entry is still a draft.
    await changeStatus(page, languagePanel(page, "English"), "Publish");
    await expectNotPublic(page, `/en/services/${slug}`, title);
    await changeStatus(page, publicationCard(page), "Publish");

    await page.goto(`/en/services/${slug}`);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByText("Celebration menus for every guest.")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "What we cook" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Doro wat" }).locator("strong")).toHaveText(
      "Doro wat",
    );
    await expect(page.getByRole("link", { name: "here" })).toHaveAttribute("href", "/en/book");

    // The Amharic site shows the English text, marked as English.
    await page.goto(`/am/services/${slug}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "am");
    await expect(page.getByRole("heading", { level: 1, name: title })).toHaveAttribute("lang", "en");
    await expect(page.getByText("በእንግሊዝኛ ብቻ ይገኛል")).toBeVisible();

    await page.goto("/en/services");
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();

    // Unpublishing takes it off the website again.
    await page.goto(editUrl);
    await changeStatus(page, publicationCard(page), "Unpublish");
    await expectNotPublic(page, `/en/services/${slug}`, title);
  });

  test("Amharic is published only after a fluent speaker's review is confirmed", async ({ page }) => {
    await signIn(page, TEST_USERS.editor.email);
    const slug = unique("summit-catering");
    await createService(page, slug, `Summit catering ${slug.slice(-6)}`);

    await page.getByRole("tab", { name: "Amharic (Missing)" }).click();
    const amharic = languagePanel(page, "Amharic");
    await amharic.getByRole("textbox", { name: "Title", exact: true }).fill("የጉባኤ ምግብ ዝግጅት");
    await amharic.getByRole("button", { name: "Create this language version" }).click();
    await expect(amharic.getByRole("status")).toHaveText("Saved.");
    await expect(amharic.getByText("Not reviewed")).toBeVisible();

    // Refused without the review confirmation (the database enforces it).
    await amharic.getByRole("button", { name: "Publish", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Publish", exact: true }).click();
    await expect(amharic.getByRole("alert")).toHaveText(
      "Amharic text can only be published after you confirm that a fluent speaker reviewed it.",
    );

    const review = amharic.getByRole("checkbox", { name: /Reviewed by a fluent Amharic speaker/ });
    await review.check();
    await amharic.getByRole("button", { name: "Save", exact: true }).click();
    await expect(amharic.getByText("Saved.")).toBeVisible();
    await expect(amharic.getByText("Reviewed", { exact: true })).toBeVisible();
    await changeStatus(page, amharic, "Publish");

    // Changing the live text withdraws the confirmation, so the save is refused.
    await amharic.getByRole("textbox", { name: "Title", exact: true }).fill("የጉባኤ ምግብ አገልግሎት");
    await expect(review).not.toBeChecked();
    await expect(
      amharic.getByText("The text changed, so the review confirmation will be cleared when you save."),
    ).toBeVisible();
    await amharic.getByRole("button", { name: "Save", exact: true }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Save and update the website" }).click();
    await expect(amharic.getByRole("alert").last()).toHaveText(
      "Amharic text can only be published after you confirm that a fluent speaker reviewed it.",
    );
  });

  test("a second editor's stale save is refused with a conflict instead of overwriting", async ({
    browser,
  }) => {
    const first = await browser.newPage({ baseURL: ADMIN_ORIGIN });
    const second = await browser.newPage({ baseURL: ADMIN_ORIGIN });
    await signIn(first, TEST_USERS.editor.email);
    const slug = unique("private-dinners");
    const editUrl = await createService(first, slug, `Private dinners ${slug.slice(-6)}`);

    await signIn(second, TEST_USERS.admin.email);
    await second.goto(editUrl);

    await saveEnglish(first, { summary: "First editor's summary." });

    const english = languagePanel(second, "English");
    await english.getByLabel(/^Summary/).fill("Second editor's summary.");
    await english.getByRole("button", { name: "Save", exact: true }).click();
    await expect(english.getByRole("alert")).toHaveText(
      "Someone else changed this since you opened it. Copy your text, reload the page and apply your changes again.",
    );

    await second.reload();
    await waitForHydration(second);
    await expect(languagePanel(second, "English").getByLabel(/^Summary/)).toHaveValue(
      "First editor's summary.",
    );
    await first.close();
    await second.close();
  });

  test("the About page is edited in sections and replaces the homepage link once published", async ({
    page,
  }) => {
    await signIn(page, TEST_USERS.editor.email);
    await page.goto("/admin/pages");
    // Seeded without text: the list names the page until it has a title.
    await page.getByRole("link", { name: /^About/ }).click();
    await expect(page).toHaveURL(/\/admin\/pages\/about$/);

    // Pages start without text; on a retry the first attempt may have published it.
    const english = languagePanel(page, "English");
    const exists = (await english.getByRole("button", { name: "Save", exact: true }).count()) > 0;
    const live = exists && (await english.getByText("Published", { exact: true }).isVisible());

    const heading = `Cooking for Ethiopia's celebrations ${unique("x").slice(-6)}`;
    await english.getByRole("textbox", { name: "Title", exact: true }).fill("About CHEF SIS");
    const intro = english.getByRole("group", { name: "Introduction" });
    await intro.getByLabel("Heading").fill(heading);
    await intro.getByLabel(/^Text/).fill("Recipes learned at home.");
    await english
      .getByRole("button", { name: exists ? "Save" : "Create this language version", exact: true })
      .click();
    if (live)
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: "Save and update the website" })
        .click();
    await expect(english.getByText("Saved.")).toBeVisible();

    if (!live) await changeStatus(page, english, "Publish");
    if (!(await publicationCard(page).getByText("Published", { exact: true }).isVisible())) {
      await changeStatus(page, publicationCard(page), "Publish");
    }

    await page.goto("/en/about");
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
    await expect(page.getByText("Recipes learned at home.")).toBeVisible();
    await page.goto("/en");
    await expect(
      page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "The chef" }),
    ).toHaveAttribute("href", "/en/about");
  });
});

test.describe("safe rendering", () => {
  test("markup and HTML in stored content stay inert text, in the admin and on the website", async ({
    page,
  }) => {
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await signIn(page, TEST_USERS.editor.email);
    const slug = unique("xss-check");
    const title = `<img src=x onerror="window.__xss=1"> ${slug.slice(-6)}`;
    await createService(page, slug, title);
    await saveEnglish(page, {
      summary: "<script>window.__xss=2</script>",
      body: '<iframe src="javascript:window.__xss=3"></iframe>\n\n[click me](javascript:window.__xss=4)\n\n[safe](https://example.com/menu)',
    });
    await publishEnglishAndEntry(page);

    await page.goto(`/admin/services?q=${encodeURIComponent(slug)}`);
    await expect(page.getByRole("link", { name: title })).toBeVisible();

    await page.goto(`/en/services/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    await expect(page.getByText("<script>window.__xss=2</script>")).toBeVisible();
    await expect(page.getByText("[click me](javascript:window.__xss=4)")).toBeVisible();
    await expect(page.getByRole("link", { name: "safe" })).toHaveAttribute(
      "href",
      "https://example.com/menu",
    );
    const article = page.locator("article");
    await expect(article.locator("script, iframe, img[src='x']")).toHaveCount(0);
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
  });
});

test.describe("media", () => {
  test("only real images are accepted, and the server says why", async ({ page }) => {
    await signIn(page, TEST_USERS.editor.email);
    await page.goto("/admin/media");
    const file = page.getByLabel("Image file");
    const upload = page.getByRole("button", { name: "Upload" });
    const error = page.locator("#upload-file-error");

    await file.setInputFiles({
      name: "menu.png",
      mimeType: "image/png",
      buffer: Buffer.from("<html><script>1</script>"),
    });
    await upload.click();
    await expect(error).toHaveText("Use a JPEG, PNG or WebP image.");

    const jpeg = await sharp({ create: { width: 32, height: 32, channels: 3, background: "#884422" } })
      .jpeg()
      .toBuffer();
    await file.setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: jpeg });
    await upload.click();
    await expect(error).toHaveText("The file's content does not match its name or type.");

    await file.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await upload.click();
    await expect(error).toHaveText("Use a JPEG, PNG or WebP image.");
  });

  test("an image is public only while published content uses it, and cannot be deleted while used", async ({
    page,
  }) => {
    await signIn(page, TEST_USERS.editor.email);
    const imageTitle = `Injera platter ${unique("img").slice(-8)}`;
    await page.goto("/admin/media");
    await page
      .getByLabel("Image file")
      .setInputFiles({ name: "platter.png", mimeType: "image/png", buffer: await png() });
    await page.getByLabel(/^Title/).fill(imageTitle);
    await page.getByLabel(/^English description/).fill("A platter of injera with stews");
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByRole("heading", { level: 1, name: imageTitle })).toBeVisible({ timeout: 30_000 });
    const mediaUrl = new URL(page.url()).pathname;
    await expect(
      page.getByText("Private: only staff can see this image until published content uses it."),
    ).toBeVisible();

    // Staff read the file through the authenticated, uncached admin route.
    const adminFile = await page.request.get(`${mediaUrl}/file`);
    expect(adminFile.status()).toBe(200);
    expect(adminFile.headers()["content-type"]).toBe("image/png");
    expect(adminFile.headers()["cache-control"]).toContain("no-store");

    const slug = unique("tasting-menu");
    const editUrl = await createService(page, slug, `Tasting menu ${slug.slice(-6)}`);
    const details = detailsCard(page);
    await details.getByRole("button", { name: /^Choose image/ }).click();
    const picker = page.getByRole("dialog", { name: "Choose an image" });
    await picker.getByRole("searchbox").fill(imageTitle);
    await picker.getByRole("button", { name: "Search" }).click();
    await picker.getByRole("button", { name: new RegExp(imageTitle) }).click();
    await details.getByRole("button", { name: "Save", exact: true }).click();
    await expect(details.getByRole("status")).toHaveText("Saved.");
    await publishEnglishAndEntry(page);

    await page.goto(`/en/services/${slug}`);
    const image = page.getByRole("img", { name: "A platter of injera with stews" });
    await expect(image).toBeVisible();
    const src = new URL((await image.getAttribute("src"))!, ADMIN_ORIGIN);
    const publicPath = src.pathname === "/_next/image" ? src.searchParams.get("url")! : src.pathname;
    expect(publicPath).toMatch(/^\/media\/assets\/[0-9a-f-]{36}\/[0-9a-f]{32}\.png$/);

    const visible = await page.request.get(publicPath);
    expect(visible.status()).toBe(200);
    expect(visible.headers()["content-type"]).toBe("image/png");
    expect(visible.headers()["cache-control"]).toBe("public, max-age=300, s-maxage=300");

    await page.goto(mediaUrl);
    await expect(page.getByText("Visible to visitors: published content uses this image.")).toBeVisible();
    await expect(
      page.getByText(
        "This image is in use and cannot be deleted. Choose another image where it is used first.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete image" })).toHaveCount(0);

    // Unpublished content no longer exposes the image.
    await page.goto(editUrl);
    await changeStatus(page, publicationCard(page), "Unpublish");
    const hidden = await page.request.get(publicPath);
    expect(hidden.status()).toBe(404);
    expect(hidden.headers()["cache-control"]).toBe("no-store");
    await page.goto(mediaUrl);
    await expect(
      page.getByText("Private: only staff can see this image until published content uses it."),
    ).toBeVisible();
  });
});

test.describe("access control", () => {
  for (const role of ["manager", "analyst"] as const) {
    test(`the ${role} role cannot open the CMS or upload`, async ({ page }) => {
      await signIn(page, TEST_USERS[role].email);
      for (const path of ["/admin/services", "/admin/pages/home", "/admin/media", "/admin/translations"]) {
        await page.goto(path);
        await expect(
          page.getByRole("heading", { name: "You don't have access to this area" }),
          path,
        ).toBeVisible();
      }
      const response = await page.request.post("/api/admin/media", {
        headers: { origin: ADMIN_ORIGIN },
        multipart: { file: { name: "a.png", mimeType: "image/png", buffer: await png(8, 8) } },
      });
      expect(response.status()).toBe(403);
      expect(await response.json()).toEqual({ ok: false, error: "forbidden" });
    });
  }

  test("uploads are refused without a session or from another site", async ({ page, request }) => {
    const multipart = { file: { name: "a.png", mimeType: "image/png", buffer: await png(8, 8) } };
    const anonymous = await request.post("/api/admin/media", {
      headers: { origin: ADMIN_ORIGIN },
      multipart,
    });
    expect(anonymous.status()).toBe(401);

    await signIn(page, TEST_USERS.editor.email);
    const crossSite = await page.request.post("/api/admin/media", {
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
      multipart,
    });
    expect(crossSite.status()).toBe(403);
    const noOrigin = await page.request.post("/api/admin/media", { multipart });
    expect(noOrigin.status()).toBe(403);
  });

  test("previews need a staff session and are never cached or indexed", async ({ page, request }) => {
    const path = "/admin/preview/service/00000000-0000-4000-8000-000000000000?locale=en";
    const anonymous = await request.get(path, { maxRedirects: 0 });
    expect(anonymous.status()).toBe(307);
    expect(anonymous.headers()["location"]).toContain("/admin/login?next=");
    expect(anonymous.headers()["cache-control"]).toContain("no-store");

    await signIn(page, TEST_USERS.editor.email);
    const slug = unique("preview-check");
    const editUrl = await createService(page, slug, `Preview check ${slug.slice(-6)}`);
    const id = editUrl.split("/").at(-1)!;
    const preview = await page.request.get(`/admin/preview/service/${id}?locale=am`);
    expect(preview.status()).toBe(200);
    expect(preview.headers()["cache-control"]).toContain("no-store");
    expect(preview.headers()["x-robots-tag"]).toContain("noindex");
  });
});

test.describe("editor ergonomics", () => {
  test("unsaved changes are guarded before leaving the page", async ({ page }) => {
    await signIn(page, TEST_USERS.editor.email);
    const slug = unique("guarded");
    const editUrl = await createService(page, slug, `Guarded ${slug.slice(-6)}`);
    await languagePanel(page, "English")
      .getByLabel(/^Summary/)
      .fill("Not saved yet");
    await expect(languagePanel(page, "English").getByText("Unsaved changes")).toBeVisible();

    const messages: string[] = [];
    page.once("dialog", (dialog) => {
      messages.push(dialog.message());
      void dialog.dismiss();
    });
    await page.getByRole("link", { name: "Services", exact: true }).first().click();
    await expect.poll(() => messages).toEqual(["You have unsaved changes. Leave this page and lose them?"]);
    await expect(page).toHaveURL(new RegExp(`${editUrl}$`));
    await expect(languagePanel(page, "English").getByLabel(/^Summary/)).toHaveValue("Not saved yet");
  });

  test("language tabs work with the keyboard and the editor fits a phone screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, TEST_USERS.editor.email);
    const slug = unique("mobile");
    await createService(page, slug, `Mobile ${slug.slice(-6)}`);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const englishTab = page.getByRole("tab", { name: "English" });
    await englishTab.focus();
    await page.keyboard.press("ArrowRight");
    const amharicTab = page.getByRole("tab", { name: "Amharic (Missing)" });
    await expect(amharicTab).toBeFocused();
    await expect(amharicTab).toHaveAttribute("aria-selected", "true");
    await expect(languagePanel(page, "Amharic")).toBeVisible();
    await expect(languagePanel(page, "English")).toBeHidden();
    await page.keyboard.press("Home");
    await expect(englishTab).toBeFocused();
  });
});
