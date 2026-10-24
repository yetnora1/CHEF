import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BOOKING_STATUSES, BOOKING_TRANSITIONS } from "@/features/bookings/status";
import {
  anon,
  asActor,
  createAuthUser,
  createTestDatabase,
  grantRoleAsOwner,
  service,
  user,
} from "./harness";

const PERMISSION_DENIED = "42501";
const NOT_FOUND = "P0002";
const INVALID = "22023";

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

type Inquiry = {
  key: string;
  name: string;
  email: string;
  phone: string | null;
  method: "email" | "phone" | "messaging_app";
  eventType: string;
  eventDate: string | null;
  guests: number;
  venue: string | null;
  requirements: string | null;
  message: string | null;
  locale: "en" | "am";
  consent: boolean;
  notify: boolean;
};

const inquiry = (overrides: Partial<Inquiry> = {}): Inquiry => ({
  key: randomUUID(),
  name: "Test Customer",
  email: `customer-${randomUUID().slice(0, 8)}@example.test`,
  phone: null,
  method: "email",
  eventType: "wedding",
  eventDate: daysFromNow(60),
  guests: 120,
  venue: "Addis Ababa",
  requirements: "Dinner for guests",
  message: null,
  locale: "en",
  consent: true,
  notify: false,
  ...overrides,
});

const SUBMIT_SQL = `
  select * from public.submit_inquiry(
    p_submission_key := $1, p_contact_name := $2, p_contact_email := $3, p_contact_phone := $4,
    p_preferred_contact_method := $5::public.contact_method, p_event_type := $6::public.event_type,
    p_event_date := $7::date, p_guest_count := $8, p_venue := $9, p_service_requirements := $10,
    p_message := $11, p_preferred_locale := $12, p_consent := $13, p_notify := $14)`;

const params = (i: Inquiry) => [
  i.key,
  i.name,
  i.email,
  i.phone,
  i.method,
  i.eventType,
  i.eventDate,
  i.guests,
  i.venue,
  i.requirements,
  i.message,
  i.locale,
  i.consent,
  i.notify,
];

let db: PGlite;
const ids = {} as Record<
  "owner" | "admin" | "manager" | "otherManager" | "editor" | "analyst" | "noRole",
  string
>;

async function submit(i: Inquiry) {
  return asActor<{ inquiry_reference: string; is_replay: boolean }>(db, service, SUBMIT_SQL, params(i), {
    persist: true,
  });
}

async function bookingId(reference: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>("select id from public.bookings where reference = $1", [
    reference,
  ]);
  return rows[0]!.id;
}

async function newBooking(overrides: Partial<Inquiry> = {}) {
  const result = await submit(inquiry(overrides));
  if (!result.ok) throw new Error(result.message);
  const reference = result.rows[0]!.inquiry_reference;
  return { reference, id: await bookingId(reference) };
}

beforeAll(async () => {
  db = await createTestDatabase();
  for (const [key, role] of [
    ["owner", "owner"],
    ["admin", "admin"],
    ["manager", "event_manager"],
    ["otherManager", "event_manager"],
    ["editor", "content_editor"],
    ["analyst", "analyst"],
    ["noRole", null],
  ] as const) {
    ids[key] = await createAuthUser(db, `${key}@example.test`, { display_name: `${key} name` });
    if (role) await grantRoleAsOwner(db, ids[key], role);
  }
});

afterAll(async () => {
  await db?.close();
});

describe("public submission (submit_inquiry)", () => {
  it("is callable only with the server secret key", async () => {
    for (const actor of [anon, user(ids.noRole), user(ids.owner)]) {
      expect(await asActor(db, actor, SUBMIT_SQL, params(inquiry()))).toMatchObject({
        ok: false,
        code: PERMISSION_DENIED,
      });
    }
  });

  it("stores a website inquiry as new, unassigned, with history and a CH- reference", async () => {
    const { reference, id } = await newBooking({ email: "  Mixed.Case@Example.TEST " });
    expect(reference).toMatch(/^CH-[0-9A-F]{10}$/);

    const { rows } = await db.query<Record<string, unknown>>(
      "select status, source, assigned_to, contact_email, consent_given_at from public.bookings where id = $1",
      [id],
    );
    expect(rows[0]).toMatchObject({
      status: "new",
      source: "website",
      assigned_to: null,
      contact_email: "mixed.case@example.test",
    });
    expect(rows[0]!.consent_given_at).not.toBeNull();

    const history = await db.query(
      "select from_status, to_status, changed_by from public.booking_status_history where booking_id = $1",
      [id],
    );
    expect(history.rows).toEqual([{ from_status: null, to_status: "new", changed_by: null }]);
  });

  it("returns the original reference when the same submission is retried", async () => {
    const original = inquiry();
    const first = await submit(original);
    const retry = await submit(original);
    expect(first.ok && retry.ok).toBe(true);
    if (!first.ok || !retry.ok) return;
    expect(retry.rows[0]).toEqual({ inquiry_reference: first.rows[0]!.inquiry_reference, is_replay: true });

    const { rows } = await db.query<{ count: number }>(
      "select count(*)::int as count from public.bookings where submission_key = $1",
      [original.key],
    );
    expect(rows[0]!.count).toBe(1);
  });

  it("rejects a reused key with different content", async () => {
    const original = inquiry();
    await submit(original);
    const tampered = await submit({ ...original, guests: 999 });
    expect(tampered).toMatchObject({ ok: false, code: "23505" });
  });

  it("does not mistake shifted optional fields for a replay", async () => {
    const original = inquiry({ venue: null, requirements: "Alpha", message: "Beta" });
    await submit(original);
    const shifted = await submit({ ...original, venue: "Alpha", requirements: "Beta", message: null });
    expect(shifted).toMatchObject({ ok: false, code: "23505" });
  });

  it("treats a repeat request with a new key as a new inquiry and flags it for staff", async () => {
    const shared = { email: "repeat@example.test", eventType: "corporate", eventDate: daysFromNow(90) };
    const first = await newBooking(shared);
    const second = await newBooking(shared);
    expect(second.reference).not.toBe(first.reference);

    const { rows } = await db.query<{ possible_duplicate_of: string | null }>(
      "select possible_duplicate_of from public.bookings where id = $1",
      [second.id],
    );
    expect(rows[0]!.possible_duplicate_of).toBe(first.id);
  });

  it.each([
    ["missing consent", { consent: false }],
    ["an event date today", { eventDate: daysFromNow(0) }],
    ["an event date in the past", { eventDate: daysFromNow(-3) }],
    ["an event date over three years away", { eventDate: daysFromNow(1200) }],
    ["zero guests", { guests: 0 }],
    ["an impossible guest count", { guests: 20_000 }],
    ["a phone contact method without a phone number", { method: "phone" as const, phone: null }],
  ])("rejects %s", async (_label, overrides) => {
    expect(await submit(inquiry(overrides))).toMatchObject({ ok: false, code: INVALID });
  });

  it.each([
    ["an invalid email", { email: "not-an-email" }, "23514"],
    [
      "an email carrying mailto parameters",
      { email: "victim@example.com?bcc=attacker%40evil.example" },
      "23514",
    ],
    ["an email with angle brackets", { email: "<victim@example.com>" }, "23514"],
    ["an overlong name", { name: "x".repeat(161) }, "23514"],
    ["overlong requirements", { requirements: "x".repeat(2001) }, "23514"],
  ])("rejects %s through table constraints", async (_label, overrides, code) => {
    expect(await submit(inquiry(overrides))).toMatchObject({ ok: false, code });
  });

  it("stores markup as inert text", async () => {
    const payload = `<script>alert("x")</script><img src=x onerror=alert(1)>`;
    const { id } = await newBooking({ name: payload, message: payload });
    const { rows } = await db.query<{ contact_name: string; message: string }>(
      "select contact_name, message from public.bookings where id = $1",
      [id],
    );
    expect(rows[0]).toEqual({ contact_name: payload, message: payload });
  });

  it("queues exactly one message of each kind when email is enabled", async () => {
    const { id } = await newBooking({ notify: true });
    const { rows } = await db.query<{ kind: string }>(
      "select kind::text from private.notification_outbox where booking_id = $1 order by kind",
      [id],
    );
    expect(rows.map((r) => r.kind)).toEqual(["customer_acknowledgement", "staff_new_inquiry"]);
  });

  it("queues nothing when email is not enabled", async () => {
    const { id } = await newBooking({ notify: false });
    const { rows } = await db.query("select 1 from private.notification_outbox where booking_id = $1", [id]);
    expect(rows).toEqual([]);
  });
});

describe("rate limiting (consume_rate_limit)", () => {
  const consume = (bucket: string, limit = 3, window = 600) =>
    asActor<{ allowed: boolean; retry_after_seconds: number }>(
      db,
      service,
      "select * from public.consume_rate_limit($1, $2, $3)",
      [bucket, limit, window],
      { persist: true },
    );

  it("allows requests up to the limit, then refuses with a retry delay", async () => {
    const bucket = `test:${randomUUID()}`;
    for (let i = 0; i < 3; i++)
      expect((await consume(bucket)).ok && (await Promise.resolve(true))).toBe(true);
    const blocked = await consume(bucket);
    expect(blocked).toMatchObject({ ok: true, rows: [{ allowed: false }] });
    if (blocked.ok) expect(blocked.rows[0]!.retry_after_seconds).toBeGreaterThan(0);
  });

  it("keeps buckets independent", async () => {
    const a = `test:${randomUUID()}`;
    const b = `test:${randomUUID()}`;
    for (let i = 0; i < 4; i++) await consume(a);
    expect(await consume(b)).toMatchObject({ ok: true, rows: [{ allowed: true }] });
  });

  it("is not callable by visitors or staff and rejects invalid parameters", async () => {
    expect(await asActor(db, anon, "select * from public.consume_rate_limit('x', 1, 60)")).toMatchObject({
      ok: false,
      code: PERMISSION_DENIED,
    });
    expect(await consume("", 1, 60)).toMatchObject({ ok: false, code: INVALID });
    expect(await consume("x", 0, 60)).toMatchObject({ ok: false, code: INVALID });
  });
});

describe("lifecycle", () => {
  it("database transitions match src/features/bookings/status.ts for every pair", async () => {
    const { rows } = await db.query<{ f: string; t: string; ok: boolean }>(`
      select f::text as f, t::text as t, private.is_allowed_booking_transition(f, t) as ok
      from unnest(enum_range(null::public.booking_status)) f
      cross join unnest(enum_range(null::public.booking_status)) t
    `);
    expect(rows.map((r) => r.f).filter((v, i, a) => a.indexOf(v) === i)).toEqual([...BOOKING_STATUSES]);
    for (const { f, t, ok } of rows) {
      expect(ok, `${f} → ${t}`).toBe(
        (BOOKING_TRANSITIONS[f as keyof typeof BOOKING_TRANSITIONS] as readonly string[]).includes(t),
      );
    }
  });

  it("records valid changes with their note and audits them without personal data", async () => {
    const { id, reference } = await newBooking();
    const change = await asActor(
      db,
      user(ids.admin),
      "select public.change_booking_status($1, 'in_review', 'Checked availability')",
      [id],
      { persist: true },
    );
    expect(change.ok).toBe(true);

    const history = await db.query<{ to_status: string; changed_by: string; note: string }>(
      "select to_status::text, changed_by, note from public.booking_status_history where booking_id = $1 order by id desc limit 1",
      [id],
    );
    expect(history.rows[0]).toEqual({
      to_status: "in_review",
      changed_by: ids.admin,
      note: "Checked availability",
    });

    const audit = await db.query<{ action: string; target_id: string; details: unknown }>(
      "select action, target_id, details from public.audit_logs where target_id = $1",
      [reference],
    );
    expect(audit.rows).toEqual([
      { action: "booking.status_changed", target_id: reference, details: { from: "new", to: "in_review" } },
    ]);
  });

  it("rejects invalid transitions", async () => {
    const { id } = await newBooking();
    for (const target of ["completed", "quoted", "new"]) {
      expect(
        await asActor(db, user(ids.admin), `select public.change_booking_status($1, '${target}')`, [id]),
        target,
      ).toMatchObject({ ok: false, code: INVALID });
    }
  });

  it("rejects direct status updates even by the database owner when the transition is invalid", async () => {
    const { id } = await newBooking();
    await expect(
      db.query("update public.bookings set status = 'completed' where id = $1", [id]),
    ).rejects.toThrow(/Invalid booking status transition/);
  });

  it.each(["editor", "analyst", "noRole", "otherManager"] as const)(
    "does not let %s change status (same error as a missing inquiry)",
    async (who) => {
      const { id } = await newBooking();
      expect(
        await asActor(db, user(ids[who]), "select public.change_booking_status($1, 'in_review')", [id]),
      ).toMatchObject({
        ok: false,
        code: NOT_FOUND,
      });
    },
  );
});

describe("assignment", () => {
  it("admins assign inquiries to eligible staff, audited", async () => {
    const { id, reference } = await newBooking();
    const result = await asActor(
      db,
      user(ids.admin),
      "select public.assign_booking($1, $2)",
      [id, ids.manager],
      {
        persist: true,
      },
    );
    expect(result.ok).toBe(true);
    const audit = await db.query<{ details: { to: string } }>(
      "select details from public.audit_logs where action = 'booking.assigned' and target_id = $1",
      [reference],
    );
    expect(audit.rows[0]!.details.to).toBe(ids.manager);
  });

  it("refuses ineligible assignees", async () => {
    const { id } = await newBooking();
    for (const assignee of [ids.editor, ids.analyst, ids.noRole]) {
      expect(
        await asActor(db, user(ids.admin), "select public.assign_booking($1, $2)", [id, assignee]),
      ).toMatchObject({
        ok: false,
        code: INVALID,
      });
    }
  });

  it("refuses staff without bookings.assign, including event managers", async () => {
    const { id } = await newBooking();
    for (const who of ["manager", "editor", "analyst", "noRole"] as const) {
      expect(
        await asActor(db, user(ids[who]), "select public.assign_booking($1, $2)", [id, ids[who]]),
        who,
      ).toMatchObject({
        ok: false,
        code: PERMISSION_DENIED,
      });
    }
  });

  it("lists assignable staff only for assigners", async () => {
    const list = await asActor<{ user_id: string }>(
      db,
      user(ids.admin),
      "select * from public.list_assignable_staff()",
    );
    expect(list.ok && list.rows.map((r) => r.user_id).sort()).toEqual(
      [ids.owner, ids.admin, ids.manager, ids.otherManager].sort(),
    );
    expect(
      await asActor(db, user(ids.manager), "select * from public.list_assignable_staff()"),
    ).toMatchObject({
      ok: false,
      code: PERMISSION_DENIED,
    });
  });
});

describe("event manager scope", () => {
  let assigned: { id: string; reference: string };
  let other: { id: string; reference: string };

  beforeAll(async () => {
    assigned = await newBooking({ name: "Assigned Customer" });
    other = await newBooking({ name: "Unassigned Customer" });
    await asActor(db, user(ids.admin), "select public.assign_booking($1, $2)", [assigned.id, ids.manager], {
      persist: true,
    });
  });

  it("lists and opens only assigned inquiries", async () => {
    const list = await asActor<{ reference: string; assigned_to: string }>(
      db,
      user(ids.manager),
      "select reference, assigned_to from public.list_bookings(p_limit := 100)",
    );
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const references = list.rows.map((r) => r.reference);
    expect(references).toContain(assigned.reference);
    expect(references).not.toContain(other.reference);
    for (const row of list.rows) expect(row.assigned_to).toBe(ids.manager);

    const mine = await asActor<{ d: unknown }>(
      db,
      user(ids.manager),
      "select public.get_booking_detail($1) as d",
      [assigned.reference],
    );
    const theirs = await asActor<{ d: unknown }>(
      db,
      user(ids.manager),
      "select public.get_booking_detail($1) as d",
      [other.reference],
    );
    expect(mine.ok && mine.rows[0]!.d).not.toBeNull();
    expect(theirs).toMatchObject({ ok: true, rows: [{ d: null }] });
  });

  it("works an assigned inquiry and writes notes on it, but not on others", async () => {
    expect(
      (
        await asActor(db, user(ids.manager), "select public.change_booking_status($1, 'contacted')", [
          assigned.id,
        ])
      ).ok,
    ).toBe(true);
    expect(
      (
        await asActor(db, user(ids.manager), "select public.add_booking_note($1, 'Called the customer')", [
          assigned.id,
        ])
      ).ok,
    ).toBe(true);
    expect(
      await asActor(db, user(ids.manager), "select public.add_booking_note($1, 'Snooping')", [other.id]),
    ).toMatchObject({ ok: false, code: NOT_FOUND });
  });
});

describe("internal notes", () => {
  let booking: { id: string; reference: string };

  beforeAll(async () => {
    booking = await newBooking();
    await asActor(
      db,
      user(ids.owner),
      "select public.add_booking_note($1, 'Private: budget discussed')",
      [booking.id],
      {
        persist: true,
      },
    );
  });

  it("are visible only to staff who can see the inquiry", async () => {
    const count = async (who: keyof typeof ids) => {
      const r = await asActor<{ c: number }>(
        db,
        user(ids[who]),
        "select count(*)::int as c from public.booking_notes where booking_id = $1",
        [booking.id],
      );
      return r.ok ? r.rows[0]!.c : -1;
    };
    expect(await count("owner")).toBe(1);
    expect(await count("admin")).toBe(1);
    for (const who of ["manager", "editor", "analyst", "noRole"] as const)
      expect(await count(who), who).toBe(0);
    expect(await asActor(db, anon, "select * from public.booking_notes")).toMatchObject({
      ok: false,
      code: PERMISSION_DENIED,
    });
  });

  it("appear in the detail with the author's name", async () => {
    const r = await asActor<{ d: { notes: { body: string; author_name: string }[] } }>(
      db,
      user(ids.admin),
      "select public.get_booking_detail($1) as d",
      [booking.reference],
    );
    expect(r.ok && r.rows[0]!.d.notes).toEqual([
      expect.objectContaining({ body: "Private: budget discussed", author_name: "owner name" }),
    ]);
  });

  it("cannot be edited, deleted or forged through the API", async () => {
    for (const sql of [
      "update public.booking_notes set body = 'changed'",
      "delete from public.booking_notes",
      `insert into public.booking_notes (booking_id, author_id, body) values ('${booking.id}', '${ids.owner}', 'forged')`,
      "update public.booking_status_history set note = 'changed'",
      "delete from public.booking_status_history",
    ]) {
      expect(await asActor(db, user(ids.owner), sql), sql).toMatchObject({
        ok: false,
        code: PERMISSION_DENIED,
      });
    }
  });

  it("reject empty or overlong notes", async () => {
    for (const body of ["   ", "x".repeat(4001)]) {
      expect(
        await asActor(db, user(ids.owner), "select public.add_booking_note($1, $2)", [booking.id, body]),
      ).toMatchObject({
        ok: false,
        code: INVALID,
      });
    }
  });
});

describe("listing and reporting", () => {
  it("matches search terms literally (LIKE wildcards are escaped)", async () => {
    await newBooking({ name: "Percent 100% Customer" });
    const literal = await asActor<{ contact_name: string }>(
      db,
      user(ids.admin),
      "select contact_name from public.list_bookings(p_search := '100%')",
    );
    const wildcard = await asActor<{ c: number }>(
      db,
      user(ids.admin),
      "select count(*)::int as c from public.list_bookings(p_search := '%')",
    );
    expect(literal.ok && literal.rows.map((r) => r.contact_name)).toEqual(["Percent 100% Customer"]);
    expect(wildcard.ok && wildcard.rows[0]!.c).toBe(1);
  });

  it("filters, paginates and reports the total", async () => {
    const page = await asActor<{ total_count: number }>(
      db,
      user(ids.admin),
      "select total_count::int from public.list_bookings(p_statuses := array['new']::public.booking_status[], p_limit := 2)",
    );
    expect(page.ok && page.rows).toHaveLength(2);
    if (page.ok) expect(page.rows[0]!.total_count).toBeGreaterThan(2);
  });

  it("returns nothing to staff without booking access", async () => {
    for (const who of ["editor", "analyst", "noRole"] as const) {
      const r = await asActor(db, user(ids[who]), "select * from public.list_bookings()");
      expect(r, who).toMatchObject({ ok: true, rows: [] });
    }
  });

  it("gives analysts aggregate counts only, and nothing to staff without reports.read", async () => {
    const report = await asActor<{ r: Record<string, unknown> }>(
      db,
      user(ids.analyst),
      "select public.booking_report() as r",
    );
    expect(report.ok).toBe(true);
    if (report.ok) {
      expect(Object.keys(report.rows[0]!.r).sort()).toEqual([
        "by_event_type",
        "by_status",
        "last_30_days",
        "total",
      ]);
      expect(JSON.stringify(report.rows[0]!.r)).not.toMatch(/@example\.test|Customer/);
    }
    for (const who of ["manager", "editor", "noRole"] as const) {
      expect(await asActor(db, user(ids[who]), "select public.booking_report()"), who).toMatchObject({
        ok: false,
        code: PERMISSION_DENIED,
      });
    }
  });

  it("does not let analysts or editors write booking data", async () => {
    const { id } = await newBooking();
    for (const who of ["analyst", "editor"] as const) {
      expect(
        await asActor(db, user(ids[who]), "update public.bookings set venue = 'x' where id = $1", [id]),
        who,
      ).toMatchObject({ ok: false, code: PERMISSION_DENIED });
      expect(
        await asActor(db, user(ids[who]), "select public.add_booking_note($1, 'x')", [id]),
        who,
      ).toMatchObject({ ok: false, code: NOT_FOUND });
    }
  });

  it("does not let any staff member insert or rewrite inquiries directly", async () => {
    const { id } = await newBooking();
    for (const who of ["owner", "admin", "manager"] as const) {
      const insert = await asActor(
        db,
        user(ids[who]),
        `insert into public.bookings (event_type, contact_name, contact_email, consent_given_at, status, assigned_to)
         values ('wedding', 'X', 'x@example.test', now(), 'completed', $1)`,
        [ids.analyst],
      );
      const update = await asActor(
        db,
        user(ids[who]),
        "update public.bookings set status = 'completed' where id = $1",
        [id],
      );
      expect(insert, who).toMatchObject({ ok: false, code: PERMISSION_DENIED });
      expect(update, who).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    }
  });
});

describe("notification outbox", () => {
  it("claims due messages once and records the outcome", async () => {
    const { reference } = await newBooking({ notify: true });
    const claim = await asActor<{
      booking_reference: string;
      kind: string;
      notification_id: string;
      contact_email: string | null;
    }>(db, service, "select * from public.claim_notifications(50)", [], { persist: true });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    const mine = claim.rows.filter((r) => r.booking_reference === reference);
    expect(mine.map((r) => r.kind).sort()).toEqual(["customer_acknowledgement", "staff_new_inquiry"]);
    // Minimum data: no names or free text; the customer address only for their own message.
    expect(Object.keys(mine[0]!)).not.toContain("contact_name");
    expect(mine.find((r) => r.kind === "staff_new_inquiry")!.contact_email).toBeNull();
    expect(mine.find((r) => r.kind === "customer_acknowledgement")!.contact_email).toMatch(/@example\.test$/);

    const again = await asActor<{ booking_reference: string }>(
      db,
      service,
      "select * from public.claim_notifications(50)",
      [],
      {
        persist: true,
      },
    );
    expect(again.ok && again.rows.some((r) => r.booking_reference === reference)).toBe(false);

    await asActor(
      db,
      service,
      "select public.complete_notification($1, true, 'msg_1', null)",
      [mine[0]!.notification_id],
      {
        persist: true,
      },
    );
    await asActor(
      db,
      service,
      "select public.complete_notification($1, false, null, 'provider timeout')",
      [mine[1]!.notification_id],
      { persist: true },
    );

    const { rows } = await db.query<{ status: string }>(
      "select status::text from private.notification_outbox where id = any($1::uuid[]) order by status",
      [[mine[0]!.notification_id, mine[1]!.notification_id]],
    );
    expect(rows.map((r) => r.status)).toEqual(["failed", "sent"]);
  });

  it("is not reachable by visitors or staff", async () => {
    for (const actor of [anon, user(ids.owner)]) {
      expect(await asActor(db, actor, "select * from public.claim_notifications(1)")).toMatchObject({
        ok: false,
        code: PERMISSION_DENIED,
      });
    }
  });
});

describe("privacy erasure", () => {
  it("removes an inquiry with its history and notes, and audits the erasure without personal data", async () => {
    const { id, reference } = await newBooking({ name: "Erasure Customer" });
    await asActor(db, user(ids.owner), "select public.change_booking_status($1, 'declined')", [id], {
      persist: true,
    });
    await asActor(db, user(ids.owner), "select public.add_booking_note($1, 'note')", [id], { persist: true });
    const before = await db.query<{ c: number }>("select count(*)::int as c from public.audit_logs");

    const erase = await asActor(db, user(ids.owner), "delete from public.bookings where id = $1", [id], {
      persist: true,
    });
    expect(erase).toMatchObject({ ok: true, affectedRows: 1 });

    for (const table of ["booking_status_history", "booking_notes"]) {
      const { rows } = await db.query<{ c: number }>(
        `select count(*)::int as c from public.${table} where booking_id = $1`,
        [id],
      );
      expect(rows[0]!.c, table).toBe(0);
    }
    const after = await db.query<{ c: number }>("select count(*)::int as c from public.audit_logs");
    expect(after.rows[0]!.c).toBe(before.rows[0]!.c + 1);

    const erased = await db.query<{ action: string; actor_id: string; details: unknown }>(
      "select action, actor_id, details from public.audit_logs where target_id = $1 and action = 'booking.erased'",
      [reference],
    );
    expect(erased.rows).toEqual([
      { action: "booking.erased", actor_id: ids.owner, details: { status: "declined", source: "website" } },
    ]);
    // Earlier audit entries for this inquiry survive and carry no personal data.
    const all = await db.query<{ details: unknown }>(
      "select details from public.audit_logs where target_id = $1",
      [reference],
    );
    expect(JSON.stringify(all.rows)).not.toMatch(/Erasure Customer|@example\.test/);
  });
});
