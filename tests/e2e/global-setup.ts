import { startFakeSupabase } from "./support/fake-supabase";

export default async function globalSetup() {
  const server = await startFakeSupabase();
  return () => new Promise<void>((resolve) => server.close(() => resolve()));
}
