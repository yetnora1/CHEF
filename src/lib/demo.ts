/**
 * Demo mode (`npm run dev:demo`): the app runs against the in-memory Supabase
 * test double with sample content. Set only by scripts/dev-demo.mjs; inlined at
 * build time like every NEXT_PUBLIC_ value. The flag only adds a visible
 * notice; it never changes what the app may do.
 */
export function isDemoMode(): boolean {
  return process.env.NEXT_PUBLIC_DEMO_MODE === "true";
}
