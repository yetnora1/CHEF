/**
 * TEST DOUBLE — a minimal stand-in for the Supabase Auth and PostgREST HTTP
 * endpoints the admin app calls, used only by the Playwright "admin" project
 * because Docker (and so the real local Supabase stack) may be unavailable.
 *
 * It lets the real browser → proxy → Server Component → authorization path run
 * end to end for each role. It does NOT test RLS: database authorization is
 * covered against real Postgres in tests/integration/db. Nothing in src/ knows
 * this server exists; it is reached only through NEXT_PUBLIC_SUPABASE_URL.
 */
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ROLE_PERMISSIONS, type AppRole } from "../../../src/lib/permissions/matrix";

export const FAKE_SUPABASE_PORT = 54399;
export const FAKE_SUPABASE_URL = `http://127.0.0.1:${FAKE_SUPABASE_PORT}`;
export const FAKE_PUBLISHABLE_KEY = "sb_publishable_e2e_fake_key_not_secret";
export const TEST_PASSWORD = "Correct-Horse-Battery-9";

export const TEST_USERS = {
  owner: { email: "owner@example.test", roles: ["owner"] },
  editor: { email: "editor@example.test", roles: ["content_editor"] },
  analyst: { email: "analyst@example.test", roles: ["analyst"] },
  noRole: { email: "visitor@example.test", roles: [] },
} satisfies Record<string, { email: string; roles: AppRole[] }>;

type TestUser = { id: string; email: string; roles: AppRole[] };

const users: TestUser[] = Object.values(TEST_USERS).map((u) => ({
  ...u,
  id: randomUUID(),
  roles: [...u.roles],
}));
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

function bearerUser(req: IncomingMessage): TestUser | undefined {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  return token ? accessTokens.get(token) : undefined;
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "X-Supabase-Api-Version": "2024-01-01",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", FAKE_SUPABASE_URL);
  if (req.method === "OPTIONS") return send(res, 204);

  if (req.method === "POST" && url.pathname === "/auth/v1/token") {
    const body = await readJson(req);
    if (url.searchParams.get("grant_type") === "password") {
      const user = users.find((u) => u.email === body.email);
      if (!user || body.password !== TEST_PASSWORD) {
        return send(res, 400, { code: "invalid_credentials", msg: "Invalid login credentials" });
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
    const user = bearerUser(req);
    return user ? send(res, 200, userJson(user)) : send(res, 403, { code: "bad_jwt", msg: "invalid JWT" });
  }

  if (req.method === "POST" && url.pathname === "/auth/v1/logout") {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (token) accessTokens.delete(token);
    return send(res, 204);
  }

  if (req.method === "POST" && url.pathname === "/rest/v1/rpc/get_my_access") {
    const user = bearerUser(req);
    if (!user) return send(res, 401, { code: "PGRST301", message: "JWT invalid" });
    const permissions = [...new Set(user.roles.flatMap((role) => ROLE_PERMISSIONS[role]))].sort();
    return send(res, 200, { roles: user.roles, permissions });
  }

  send(res, 404, { message: `fake-supabase: no handler for ${req.method} ${url.pathname}` });
}

export function startFakeSupabase(): Promise<Server> {
  const server = createServer((req, res) => {
    handle(req, res).catch(() => send(res, 500, { message: "fake-supabase error" }));
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(FAKE_SUPABASE_PORT, "127.0.0.1", () => resolve(server));
  });
}
