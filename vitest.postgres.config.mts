import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const local = (file: string) => fileURLToPath(new URL(file, import.meta.url));

/*
 * `npm run test:db:pg`: the database suites on a real PostgreSQL server
 * (TEST_POSTGRES_URL, see tests/support/pglite-on-postgres.ts), plus the
 * multi-connection suites that PGlite (one connection) cannot run.
 * Same aliases as vitest.config.mts, with PGlite swapped for the adapter.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@electric-sql/pglite": local("./tests/support/pglite-on-postgres.ts"),
      "@": local("./src"),
      "server-only": local("./tests/support/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts", "tests/postgres/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
