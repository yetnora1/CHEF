import { defineConfig, devices } from "@playwright/test";
import { FAKE_PUBLISHABLE_KEY, FAKE_SECRET_KEY, FAKE_SUPABASE_URL } from "./tests/e2e/support/fake-supabase";
import { E2E_CLIENT_IP_HEADER } from "./tests/e2e/support/constants";

const PUBLIC_PORT = 3100;
const ADMIN_PORT = 3101;

/*
 * Two servers:
 *  - "public": the production build with Supabase deliberately UNCONFIGURED,
 *    proving the site works without a backend and the admin and inquiry form
 *    fail closed.
 *  - "admin": a dev server pointed at the fake Supabase test double
 *    (tests/e2e/support/fake-supabase.ts: fake Auth, real SQL on PGlite). It
 *    runs with the explicit local CAPTCHA bypass, which the app ignores in
 *    production builds. Next.js 16 keeps dev output in .next/dev, so it runs
 *    alongside the production build.
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "public",
      testMatch: /public\.spec\.ts|admin-unconfigured\.spec\.ts|booking-unconfigured\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${PUBLIC_PORT}` },
    },
    {
      name: "admin",
      testMatch: /admin-auth\.spec\.ts|inquiries\.spec\.ts|contact\.spec\.ts|cms\.spec\.ts/,
      timeout: 90_000,
      use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${ADMIN_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npm run build && npm run start -- --port ${PUBLIC_PORT}`,
      url: `http://localhost:${PUBLIC_PORT}/en`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
        SUPABASE_SECRET_KEY: "",
      },
    },
    {
      command: `npx next dev --port ${ADMIN_PORT}`,
      url: `http://localhost:${ADMIN_PORT}/admin/login`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: FAKE_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: FAKE_PUBLISHABLE_KEY,
        SUPABASE_SECRET_KEY: FAKE_SECRET_KEY,
        // No Turnstile keys: the inquiry form runs without a CAPTCHA, as in production.
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
        TURNSTILE_SECRET_KEY: "",
        CLIENT_IP_HEADER: E2E_CLIENT_IP_HEADER,
      },
    },
  ],
});
