/*
 * Runs the database suites on a real PostgreSQL server instead of PGlite
 * (`npm run test:db:pg`, see vitest.postgres.config.mts): this module replaces
 * "@electric-sql/pglite" and implements the part of its API the suites use.
 *
 * TEST_POSTGRES_URL must be a superuser connection to a DISPOSABLE local
 * server (PostgreSQL 15+, ideally 17 like Supabase). Each PGlite.create() makes
 * a fresh database, and close() drops it. As on hosted Supabase, migrations run
 * as a non-superuser role that owns the database (`chef_test_owner`, entered
 * with SET ROLE), so they cannot rely on superuser rights.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";

const OWNER = "chef_test_owner";

// Same JavaScript types PGlite returns: int8 as number, date as UTC midnight.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => new Date(`${value}T00:00:00.000Z`));

export function serverUrl(): URL {
  const raw = process.env.TEST_POSTGRES_URL;
  if (!raw)
    throw new Error("Set TEST_POSTGRES_URL to a superuser URL of a disposable local PostgreSQL server");
  const url = new URL(raw);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (!local && process.env.TEST_POSTGRES_ALLOW_REMOTE !== "true") {
    throw new Error(
      "TEST_POSTGRES_URL is not a local server; set TEST_POSTGRES_ALLOW_REMOTE=true if it is disposable",
    );
  }
  return url;
}

const urlFor = (database: string) => {
  const url = serverUrl();
  url.pathname = `/${database}`;
  return url.toString();
};

async function withAdmin<T>(fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: serverUrl().toString() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

let bootstrapped: Promise<void> | undefined;

/** Cluster-wide roles, created once (Supabase's API roles and a postgres-like owner). */
function bootstrap(): Promise<void> {
  bootstrapped ??= withAdmin(async (admin) => {
    const { rows } = await admin.query<{ version: number }>(
      "select current_setting('server_version_num')::int as version",
    );
    if (rows[0]!.version < 150000) throw new Error("PostgreSQL 15 or newer is required");
    // Test workers bootstrap in parallel; serialise on an advisory lock.
    await admin.query("select pg_advisory_lock(hashtext('chef_test_bootstrap'))");
    try {
      for (const statement of [
        "create role anon nologin noinherit",
        "create role authenticated nologin noinherit",
        "create role service_role nologin noinherit bypassrls",
        `create role ${OWNER} nologin createdb createrole bypassrls`,
      ]) {
        await admin.query(statement).catch((error: { code?: string }) => {
          if (error.code !== "42710") throw error; // duplicate_object: already there
        });
      }
      await admin.query(`grant anon, authenticated, service_role to ${OWNER}`);
    } finally {
      await admin.query("select pg_advisory_unlock(hashtext('chef_test_bootstrap'))");
    }
  });
  return bootstrapped;
}

type Result<T> = { rows: T[]; fields: pg.FieldDef[]; affectedRows: number };

const toResult = <T>(r: pg.QueryResult): Result<T> => ({
  rows: r.rows as T[],
  fields: r.fields ?? [],
  affectedRows: r.command === "SELECT" ? 0 : (r.rowCount ?? 0),
});

/** A new connection to the same test database, acting as the database owner. */
export async function connectAsOwner(db: { name: string }): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: urlFor(db.name) });
  await client.connect();
  await client.query(`set role ${OWNER}`);
  return client;
}

export class PGlite {
  private constructor(
    private readonly client: pg.Client,
    readonly name: string,
  ) {}

  static async create(): Promise<PGlite> {
    await bootstrap();
    const name = `chef_test_${randomBytes(6).toString("hex")}`;
    await withAdmin((admin) => admin.query(`create database ${name} owner ${OWNER}`));
    return new PGlite(await connectAsOwner({ name }), name);
  }

  async exec(sql: string): Promise<Result<Record<string, unknown>>[]> {
    // The PGlite shim creates the API roles, which are cluster-wide here and
    // already exist; everything else in it applies per database.
    const statements = sql.includes("create role anon") ? sql.replace(/^create role .*;$/gm, "") : sql;
    const result = (await this.client.query(statements)) as pg.QueryResult | pg.QueryResult[];
    return (Array.isArray(result) ? result : [result]).map((r) => toResult(r));
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<Result<T>> {
    return toResult<T>(await this.client.query(sql, params));
  }

  async transaction<T>(
    fn: (tx: Pick<PGlite, "exec" | "query"> & { rollback: () => Promise<void> }) => Promise<T>,
  ): Promise<T> {
    await this.client.query("begin");
    let finished = false;
    const tx = {
      exec: (sql: string) => this.exec(sql),
      query: <R>(sql: string, params?: unknown[]) => this.query<R>(sql, params),
      rollback: async () => {
        await this.client.query("rollback");
        finished = true;
      },
    };
    try {
      const result = await fn(tx);
      if (!finished) await this.client.query("commit");
      return result;
    } catch (error) {
      if (!finished) await this.client.query("rollback").catch(() => {});
      throw error;
    }
  }

  async close(): Promise<void> {
    await this.client.end();
    await withAdmin((admin) => admin.query(`drop database if exists ${this.name} with (force)`));
  }
}
