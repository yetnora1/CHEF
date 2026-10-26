import { expect, type Page } from "@playwright/test";

/**
 * Waits until React has hydrated the page. On a cold `next dev` server (the
 * admin project) a click can land before hydration and be lost: the browser
 * logs "Router action dispatched before initialization" and the form simply
 * stays filled in. The theme toggle only gets aria-pressed on the client (its
 * server snapshot is unknown), so that attribute marks a live page; it is on
 * every public and admin page, in both languages.
 */
export async function waitForHydration(page: Page) {
  await expect(page.getByRole("button", { name: /^(Dark theme|ጨለማ ገጽታ)$/ }).first()).toHaveAttribute(
    "aria-pressed",
    /^(true|false)$/,
    { timeout: 30_000 },
  );
}
