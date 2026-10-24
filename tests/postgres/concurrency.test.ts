/*
 * Concurrency on a real PostgreSQL server (`npm run test:db:pg`). PGlite has a
 * single connection, so these cannot run in `npm run test:db`. Every call runs
 * as PostgREST would: its own transaction, SET LOCAL ROLE and JWT claims.
 */
import { randomUUID } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthUser, createTestDatabase, grantRoleAsOwner } from "../integration/db/harness";
import { connectAsOwner } from "../support/pglite-on-postgres";

type Actor = { role: "service_role" } | { role: "authenticated"; sub: string };
type Outcome<T> = { ok: true; rows: T[] } | { ok: false; code: string };

const service: Actor = { role: "service_role" };
const staff = (sub: string): Actor => ({ role: "authenticated", sub });
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SUBMIT =
  "select * from public.submit_inquiry($1, $2, $3, null, 'email', 'wedding', null, $4, null, 'Dinner for guests', null, 'en', true, $5)";

let db: Awaited<ReturnType<typeof createTestDatabase>>;
const clients: pg.Client[] = [];

async function connection(): Promise<pg.Client> {
  const client = await connectAsOwner(db as unknown as { name: string });
  clients.push(client);
  return client;
}

const connections = (n: number) => Promise.all(Array.from({ length: n }, connection));

async function begin(client: pg.Client, actor: Actor) {
  await client.query("begin");
  await client.query(`set local role ${actor.role}`);
  const claims = actor.role === "authenticated" ? { ...actor, aud: "authenticated" } : actor;
  await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
}

async function call<T = Record<string, unknown>>(
  client: pg.Client,
  actor: Actor,
  sql: string,
  params: unknown[] = [],
): Promise<Outcome<T>> {
  await begin(client, actor);
  try {
    const result = await client.query(sql, params);
    await client.query("commit");
    return { ok: true, rows: result.rows as T[] };
  } catch (error) {
    await client.query("rollback");
    return { ok: false, code: (error as { code: string }).code };
  }
}

async function submitInquiry(client: pg.Client, name: string, notify = false) {
  const result = await call<{ inquiry_reference: string }>(client, service, SUBMIT, [
    randomUUID(),
    name,
    `${randomUUID().slice(0, 8)}@example.test`,
    30,
    notify,
  ]);
  if (!result.ok) throw new Error(`submit_inquiry failed: ${result.code}`);
  const reference = result.rows[0]!.inquiry_reference;
  const { rows } = await db.query<{ id: string }>("select id from public.bookings where reference = $1", [
    reference,
  ]);
  return rows[0]!.id;
}

async function staffMember(role: string) {
  const id = await createAuthUser(db, `${role}-${randomUUID().slice(0, 8)}@example.test`);
  await grantRoleAsOwner(db, id, role);
  return id;
}

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await Promise.all(clients.map((client) => client.end().catch(() => {})));
  await db?.close();
});

describe("rate limiter", () => {
  it("allows exactly the limit out of 40 simultaneous hits on one bucket", async () => {
    const bucket = `inquiry:ip:600:${randomUUID()}`;
    const results = await Promise.all(
      (await connections(40)).map((client) =>
        call<{ allowed: boolean }>(client, service, "select * from public.consume_rate_limit($1, 5, 600)", [
          bucket,
        ]),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results.filter((r) => r.ok && r.rows[0]!.allowed)).toHaveLength(5);
    const { rows } = await db.query<{ hits: number }>(
      "select hits from private.rate_limits where bucket = $1",
      [bucket],
    );
    expect(rows[0]!.hits).toBe(40);
  });

  it("cleans up expired windows from many callers without deadlocks", async () => {
    await db.query(
      `insert into private.rate_limits (bucket, window_start, hits, expires_at)
       select 'expired:' || g, now() - interval '2 days', 1, now() - interval '1 day' from generate_series(1, 3000) g`,
    );
    const results = await Promise.all(
      (await connections(30)).map((client, i) =>
        call(client, service, "select * from public.consume_rate_limit($1, 5, 600)", [
          `bucket:${i}:${randomUUID()}`,
        ]),
      ),
    );
    expect(results.filter((r) => !r.ok)).toEqual([]);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from private.rate_limits where expires_at < now()",
    );
    expect(rows[0]!.n).toBeLessThan(3000);
  });
});

describe("submit_inquiry idempotency", () => {
  it("20 simultaneous retries with one key and the same content create one inquiry", async () => {
    const key = randomUUID();
    const results = await Promise.all(
      (await connections(20)).map((client) =>
        call<{ inquiry_reference: string; is_replay: boolean }>(client, service, SUBMIT, [
          key,
          "Retry Test",
          "retry@example.test",
          80,
          false,
        ]),
      ),
    );
    expect(results.filter((r) => !r.ok)).toEqual([]);
    expect(new Set(results.map((r) => r.ok && r.rows[0]!.inquiry_reference)).size).toBe(1);
    expect(results.filter((r) => r.ok && !r.rows[0]!.is_replay)).toHaveLength(1);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.bookings where submission_key = $1",
      [key],
    );
    expect(rows[0]!.n).toBe(1);
  });

  it("one key with different content: one inquiry, every other request is refused (23505)", async () => {
    const key = randomUUID();
    const results = await Promise.all(
      (await connections(10)).map((client, i) =>
        call(client, service, SUBMIT, [key, `Variant ${i}`, `variant-${i}@example.test`, 10 + i, false]),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok).map((r) => !r.ok && r.code)).toEqual(Array(9).fill("23505"));
  });
});

describe("notification outbox", () => {
  it("parallel claimers never receive the same message twice", async () => {
    await db.query("delete from private.notification_outbox");
    const submitter = await connection();
    for (let i = 0; i < 30; i++) await submitInquiry(submitter, `Outbox ${i}`, true);
    const results = await Promise.all(
      (await connections(6)).map((client) =>
        call<{ notification_id: string }>(client, service, "select * from public.claim_notifications(50)"),
      ),
    );
    expect(results.every((r) => r.ok)).toBe(true);
    const ids = results.flatMap((r) => (r.ok ? r.rows.map((row) => row.notification_id) : []));
    expect(ids).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
  });
});

describe("role changes", () => {
  it("two owners revoking each other at once: exactly one succeeds and an owner remains", async () => {
    for (let round = 0; round < 10; round++) {
      await db.query("delete from public.user_roles where role = 'owner'");
      const [a, b] = [await staffMember("owner"), await staffMember("owner")];
      const [ca, cb] = [await connection(), await connection()];
      const outcomes = await Promise.all([
        call(ca, staff(a), "select public.revoke_role($1, 'owner')", [b]),
        call(cb, staff(b), "select public.revoke_role($1, 'owner')", [a]),
      ]);
      expect(outcomes.filter((o) => o.ok)).toHaveLength(1);
      const { rows } = await db.query<{ n: number }>(
        "select count(*)::int as n from public.user_roles where role = 'owner'",
      );
      expect(rows[0]!.n).toBe(1);
    }
  });

  it("an admin demoted by a transaction that commits first cannot finish a role change", async () => {
    const [owner, admin] = [await staffMember("owner"), await staffMember("admin")];
    const target = await createAuthUser(db, `target-${randomUUID().slice(0, 8)}@example.test`);
    const [co, ca] = [await connection(), await connection()];

    await begin(co, staff(owner));
    await co.query("select public.revoke_role($1, 'admin')", [admin]); // holds the lock
    const pending = call(ca, staff(admin), "select public.assign_role($1, 'event_manager')", [target]);
    await pause(300); // the admin's call is waiting on the lock
    await co.query("commit");

    expect(await pending).toEqual({ ok: false, code: "42501" });
    const { rows } = await db.query("select 1 from public.user_roles where user_id = $1", [target]);
    expect(rows).toHaveLength(0);
  });
});

describe("booking workflow", () => {
  it("a status change that waited on another is checked against the committed status", async () => {
    const [first, second] = [await staffMember("admin"), await staffMember("admin")];
    const id = await submitInquiry(await connection(), "Workflow");
    const [c1, c2] = [await connection(), await connection()];

    await begin(c1, staff(first));
    await c1.query("select public.change_booking_status($1, 'declined')", [id]); // new → declined
    const pending = call(c2, staff(second), "select public.change_booking_status($1, 'contacted')", [id]);
    await pause(300);
    await c1.query("commit");

    // declined → contacted is not a valid transition; the stale 'new' must not be used.
    expect(await pending).toEqual({ ok: false, code: "22023" });
    const history = await db.query<{ from_status: string | null; to_status: string }>(
      "select from_status, to_status from public.booking_status_history where booking_id = $1 order by id",
      [id],
    );
    expect(history.rows).toEqual([
      { from_status: null, to_status: "new" },
      { from_status: "new", to_status: "declined" },
    ]);
  });

  it("records a known race: a note sent during an uncommitted reassignment is kept", async () => {
    // add_booking_note checks access on its own snapshot and takes no row lock;
    // its insert then waits for assign_booking's lock and lands afterwards. The
    // author still had access when the request started (low impact).
    const admin = await staffMember("admin");
    const [m1, m2] = [await staffMember("event_manager"), await staffMember("event_manager")];
    const id = await submitInquiry(await connection(), "Reassignment");
    const [ca, cm] = [await connection(), await connection()];
    expect((await call(ca, staff(admin), "select public.assign_booking($1, $2)", [id, m1])).ok).toBe(true);

    await begin(ca, staff(admin));
    await ca.query("select public.assign_booking($1, $2)", [id, m2]);
    const pending = call(cm, staff(m1), "select public.add_booking_note($1, 'racing note')", [id]);
    await pause(300);
    await ca.query("commit");

    expect((await pending).ok).toBe(true);
    const notes = await db.query<{ author_id: string }>(
      "select author_id from public.booking_notes where booking_id = $1",
      [id],
    );
    expect(notes.rows).toEqual([{ author_id: m1 }]);
    expect(await call(cm, staff(m1), "select public.add_booking_note($1, 'late note')", [id])).toEqual({
      ok: false,
      code: "P0002",
    });
  });
});
