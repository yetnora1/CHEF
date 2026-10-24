/**
 * TEST DOUBLE — a stand-in for the Supabase HTTP APIs the app calls, used by
 * the Playwright "admin" project because Docker (and so the real local
 * Supabase stack) is unavailable in this environment.
 *
 *  - Auth (GoTrue): password sign-in, refresh, user lookup and sign-out for a
 *    fixed set of test accounts.
 *  - Data API (PostgREST): RPC calls only, executed against PGlite (real
 *    Postgres) with every migration and the seed applied. Each call runs, as
 *    PostgREST would, in its own transaction as `anon`, `authenticated` (with
 *    JWT claims) or `service_role` (secret key). RLS, grants, triggers and the
 *    SQL functions are therefore the real ones.
 *
 * It is NOT GoTrue or PostgREST: token formats, headers and error shapes are
 * simplified. Nothing in src/ knows it exists; the app reaches it only through
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 */
import { createHmac, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

export const FAKE_SUPABASE_PORT = 54399;
export const FAKE_SUPABASE_URL = `http://127.0.0.1:${FAKE_SUPABASE_PORT}`;
export const FAKE_PUBLISHABLE_KEY = "sb_publishable_e2e_fake_key_not_secret";
// A test-only value with the secret-key prefix so the app treats it as privileged.
export const FAKE_SECRET_KEY = "sb_secret_e2e_fake_secret_key_for_tests";
export const TEST_PASSWORD = "Correct-Horse-Battery-9";

export const TEST_USERS = {
  owner: { email: "owner@example.test", role: "owner", name: "Owner Test" },
  admin: { email: "admin@example.test", role: "admin", name: "Admin Test" },
  manager: { email: "manager@example.test", role: "event_manager", name: "Manager Test" },
  editor: { email: "editor@example.test", role: "content_editor", name: "Editor Test" },
  analyst: { email: "analyst@example.test", role: "analyst", name: "Analyst Test" },
  noRole: { email: "visitor@example.test", role: null, name: "Visitor Test" },
} as const;

type TestUser = { id: string; email: string };

const root = process.cwd();
const sql = (...parts: string[]) => readFileSync(path.join(root, ...parts), "utf8");

async function createDatabase(): Promise<{ db: PGlite; users: Map<string, TestUser> }> {
  // PostgREST returns `date` columns as "YYYY-MM-DD" strings, not timestamps.
  const db = await PGlite.create({ parsers: { 1082: (value: string) => value } });
  await db.exec(sql("tests", "integration", "db", "supabase-shim.sql"));
  const migrations = readdirSync(path.join(root, "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of migrations) await db.exec(sql("supabase", "migrations", file));
  await db.exec(sql("supabase", "seed.sql"));

  const users = new Map<string, TestUser>();
  for (const user of Object.values(TEST_USERS)) {
    const { rows } = await db.query<{ id: string }>(
      "insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id",
      [user.email, JSON.stringify({ display_name: user.name })],
    );
    const id = rows[0]!.id;
    if (user.role)
      await db.query("insert into public.user_roles (user_id, role) values ($1, $2)", [id, user.role]);
    users.set(user.email, { id, email: user.email });
  }
  return { db, users };
}

const signingSecret = randomBytes(32);
const accessTokens = new Map<string, TestUser>();
const refreshTokens = new Map<string, TestUser>();
const b64url = (value: string | Buffer) => Buffer.from(value).toString("base64url");

function issueSession(user: TestUser) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      role: "authenticated",
      aud: "authenticated",
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createHmac("sha256", signingSecret).update(`${header}.${payload}`).digest("base64url");
  const accessToken = `${header}.${payload}.${signature}`;
  const refreshToken = randomBytes(16).toString("hex");
  accessTokens.set(accessToken, user);
  refreshTokens.set(refreshToken, user);
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: now + 3600,
    refresh_token: refreshToken,
    user: userJson(user),
  };
}

function userJson(user: TestUser) {
  return {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    email_confirmed_at: "2026-01-01T00:00:00Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    identities: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

type Caller = { role: "anon" } | { role: "authenticated"; user: TestUser } | { role: "service_role" };

function callerFor(req: IncomingMessage): Caller {
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  const user = bearer ? accessTokens.get(bearer) : undefined;
  if (user) return { role: "authenticated", user };
  if (bearer === FAKE_SECRET_KEY || req.headers.apikey === FAKE_SECRET_KEY) return { role: "service_role" };
  return { role: "anon" };
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "X-Supabase-Api-Version": "2024-01-01",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    // auth-js reads the API version header to interpret error codes.
    "Access-Control-Expose-Headers": "X-Supabase-Api-Version",
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

/** Postgres array literal for a JS array of simple values. */
const toPgArray = (values: unknown[]) =>
  `{${values.map((v) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;

/** PGlite returns arrays of custom types (enums) as raw literals like "{a,b}". */
function fromPgArray(value: unknown): unknown {
  if (typeof value !== "string" || !value.startsWith("{") || !value.endsWith("}")) return value;
  const inner = value.slice(1, -1);
  return inner === "" ? [] : inner.split(",").map((v) => v.replace(/^"(.*)"$/, "$1"));
}

const HTTP_STATUS: Record<string, number> = {
  "42501": 403,
  P0002: 404,
  "22023": 400,
  "23505": 409,
  "23514": 400,
  "22P02": 400,
};

async function callRpc(
  db: PGlite,
  fn: string,
  args: Record<string, unknown>,
  caller: Caller,
  wantObject: boolean,
) {
  const meta = await db.query<{ names: string[] | null; types: string[]; retset: boolean; scalar: boolean }>(
    `select p.proargnames as names,
            array(select format_type(t, null) from unnest(p.proargtypes) t) as types,
            p.proretset as retset,
            (t.typtype <> 'c' and p.prorettype <> 'record'::regtype) as scalar
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_type t on t.oid = p.prorettype
     where n.nspname = 'public' and p.proname = $1`,
    [fn],
  );
  const proc = meta.rows[0];
  if (!proc) return { status: 404, body: { code: "PGRST202", message: `function public.${fn} not found` } };

  const names = (fromPgArray(proc.names) as string[] | null) ?? [];
  const types = fromPgArray(proc.types) as string[];
  const params: unknown[] = [];
  const named: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    const index = names.indexOf(key);
    if (index < 0) return { status: 404, body: { code: "PGRST202", message: `unknown argument ${key}` } };
    params.push(
      Array.isArray(value)
        ? toPgArray(value)
        : value !== null && typeof value === "object"
          ? JSON.stringify(value)
          : value,
    );
    named.push(`${key} := $${params.length}::${types[index]}`);
  }

  const claims =
    caller.role === "authenticated"
      ? { role: "authenticated", sub: caller.user.id, aud: "authenticated" }
      : { role: caller.role };

  try {
    const result = await db.transaction(async (tx) => {
      await tx.exec(`set local role ${caller.role}`);
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
      return tx.query<Record<string, unknown>>(`select * from public.${fn}(${named.join(", ")})`, params);
    });
    const rows = result.rows.map((row) =>
      Object.fromEntries(Object.entries(row).map(([k, v]) => [k, fromPgArray(v)])),
    );

    if (proc.retset || !proc.scalar) {
      if (!wantObject) return { status: 200, body: rows };
      return rows.length === 1
        ? { status: 200, body: rows[0] }
        : {
            status: 406,
            body: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
          };
    }
    return { status: 200, body: rows[0] ? (Object.values(rows[0])[0] ?? null) : null };
  } catch (error) {
    const pg = error as { code?: string; message?: string };
    return {
      status: HTTP_STATUS[pg.code ?? ""] ?? 400,
      body: { code: pg.code, message: pg.message, details: null, hint: null },
    };
  }
}

export async function startFakeSupabase(): Promise<Server> {
  const { db, users } = await createDatabase();

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", FAKE_SUPABASE_URL);
    if (req.method === "OPTIONS") return send(res, 204);

    if (req.method === "POST" && url.pathname === "/auth/v1/token") {
      const body = await readJson(req);
      if (url.searchParams.get("grant_type") === "password") {
        const user = users.get(String(body.email));
        if (!user || body.password !== TEST_PASSWORD) {
          return send(res, 400, {
            code: "invalid_credentials",
            error_code: "invalid_credentials",
            msg: "Invalid login credentials",
          });
        }
        return send(res, 200, issueSession(user));
      }
      if (url.searchParams.get("grant_type") === "refresh_token") {
        const user = refreshTokens.get(String(body.refresh_token));
        if (!user) return send(res, 400, { code: "refresh_token_not_found", msg: "Invalid Refresh Token" });
        refreshTokens.delete(String(body.refresh_token));
        return send(res, 200, issueSession(user));
      }
    }

    if (req.method === "GET" && url.pathname === "/auth/v1/user") {
      const caller = callerFor(req);
      return caller.role === "authenticated"
        ? send(res, 200, userJson(caller.user))
        : send(res, 403, { code: "bad_jwt", msg: "invalid JWT" });
    }

    if (req.method === "POST" && url.pathname === "/auth/v1/logout") {
      const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
      if (token) accessTokens.delete(token);
      return send(res, 204);
    }

    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (req.method === "POST" && rpc) {
      const wantObject = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
      const result = await callRpc(db, rpc[1]!, await readJson(req), callerFor(req), wantObject);
      return send(res, result.status, result.body);
    }

    send(res, 404, { message: `fake-supabase: no handler for ${req.method} ${url.pathname}` });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => send(res, 500, { message: String(error) }));
  });
  server.on("close", () => void db.close());
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(FAKE_SUPABASE_PORT, "127.0.0.1", () => resolve(server));
  });
}
