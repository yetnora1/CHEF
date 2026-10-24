import { startFakeSupabase } from "./support/fake-supabase";

const ADMIN_ORIGIN = "http://localhost:3101";

export default async function globalSetup() {
  const server = await startFakeSupabase();

  // Compile the dev server's routes once, sequentially, before parallel tests
  // request them (concurrent first compiles of one route can race in dev).
  for (const path of ["/en/book", "/am/book", "/admin/login", "/en"]) {
    await fetch(`${ADMIN_ORIGIN}${path}`).catch(() => undefined);
  }

  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}
