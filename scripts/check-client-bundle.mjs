#!/usr/bin/env node
/**
 * Verifies that server-only secrets never reach browser-delivered output.
 *
 * 1. Builds the app with canary values: public keys (expected in client JS)
 *    and every server-only secret the app reads (must appear nowhere the
 *    browser can fetch). The canaries form a complete configuration, so the
 *    inquiry form and its server code paths are built as in production.
 * 2. Scans .next/static plus prerendered HTML/RSC payloads.
 * 3. Fails if the secret canary or any real-looking secret key is found, or if
 *    the public canary is missing (which would mean the scan itself is broken).
 * 4. Deletes the canary build so it can never be started by accident.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const distDir = path.join(root, ".next");

const CANARY = {
  url: "https://canary-bundle-check.supabase.co",
  publishable: "sb_publishable_CANARYpublic0bundle0check",
  turnstileSiteKey: "0x4CANARYpublicTurnstileSiteKey",
};

const SECRETS = {
  SUPABASE_SECRET_KEY: "sb_secret_CANARYserverOnly0mustNotLeak",
  TURNSTILE_SECRET_KEY: "0x4CANARYturnstileSecret0mustNotLeak",
  RESEND_API_KEY: "re_CANARYresendKey0mustNotLeak",
  CRON_SECRET: "CANARYcronSecret0mustNotLeak0000000000000",
};

console.log("› Building with canary environment values…");
// A fixed command string (no interpolated arguments); a shell is needed for npx on Windows.
const build = spawnSync("npx next build", {
  cwd: root,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: CANARY.url,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: CANARY.publishable,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: CANARY.turnstileSiteKey,
    INQUIRY_EMAIL_FROM: "Canary <canary@example.test>",
    INQUIRY_NOTIFY_TO: "canary@example.test",
    NEXT_PUBLIC_SITE_URL: "https://canary-bundle-check.example",
    CLIENT_IP_HEADER: "cf-connecting-ip",
    ...SECRETS,
  },
});
if (build.status !== 0) {
  console.error("✗ Build failed");
  process.exit(build.status ?? 1);
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

// Everything under static/ is served to browsers; prerendered pages and RSC
// payloads under server/app are sent verbatim as responses.
const browserFiles = [
  ...walk(path.join(distDir, "static")),
  ...[...walk(path.join(distDir, "server", "app"))].filter((f) => /\.(html|rsc|body|meta)$/.test(f)),
];

let foundPublic = false;
const leaks = [];
const secretPattern = /sb_secret_[A-Za-z0-9]{8,}|"role"\s*:\s*"service_role"/;

for (const file of browserFiles) {
  const text = readFileSync(file, "utf8");
  if (text.includes(CANARY.publishable)) foundPublic = true;
  const leaked = Object.entries(SECRETS)
    .filter(([, value]) => text.includes(value))
    .map(([name]) => name);
  if (secretPattern.test(text)) leaked.push("secret-key pattern");
  if (leaked.length) leaks.push(`${path.relative(root, file)} (${leaked.join(", ")})`);
}

rmSync(distDir, { recursive: true, force: true });
console.log("› Removed the canary build (.next). Run `npm run build` before `npm start`.");

console.log(`› Scanned ${browserFiles.length} browser-delivered files.`);
if (!foundPublic) {
  console.error(
    "✗ Public canary not found: the scan is not seeing client bundles, so this check proves nothing.",
  );
  process.exit(1);
}
if (leaks.length > 0) {
  console.error("✗ Server-only secret material found in browser-delivered files:");
  for (const file of leaks) console.error(`  - ${file}`);
  process.exit(1);
}
console.log(`✓ None of ${Object.keys(SECRETS).join(", ")} in client output (public key correctly present).`);
