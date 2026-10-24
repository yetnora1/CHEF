import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

export function migrationFiles(): string[] {
  return readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

/**
 * A fresh in-process Postgres with the Supabase shim, every migration in
 * order, and (optionally) the development seed applied.
 */
export async function createTestDatabase({ seed = true } = {}): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(readFileSync(path.join(import.meta.dirname, "supabase-shim.sql"), "utf8"));
  for (const file of migrationFiles()) {
    await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
  }
  if (seed) {
    await db.exec(readFileSync(path.join(repoRoot, "supabase", "seed.sql"), "utf8"));
  }
  return db;
}

export type Actor = { kind: "anon" } | { kind: "user"; id: string } | { kind: "service" };

export const anon: Actor = { kind: "anon" };
export const user = (id: string): Actor => ({ kind: "user", id });
/** The server-side secret key (service_role): bypasses RLS, but not privileges. */
export const service: Actor = { kind: "service" };

export type ActorResult<T> =
  { ok: true; rows: T[]; affectedRows: number } | { ok: false; code: string | undefined; message: string };

/**
 * Runs one statement exactly as PostgREST would for the given actor: inside a
 * transaction, as the `anon`, `authenticated` or `service_role` role, with JWT
 * claims set. The transaction is rolled back unless `persist` is true.
 */
export async function asActor<T = Record<string, unknown>>(
  db: PGlite,
  actor: Actor,
  sql: string,
  params: unknown[] = [],
  { persist = false } = {},
): Promise<ActorResult<T>> {
  const role = actor.kind === "anon" ? "anon" : actor.kind === "service" ? "service_role" : "authenticated";
  const claims = actor.kind === "user" ? { role, sub: actor.id, aud: "authenticated" } : { role };

  return db.transaction(async (tx) => {
    // `role` is one of three literals above, never caller input.
    await tx.exec(`set local role ${role}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    try {
      const result = await tx.query<T>(sql, params);
      if (!persist) await tx.rollback();
      return { ok: true, rows: result.rows, affectedRows: result.affectedRows ?? 0 };
    } catch (error) {
      await tx.rollback();
      const pgError = error as { code?: string; message?: string };
      return { ok: false, code: pgError.code, message: pgError.message ?? String(error) };
    }
  });
}

/** Creates an auth user (as the database owner) and returns its id. */
export async function createAuthUser(
  db: PGlite,
  email: string,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const result = await db.query<{ id: string }>(
    "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
    [email, JSON.stringify(metadata)],
  );
  return result.rows[0]!.id;
}

/** Test fixture only: grants a role directly, bypassing the API path. */
export async function grantRoleAsOwner(db: PGlite, userId: string, role: string): Promise<void> {
  await db.query("insert into public.user_roles (user_id, role) values ($1, $2)", [userId, role]);
}
