/**
 * TEST DOUBLE — a stand-in for the Supabase HTTP APIs the app calls, used by
 * the Playwright "admin" project because Docker (and so the real local
 * Supabase stack) is unavailable in this environment, and by the local demo
 * (`npm run dev:demo`, scripts/dev-demo.mjs) with sample content added.
 *
 *  - Auth (GoTrue): password sign-in, refresh, user lookup, sign-out, and changing
 *    a password or email (with a confirmation link) for a fixed set of test accounts.
 *  - Data API (PostgREST): RPC calls, and inserts, updates and deletes on
 *    tables filtered by equality (all the CMS uses), executed against PGlite
 *    (real Postgres) with every migration and the seed applied. Each call runs,
 *    as PostgREST would, in its own transaction as `anon`, `authenticated`
 *    (with JWT claims) or `service_role` (secret key). RLS, grants, triggers
 *    and the SQL functions are therefore the real ones.
 *  - Storage: upload, download, remove and signed links (with range requests).
 *    Like the Storage API, it writes, reads and deletes storage.objects rows as
 *    the caller's role, so the bucket's RLS policies decide; file bytes are kept
 *    in memory.
 *
 * It is NOT GoTrue or PostgREST: token formats, headers and error shapes are
 * simplified. Nothing in src/ knows it exists; the app reaches it only through
 * NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 */
import { createHmac, randomBytes } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { PGlite, type Transaction } from "@electric-sql/pglite";

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
  // Only tests/e2e/staff.spec.ts changes this account's roles.
  newcomer: { email: "newcomer@example.test", role: null, name: "Newcomer Test" },
  // Only tests/e2e/account.spec.ts changes these accounts' sign-in details.
  lapsedUser: { email: "lapsed-user@example.test", role: "content_editor", name: "Lapsed Test" },
  usernameUser: { email: "username-user@example.test", role: "content_editor", name: "Username Test" },
  passwordUser: { email: "password-user@example.test", role: "content_editor", name: "Password Test" },
  emailUser: { email: "email-user@example.test", role: "content_editor", name: "Email Test" },
} as const;

export type TestUser = {
  id: string;
  email: string;
  /** Set once changed from TEST_PASSWORD. */
  password?: string;
  /** An email change. Like Auth, the address stays after its link is cancelled. */
  newEmail?: string;
  /** When its link was sent; cleared when the link is cancelled. */
  emailChangeSentAt?: string;
};

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
    ...(user.newEmail ? { new_email: user.newEmail } : {}),
    ...(user.emailChangeSentAt ? { email_change_sent_at: user.emailChangeSentAt } : {}),
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
    // The wildcard does not cover Authorization, which a browser's upload to Storage sends.
    "Access-Control-Allow-Headers": "*, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    // auth-js reads the API version header to interpret error codes.
    "Access-Control-Expose-Headers": "X-Supabase-Api-Version",
  });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  try {
    return JSON.parse((await readBody(req)).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

/** Runs `work` in one transaction as the caller's database role, with JWT claims. */
function asCaller<T>(db: PGlite, caller: Caller, work: (tx: Transaction) => Promise<T>): Promise<T> {
  const claims =
    caller.role === "authenticated"
      ? { role: "authenticated", sub: caller.user.id, aud: "authenticated" }
      : { role: caller.role };
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${caller.role}`);
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    return work(tx);
  });
}

type PgError = { code?: string; message?: string; detail?: string; hint?: string };

const pgErrorBody = (error: PgError) => ({
  code: error.code,
  message: error.message,
  details: error.detail ?? null,
  hint: error.hint ?? null,
});

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
  "23503": 409,
  "23001": 409,
  "23514": 400,
  "22P02": 400,
  "42P01": 404,
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

  try {
    const result = await asCaller(db, caller, (tx) =>
      tx.query<Record<string, unknown>>(`select * from public.${fn}(${named.join(", ")})`, params),
    );
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
    const pg = error as PgError;
    return { status: HTTP_STATUS[pg.code ?? ""] ?? 400, body: pgErrorBody(pg) };
  }
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/** Text input for a column: arrays as Postgres array literals, objects as JSON. */
function encodeValue(dataType: string | undefined, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && dataType === "ARRAY") return toPgArray(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * PostgREST table requests: POST (insert one row), PATCH and DELETE with
 * `column=eq.value` filters, `select=` with plain columns, `Prefer:
 * return=representation` and the single-object Accept header.
 */
async function callTable(
  db: PGlite,
  method: string,
  table: string,
  url: URL,
  body: unknown,
  caller: Caller,
  headers: IncomingMessage["headers"],
): Promise<{ status: number; body?: unknown }> {
  const unsupported = (message: string) => ({ status: 400, body: { code: "PGRST100", message } });
  const { rows: columns } = await db.query<{ column_name: string; data_type: string }>(
    "select column_name, data_type from information_schema.columns where table_schema = 'public' and table_name = $1",
    [table],
  );
  if (columns.length === 0) {
    return { status: 404, body: { code: "42P01", message: `relation "public.${table}" does not exist` } };
  }
  const types = new Map(columns.map((c) => [c.column_name, c.data_type]));
  if (Array.isArray(body)) return unsupported("fake-supabase: bulk inserts are not supported");
  const row = (method === "DELETE" ? {} : (body ?? {})) as Record<string, unknown>;

  let select: string[] = [];
  const filters: [string, string][] = [];
  for (const [key, value] of url.searchParams) {
    if (key === "select") select = value.split(",").filter(Boolean);
    else if (key === "columns") continue;
    else if (value.startsWith("eq.")) filters.push([key, value.slice(3)]);
    else return unsupported(`fake-supabase: unsupported filter ${key}=${value}`);
  }
  for (const name of [...select, ...filters.map(([column]) => column), ...Object.keys(row)]) {
    if (!IDENTIFIER.test(name) || !types.has(name)) {
      return { status: 400, body: { code: "PGRST204", message: `unknown column ${name} of ${table}` } };
    }
  }

  const params: unknown[] = [];
  const param = (column: string, value: unknown) => {
    params.push(encodeValue(types.get(column), value));
    return `$${params.length}`;
  };
  const entries = Object.entries(row);
  const representation = String(headers.prefer ?? "").includes("return=representation");
  const returning = representation ? ` returning ${select.length ? select.join(", ") : "*"}` : "";

  let statement: string;
  if (method === "POST") {
    const values = entries.map(([column, value]) => param(column, value));
    statement = `insert into public.${table} (${entries.map(([column]) => column).join(", ")}) values (${values.join(", ")})${returning}`;
  } else if (method === "PATCH") {
    if (entries.length === 0) return unsupported("fake-supabase: empty update");
    const assignments = entries.map(([column, value]) => `${column} = ${param(column, value)}`);
    const where = filters.map(([column, value]) => `${column} = ${param(column, value)}`);
    statement = `update public.${table} set ${assignments.join(", ")}${where.length ? ` where ${where.join(" and ")}` : ""}${returning}`;
  } else {
    const where = filters.map(([column, value]) => `${column} = ${param(column, value)}`);
    statement = `delete from public.${table}${where.length ? ` where ${where.join(" and ")}` : ""}${returning}`;
  }

  try {
    const result = await asCaller(db, caller, (tx) => tx.query<Record<string, unknown>>(statement, params));
    if (!representation) return { status: method === "POST" ? 201 : 204 };
    const rows = result.rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, fromPgArray(v)])),
    );
    const ok = method === "POST" ? 201 : 200;
    if (!String(headers.accept ?? "").includes("vnd.pgrst.object")) return { status: ok, body: rows };
    return rows.length === 1
      ? { status: ok, body: rows[0] }
      : {
          status: 406,
          body: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
        };
  } catch (error) {
    const pg = error as PgError;
    const status = pg.code === "42501" && caller.role === "anon" ? 401 : (HTTP_STATUS[pg.code ?? ""] ?? 400);
    return { status, body: pgErrorBody(pg) };
  }
}

export type StoredFile = { bytes: Buffer; contentType: string };

/** Storage API errors: HTTP 400 with the meaningful status in `statusCode`. */
const storageError = (statusCode: string, error: string, message: string) => ({
  status: 400,
  body: { statusCode, error, message },
});

async function storageUpload(
  db: PGlite,
  files: Map<string, StoredFile>,
  bucket: string,
  name: string,
  req: IncomingMessage,
  caller: Caller,
): Promise<{ status: number; body: unknown }> {
  const bytes = await readBody(req);
  const contentType = String(req.headers["content-type"] ?? "application/octet-stream");
  const { rows } = await db.query<{ file_size_limit: number | null; allowed_mime_types: unknown }>(
    "select file_size_limit, allowed_mime_types from storage.buckets where id = $1",
    [bucket],
  );
  const config = rows[0];
  if (!config) return storageError("404", "Bucket not found", "Bucket not found");
  if (config.file_size_limit !== null && bytes.byteLength > Number(config.file_size_limit)) {
    return storageError("413", "Payload too large", "The object exceeded the maximum allowed size");
  }
  const allowed = fromPgArray(config.allowed_mime_types) as string[] | null;
  if (allowed && !allowed.includes(contentType)) {
    return storageError("415", "invalid_mime_type", `mime type ${contentType} is not supported`);
  }
  if (String(req.headers["x-upsert"]) === "true") {
    return storageError("400", "fake-supabase", "upsert is not supported by the test double");
  }
  try {
    const result = await asCaller(db, caller, (tx) =>
      tx.query<{ id: string }>(
        `insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
         values ($1, $2, auth.uid(), auth.uid()::text, $3::jsonb) returning id`,
        [bucket, name, JSON.stringify({ mimetype: contentType, size: bytes.byteLength })],
      ),
    );
    files.set(`${bucket}/${name}`, { bytes, contentType });
    return { status: 200, body: { Id: result.rows[0]!.id, Key: `${bucket}/${name}` } };
  } catch (error) {
    const pg = error as PgError;
    if (pg.code === "23505") return storageError("409", "Duplicate", "The resource already exists");
    if (pg.code === "42501") {
      return storageError("403", "Unauthorized", "new row violates row-level security policy");
    }
    throw error;
  }
}

async function storageDownload(
  db: PGlite,
  files: Map<string, StoredFile>,
  bucket: string,
  name: string,
  caller: Caller,
): Promise<StoredFile | null> {
  const { rows } = await asCaller(db, caller, (tx) =>
    tx.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [bucket, name]),
  );
  return rows.length ? (files.get(`${bucket}/${name}`) ?? null) : null;
}

async function storageRemove(
  db: PGlite,
  files: Map<string, StoredFile>,
  bucket: string,
  prefixes: unknown,
  caller: Caller,
): Promise<{ status: number; body: unknown }> {
  const names = Array.isArray(prefixes) ? prefixes.map(String) : [];
  const { rows } = await asCaller(db, caller, (tx) =>
    tx.query<{ id: string; bucket_id: string; name: string }>(
      "delete from storage.objects where bucket_id = $1 and name = any($2::text[]) returning id, bucket_id, name",
      [bucket, toPgArray(names)],
    ),
  );
  for (const row of rows) files.delete(`${bucket}/${row.name}`);
  return { status: 200, body: rows };
}

/**
 * Extra data written straight into the database (as the superuser, so with no
 * end-user identity) and into the in-memory Storage before the server starts.
 * Used by `npm run dev:demo` (scripts/demo/demo-content.ts); the e2e tests
 * start without it.
 */
export type FakeSupabaseSeed = (context: {
  db: PGlite;
  files: Map<string, StoredFile>;
  users: Map<string, TestUser>;
}) => Promise<void>;

export async function startFakeSupabase(options: { seed?: FakeSupabaseSeed } = {}): Promise<Server> {
  const { db, users } = await createDatabase();
  const files = new Map<string, StoredFile>();
  // Signed link token → object, as a signed link is a capability of its own.
  const signedLinks = new Map<string, string>();
  // Email-change links by token, the latest link per address, and codes for the session.
  const emailChanges = new Map<string, { user: TestUser; email: string }>();
  const emailLinks = new Map<string, string>();
  const authCodes = new Map<string, TestUser>();
  await options.seed?.({ db, files, users });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", FAKE_SUPABASE_URL);
    if (req.method === "OPTIONS") return send(res, 204);

    if (req.method === "POST" && url.pathname === "/auth/v1/token") {
      const body = await readJson(req);
      if (url.searchParams.get("grant_type") === "password") {
        const user = users.get(String(body.email));
        if (!user || body.password !== (user.password ?? TEST_PASSWORD)) {
          return send(res, 400, {
            code: "invalid_credentials",
            error_code: "invalid_credentials",
            msg: "Invalid login credentials",
          });
        }
        return send(res, 200, issueSession(user));
      }
      if (url.searchParams.get("grant_type") === "pkce") {
        const user = authCodes.get(String(body.auth_code));
        if (!user) return send(res, 400, { code: "flow_state_not_found", msg: "invalid flow state" });
        authCodes.delete(String(body.auth_code));
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

    if (req.method === "PUT" && url.pathname === "/auth/v1/user") {
      const caller = callerFor(req);
      if (caller.role !== "authenticated") return send(res, 401, { code: "bad_jwt", msg: "invalid JWT" });
      const { user } = caller;
      const body = await readJson(req);
      if (typeof body.password === "string") {
        if (body.password === (user.password ?? TEST_PASSWORD)) {
          return send(res, 422, { code: "same_password", msg: "New password should be different" });
        }
        user.password = body.password;
        // Like Auth, ends the account's other sessions; the caller's stays.
        const current = req.headers.authorization?.replace(/^Bearer\s+/i, "");
        for (const [token, holder] of accessTokens) {
          if (holder.id === user.id && token !== current) accessTokens.delete(token);
        }
        for (const [token, holder] of refreshTokens) {
          if (holder.id === user.id) refreshTokens.delete(token);
        }
        // Like Auth, cancels a waiting email change's links but keeps its address.
        for (const [token, change] of emailChanges) {
          if (change.user.id === user.id) emailChanges.delete(token);
        }
        delete user.emailChangeSentAt;
      }
      if (typeof body.email === "string") {
        if (users.has(body.email)) {
          return send(res, 422, { code: "email_exists", msg: "Email address already registered" });
        }
        const token = randomBytes(16).toString("hex");
        emailChanges.set(token, { user, email: body.email });
        const redirectTo = encodeURIComponent(url.searchParams.get("redirect_to") ?? "");
        emailLinks.set(
          body.email,
          `${FAKE_SUPABASE_URL}/auth/v1/verify?token=${token}&type=email_change&redirect_to=${redirectTo}`,
        );
        user.newEmail = body.email;
        user.emailChangeSentAt = new Date().toISOString();
      }
      return send(res, 200, userJson(user));
    }

    if (req.method === "GET" && url.pathname === "/auth/v1/verify") {
      const change = emailChanges.get(url.searchParams.get("token") ?? "");
      const redirectTo = url.searchParams.get("redirect_to");
      if (!change) {
        res.writeHead(302, {
          Location: `${redirectTo}?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
        });
        return res.end();
      }
      emailChanges.delete(url.searchParams.get("token") ?? "");
      const { user, email } = change;
      await db.query("update auth.users set email = $1 where id = $2", [email, user.id]);
      users.delete(user.email);
      user.email = email;
      delete user.newEmail;
      delete user.emailChangeSentAt;
      users.set(email, user);
      const code = randomBytes(16).toString("hex");
      authCodes.set(code, user);
      res.writeHead(302, { Location: `${redirectTo}?code=${code}` });
      return res.end();
    }

    // For the tests: what the mailbox would have received.
    if (req.method === "GET" && url.pathname === "/__test/email-link") {
      return send(res, 200, { link: emailLinks.get(url.searchParams.get("to") ?? "") ?? null });
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

    const table = url.pathname.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (table && ["POST", "PATCH", "DELETE"].includes(req.method ?? "")) {
      const body = req.method === "DELETE" ? {} : JSON.parse((await readBody(req)).toString("utf8") || "{}");
      const result = await callTable(db, req.method!, table[1]!, url, body, callerFor(req), req.headers);
      return send(res, result.status, result.body);
    }

    const signed = url.pathname.match(/^\/storage\/v1\/object\/sign\/([a-z0-9_-]+)\/(.+)$/);
    if (signed && req.method === "POST") {
      const name = decodeURIComponent(signed[2]!);
      const file = await storageDownload(db, files, signed[1]!, name, callerFor(req));
      if (!file) {
        const missing = storageError("404", "not_found", "Object not found");
        return send(res, missing.status, missing.body);
      }
      const token = randomBytes(16).toString("hex");
      signedLinks.set(token, `${signed[1]}/${name}`);
      return send(res, 200, { signedURL: `/object/sign/${signed[1]}/${name}?token=${token}` });
    }
    if (signed && req.method === "GET") {
      const key = `${signed[1]}/${decodeURIComponent(signed[2]!)}`;
      const file = signedLinks.get(url.searchParams.get("token") ?? "") === key ? files.get(key) : undefined;
      if (!file) {
        const missing = storageError("404", "not_found", "Object not found");
        return send(res, missing.status, missing.body);
      }
      const total = file.bytes.byteLength;
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? "");
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
      res.writeHead(range ? 206 : 200, {
        "Content-Type": file.contentType,
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
        ...(range ? { "Content-Range": `bytes ${start}-${end}/${total}` } : {}),
      });
      return res.end(file.bytes.subarray(start, end + 1));
    }

    const object = url.pathname.match(/^\/storage\/v1\/object\/(?:authenticated\/)?([a-z0-9_-]+)\/(.+)$/);
    if (object && req.method === "POST") {
      const name = decodeURIComponent(object[2]!);
      const result = await storageUpload(db, files, object[1]!, name, req, callerFor(req));
      return send(res, result.status, result.body);
    }
    if (object && req.method === "GET") {
      const name = decodeURIComponent(object[2]!);
      const file = await storageDownload(db, files, object[1]!, name, callerFor(req));
      if (!file) {
        const missing = storageError("404", "not_found", "Object not found");
        return send(res, missing.status, missing.body);
      }
      res.writeHead(200, { "Content-Type": file.contentType, "Content-Length": file.bytes.byteLength });
      return res.end(file.bytes);
    }

    const bucket = url.pathname.match(/^\/storage\/v1\/object\/([a-z0-9_-]+)$/);
    if (bucket && req.method === "DELETE") {
      const result = await storageRemove(
        db,
        files,
        bucket[1]!,
        (await readJson(req)).prefixes,
        callerFor(req),
      );
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
