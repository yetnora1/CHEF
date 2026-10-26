#!/usr/bin/env node
/**
 * Local demo mode: the app on the Next.js dev server, backed by the in-memory
 * Supabase test double (tests/e2e/support/fake-supabase.ts) with sample
 * content and inquiries (scripts/demo/demo-content.ts).
 *
 *   npm run dev:demo                 # http://localhost:3000
 *   npm run dev:demo -- --port 3200
 *
 * Nothing persists and nothing leaves this computer: data lives in memory and
 * resets when this process stops; email and CAPTCHA are switched off; no real
 * Supabase project, key or account is used. Every page shows a "Demo mode"
 * banner (NEXT_PUBLIC_DEMO_MODE). Stop any other `next dev` for this project
 * first, and the e2e suite (it uses the same test-double port).
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

if (!process.features?.typescript) {
  console.error("npm run dev:demo needs Node.js 22.18+ or 24 (built-in TypeScript support).");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root); // the test double reads the migrations relative to the project root
const portIndex = process.argv.indexOf("--port");
const port = portIndex > -1 ? process.argv[portIndex + 1] : (process.env.PORT ?? "3000");

const fake = await import(pathToFileURL(path.join(root, "tests/e2e/support/fake-supabase.ts")).href);
const { seedDemoContent } = await import(pathToFileURL(path.join(root, "scripts/demo/demo-content.ts")).href);

console.log("Demo mode: starting the in-memory Supabase test double with sample content…");
const server = await fake.startFakeSupabase({ seed: seedDemoContent });

const accounts = Object.entries(fake.TEST_USERS)
  .map(
    ([key, user]) =>
      `  ${user.email.padEnd(24)} ${user.role ?? "(no staff role)"}${key === "owner" ? "  ← sees everything" : ""}`,
  )
  .join("\n");
console.log(`
Demo mode is ready. Data is held in memory and resets when you stop this command.

  Website  http://localhost:${port}/en   (Amharic: /am)
  Admin    http://localhost:${port}/admin

Demo accounts (test-only, password for all: ${fake.TEST_PASSWORD}):
${accounts}
`);

const require = createRequire(import.meta.url);
// Loopback only: the test accounts and their published password must not be reachable from the network.
const nextArgs = ["dev", "--port", port, "--hostname", "127.0.0.1"];
const next = spawn(process.execPath, [require.resolve("next/dist/bin/next"), ...nextArgs], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_DEMO_MODE: "true",
    NEXT_PUBLIC_SUPABASE_URL: fake.FAKE_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fake.FAKE_PUBLISHABLE_KEY,
    SUPABASE_SECRET_KEY: fake.FAKE_SECRET_KEY,
    // Inquiries are stored in memory without a CAPTCHA, and no email is sent,
    // even if .env.local holds real keys (process values take precedence).
    INQUIRY_LOCAL_CAPTCHA_BYPASS: "true",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    TURNSTILE_SECRET_KEY: "",
    RESEND_API_KEY: "",
    INQUIRY_EMAIL_FROM: "",
    INQUIRY_NOTIFY_TO: "",
    CRON_SECRET: "",
  },
});

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  if (next.exitCode === null) next.kill("SIGTERM");
  server.close(() => process.exit(code));
}
process.on("SIGINT", () => stop(0));
process.on("SIGTERM", () => stop(0));
next.on("exit", (code) => stop(code ?? 0));
