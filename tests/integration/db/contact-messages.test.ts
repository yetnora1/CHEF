import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  anon,
  asActor,
  createAuthUser,
  createTestDatabase,
  grantRoleAsOwner,
  service,
  user,
  type Actor,
} from "./harness";

const PERMISSION_DENIED = "42501";
const NOT_FOUND = "P0002";
const INVALID = "22023";
const KEY_CONFLICT = "23505";
const CHECK_VIOLATION = "23514";

type Message = {
  key: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  message: string;
  locale: "en" | "am";
  consent: boolean;
};

const message = (overrides: Partial<Message> = {}): Message => ({
  key: randomUUID(),
  name: "Test Sender",
  email: `sender-${randomUUID().slice(0, 8)}@example.test`,
  phone: null,
  subject: "A question about the menu",
  message: "Do you cook vegetarian dishes for small dinners?",
  locale: "en",
  consent: true,
  ...overrides,
});

const SUBMIT_SQL = `
  select * from public.submit_contact_message(
    p_submission_key := $1, p_contact_name := $2, p_contact_email := $3, p_contact_phone := $4,
    p_subject := $5, p_message := $6, p_preferred_locale := $7, p_consent := $8)`;

const params = (m: Message) => [m.key, m.name, m.email, m.phone, m.subject, m.message, m.locale, m.consent];

type SubmitRow = { message_reference: string; is_replay: boolean };

let db: PGlite;
const ids = { owner: "", admin: "", editor: "", manager: "", analyst: "" };

async function submit(m: Message, actor: Actor = service) {
  return asActor<SubmitRow>(db, actor, SUBMIT_SQL, params(m), { persist: true });
}

async function listAs(actor: Actor, status: "new" | "handled" | null = null, search: string | null = null) {
  return asActor<{ id: string; reference: string; status: string; handled_by_name: string | null }>(
    db,
    actor,
    "select * from public.list_contact_messages(p_status := $1::public.contact_message_status, p_search := $2)",
    [status, search],
  );
}

beforeAll(async () => {
  db = await createTestDatabase();
  for (const [key, role] of [
    ["owner", "owner"],
    ["admin", "admin"],
    ["editor", "content_editor"],
    ["manager", "event_manager"],
    ["analyst", "analyst"],
  ] as const) {
    ids[key] = await createAuthUser(db, `${key}-messages@example.test`, { display_name: `${key} name` });
    await grantRoleAsOwner(db, ids[key], role);
  }
});

afterAll(async () => {
  await db?.close();
});

describe("submit_contact_message", () => {
  it("is executable only by the server secret key", async () => {
    for (const actor of [anon, user(ids.owner)]) {
      const result = await asActor(db, actor, SUBMIT_SQL, params(message()));
      expect(result, JSON.stringify(actor)).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    }
  });

  it("stores a message and returns a non-sequential public reference", async () => {
    const result = await submit(message());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]).toMatchObject({ is_replay: false });
    expect(result.rows[0]!.message_reference).toMatch(/^CM-[0-9A-F]{10}$/);
  });

  it("returns the original reference when the same submission is retried", async () => {
    const m = message();
    const first = await submit(m);
    const retry = await submit(m);
    expect(first.ok && retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;
    expect(retry.rows[0]).toEqual({ message_reference: first.rows[0]!.message_reference, is_replay: true });
  });

  it("refuses a submission key reused for different content", async () => {
    const m = message();
    await submit(m);
    expect(await submit({ ...m, message: "Something else entirely, please." })).toMatchObject({
      ok: false,
      code: KEY_CONFLICT,
    });
  });

  it("requires consent and a submission key", async () => {
    expect(await submit(message({ consent: false }))).toMatchObject({ ok: false, code: INVALID });
    expect(await asActor(db, service, SUBMIT_SQL, [null, ...params(message()).slice(1)])).toMatchObject({
      ok: false,
      code: INVALID,
    });
  });

  it("enforces field rules in the table, including a mailto-safe address", async () => {
    expect(await submit(message({ email: "someone@example.test?cc=other@example.test" }))).toMatchObject({
      ok: false,
      code: CHECK_VIOLATION,
    });
    expect(await submit(message({ message: "x".repeat(3001) }))).toMatchObject({
      ok: false,
      code: CHECK_VIOLATION,
    });
    expect(await submit(message({ subject: "s".repeat(151) }))).toMatchObject({
      ok: false,
      code: CHECK_VIOLATION,
    });
  });
});

describe("contact message visibility", () => {
  it("is invisible to visitors and to the server secret key", async () => {
    for (const actor of [anon, service]) {
      const result = await asActor(db, actor, "select * from public.contact_messages");
      expect(result, JSON.stringify(actor)).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    }
  });

  it("lets owners and admins read the inbox", async () => {
    await submit(message());
    for (const id of [ids.owner, ids.admin]) {
      const result = await listAs(user(id));
      expect(result.ok && result.rows.length > 0, id).toBe(true);
    }
  });

  it("returns nothing to content editors, event managers and analysts", async () => {
    await submit(message());
    for (const id of [ids.editor, ids.manager, ids.analyst]) {
      expect(await listAs(user(id)), id).toMatchObject({ ok: true, rows: [] });
      expect(await asActor(db, user(id), "select * from public.contact_messages"), id).toMatchObject({
        ok: true,
        rows: [],
      });
      expect(await asActor(db, user(id), "select * from public.contact_message_counts()"), id).toMatchObject({
        ok: true,
        rows: [],
      });
    }
  });

  it("never lets staff write to the table directly", async () => {
    const result = await asActor(
      db,
      user(ids.owner),
      "update public.contact_messages set status = 'handled'",
    );
    expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("searches literally, so LIKE wildcards match nothing extra", async () => {
    const m = message({ subject: `Tasting ${randomUUID().slice(0, 6)}` });
    await submit(m);
    const found = await listAs(user(ids.owner), null, m.subject);
    expect(found.ok && found.rows.length).toBe(1);
    expect(await listAs(user(ids.owner), null, "%_%")).toMatchObject({ ok: true, rows: [] });
  });
});

describe("set_contact_message_status", () => {
  async function newMessageId(): Promise<{ id: string; reference: string }> {
    const submitted = await submit(message());
    if (!submitted.ok) throw new Error(submitted.message);
    const reference = submitted.rows[0]!.message_reference;
    const { rows } = await db.query<{ id: string }>(
      "select id from public.contact_messages where reference = $1",
      [reference],
    );
    return { id: rows[0]!.id, reference };
  }

  const SET_SQL = "select public.set_contact_message_status($1, $2::public.contact_message_status) as status";

  it("marks a message handled, records who did it, and audits the change", async () => {
    const { id, reference } = await newMessageId();
    const result = await asActor(db, user(ids.admin), SET_SQL, [id, "handled"], { persist: true });
    expect(result).toMatchObject({ ok: true, rows: [{ status: "handled" }] });

    const listed = await listAs(user(ids.owner), "handled", reference);
    expect(listed.ok && listed.rows[0]).toMatchObject({ status: "handled", handled_by_name: "admin name" });

    const audit = await db.query<{ actor_id: string; details: unknown }>(
      "select actor_id, details from public.audit_logs where action = 'contact_message.status_changed' and target_id = $1",
      [reference],
    );
    expect(audit.rows).toEqual([{ actor_id: ids.admin, details: { from: "new", to: "handled" } }]);
  });

  it("moves a handled message back to new and clears who handled it", async () => {
    const { id, reference } = await newMessageId();
    await asActor(db, user(ids.owner), SET_SQL, [id, "handled"], { persist: true });
    await asActor(db, user(ids.owner), SET_SQL, [id, "new"], { persist: true });
    const listed = await listAs(user(ids.owner), "new", reference);
    expect(listed.ok && listed.rows[0]).toMatchObject({ status: "new", handled_by_name: null });
  });

  it("refuses roles without messages.write and callers without a session", async () => {
    const { id } = await newMessageId();
    for (const id_ of [ids.editor, ids.manager, ids.analyst]) {
      expect(await asActor(db, user(id_), SET_SQL, [id, "handled"]), id_).toMatchObject({
        ok: false,
        code: PERMISSION_DENIED,
      });
    }
    expect(await asActor(db, anon, SET_SQL, [id, "handled"])).toMatchObject({
      ok: false,
      code: PERMISSION_DENIED,
    });
    expect(await asActor(db, service, SET_SQL, [id, "handled"])).toMatchObject({
      ok: false,
      code: PERMISSION_DENIED,
    });
  });

  it("reports an unknown message as not found", async () => {
    expect(await asActor(db, user(ids.owner), SET_SQL, [randomUUID(), "handled"])).toMatchObject({
      ok: false,
      code: NOT_FOUND,
    });
  });
});
