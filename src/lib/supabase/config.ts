import { z } from "zod";

/**
 * Public Supabase configuration (safe for the browser by design).
 *
 * NEXT_PUBLIC_* values are inlined into client bundles at build time, so this
 * module also refuses to run with a privileged key in a public variable: a
 * misplaced secret would otherwise ship to every visitor.
 */

const publicConfigSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  publishableKey: z.string().trim().min(20),
});

export type SupabasePublicConfig = z.infer<typeof publicConfigSchema>;

export type ConfigProblem = "missing" | "invalid" | "privileged-key-in-public-variable";

export function parseSupabasePublicConfig(env: {
  url: string | undefined;
  publishableKey: string | undefined;
}): { ok: true; config: SupabasePublicConfig } | { ok: false; problem: ConfigProblem } {
  if (!env.url || !env.publishableKey) return { ok: false, problem: "missing" };
  if (isPrivilegedKey(env.publishableKey)) {
    return { ok: false, problem: "privileged-key-in-public-variable" };
  }
  const parsed = publicConfigSchema.safeParse(env);
  return parsed.success ? { ok: true, config: parsed.data } : { ok: false, problem: "invalid" };
}

/** Detects Supabase secret keys and legacy service_role JWTs. */
export function isPrivilegedKey(key: string): boolean {
  const trimmed = key.trim();
  if (trimmed.startsWith("sb_secret_")) return true;

  const parts = trimmed.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as {
      role?: unknown;
    };
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

/**
 * Auth cookie attributes shared by the browser, server and proxy clients.
 * The session cookie holds access and refresh tokens, so in production it is
 * never sent over plain HTTP. (@supabase/ssr defaults omit `secure`.)
 */
export const AUTH_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
} as const;

let warned = false;

export function getSupabasePublicConfig(): SupabasePublicConfig | null {
  // Literal property access so Next.js can inline these into client bundles.
  const result = parseSupabasePublicConfig({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (result.ok) return result.config;

  if (result.problem !== "missing" && !warned) {
    warned = true;
    console.error(
      result.problem === "privileged-key-in-public-variable"
        ? "[supabase] NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY contains a secret/service-role key. " +
            "It has been ignored. Use the publishable key and rotate the exposed secret."
        : "[supabase] NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is invalid.",
    );
  }
  return null;
}
