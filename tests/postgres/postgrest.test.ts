/*
 * Authorization over HTTP through a REAL PostgREST, as each API role and staff
 * role. Opt-in (skipped unless configured); see docs/VERIFICATION.md:
 *
 *   TEST_POSTGREST_URL         REST base: http://127.0.0.1:54321/rest/v1 for the local
 *                              Supabase stack, or a standalone PostgREST root
 *   TEST_POSTGREST_JWT_SECRET  the JWT secret PostgREST verifies (HS256)
 *   TEST_POSTGREST_DB_URL      owner (postgres) connection to the database it serves,
 *                              migrated; used for fixtures. DISPOSABLE data only.
 *   TEST_POSTGREST_APIKEY      optional apikey header (needed behind Supabase's gateway)
 *
 * Tokens carry the claims Supabase Auth issues (role, sub, aud). Fixtures are
 * created per run and removed afterwards (audit entries stay: append-only).
 */
import { createHmac, randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const env = {
  url: process.env.TEST_POSTGREST_URL?.replace(/\/$/, ""),
  secret: process.env.TEST_POSTGREST_JWT_SECRET,
  db: process.env.TEST_POSTGREST_DB_URL,
  apikey: process.env.TEST_POSTGREST_APIKEY,
};
const configured = Boolean(env.url && env.secret && env.db);

function sign(claims: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ iat: now, exp: now + 900, ...claims })}`;
  return `${unsigned}.${createHmac("sha256", env.secret!).update(unsigned).digest("base64url")}`;
}

type Response = { status: number; body: any; raw: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function http(
  method: string,
  path: string,
  token: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  const response = await fetch(`${env.url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(env.apikey ? { apikey: env.apikey } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await response.text();
  let parsed: unknown = raw;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {}
  return { status: response.status, body: parsed, raw };
}

const rpc = (fn: string, token: string, args: Record<string, unknown> = {}) =>
  http("POST", `/rpc/${fn}`, token, args);

const PRIVATE_DATA = /@example\.test|Customer |Private message|\+251/;

let owner: pg.Client;
let ANON = "";
let SERVICE = "";
const run = randomUUID().slice(0, 8);
const U: Record<string, string> = {};
const T: Record<string, string> = {};
const inquiries: { reference: string; id: string; email: string }[] = [];
const services: string[] = [];

const CONTENT_TABLES = [
  "pages",
  "page_translations",
  "page_images",
  "services",
  "service_translations",
  "menu_categories",
  "menu_category_translations",
  "menu_items",
  "menu_item_translations",
  "gallery_items",
  "gallery_item_translations",
  "journal_posts",
  "journal_post_translations",
  "media_assets",
  "media_asset_translations",
];
const representation = { Prefer: "return=representation" };

async function submit(i: number) {
  const email = `customer-${run}-${i}@example.test`;
  const r = await rpc("submit_inquiry", SERVICE, {
    p_submission_key: randomUUID(),
    p_contact_name: `Customer ${run} ${i}`,
    p_contact_email: email,
    p_contact_phone: "+251 911 000 000",
    p_preferred_contact_method: "phone",
    p_event_type: "wedding",
    p_event_date: null,
    p_guest_count: 120,
    p_venue: "Venue",
    p_service_requirements: "Dinner",
    p_message: "Private message",
    p_preferred_locale: "en",
    p_consent: true,
    p_notify: false,
  });
  expect(r.status, r.raw).toBe(200);
  const reference = r.body[0].inquiry_reference;
  const { rows } = await owner.query("select id from public.bookings where reference = $1", [reference]);
  inquiries.push({ reference, id: rows[0].id, email });
}

/** Arguments that resolve each function, so the privilege check (not routing) answers. */
const args = (): Record<string, Record<string, unknown>> => ({
  submit_inquiry: {
    p_submission_key: randomUUID(),
    p_contact_name: "Anon",
    p_contact_email: "anon@example.test",
    p_contact_phone: null,
    p_preferred_contact_method: "email",
    p_event_type: "wedding",
    p_event_date: null,
    p_guest_count: 10,
    p_venue: null,
    p_service_requirements: "Dinner",
    p_message: null,
    p_preferred_locale: "en",
    p_consent: true,
  },
  consume_rate_limit: { p_bucket: "x", p_limit: 1, p_window_seconds: 60 },
  complete_notification: { p_notification_id: randomUUID(), p_succeeded: true },
  get_booking_detail: { p_reference: inquiries[0]!.reference },
  change_booking_status: { p_booking_id: inquiries[0]!.id, p_to_status: "in_review" },
  assign_booking: { p_booking_id: inquiries[0]!.id, p_assignee: null },
  add_booking_note: { p_booking_id: inquiries[0]!.id, p_body: "x" },
  assign_role: { target_user_id: U.norole, new_role: "owner" },
  revoke_role: { target_user_id: U.owner, old_role: "owner" },
});

describe.skipIf(!configured)("PostgREST authorization (real HTTP API)", () => {
  beforeAll(async () => {
    const dbUrl = new URL(env.db!);
    if (
      !["localhost", "127.0.0.1", "[::1]"].includes(dbUrl.hostname) &&
      process.env.TEST_POSTGRES_ALLOW_REMOTE !== "true"
    )
      throw new Error(
        "TEST_POSTGREST_DB_URL is not local; set TEST_POSTGRES_ALLOW_REMOTE=true for a disposable remote database",
      );
    ANON = sign({ role: "anon" });
    SERVICE = sign({ role: "service_role" });
    owner = new pg.Client({ connectionString: env.db });
    await owner.connect();
    for (const name of ["owner", "admin", "manager1", "manager2", "editor", "analyst", "norole"]) {
      const { rows } = await owner.query(
        "insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), $1, $2) returning id",
        [`${name}-${run}@example.test`, JSON.stringify({ display_name: `${name} ${run}` })],
      );
      U[name] = rows[0].id;
      T[name] = sign({ role: "authenticated", sub: rows[0].id, aud: "authenticated" });
    }
    const roles: [string, string][] = [
      ["owner", "owner"],
      ["admin", "admin"],
      ["manager1", "event_manager"],
      ["manager2", "event_manager"],
      ["editor", "content_editor"],
      ["analyst", "analyst"],
    ];
    for (const [name, role] of roles)
      await owner.query("insert into public.user_roles (user_id, role) values ($1, $2)", [U[name], role]);
    for (let i = 0; i < 3; i++) await submit(i);
    // [0] → manager1 and [1] → manager2 through the API; [2] stays unassigned.
    expect(
      (await rpc("assign_booking", T.admin!, { p_booking_id: inquiries[0]!.id, p_assignee: U.manager1 }))
        .status,
    ).toBe(204);
    expect(
      (await rpc("assign_booking", T.admin!, { p_booking_id: inquiries[1]!.id, p_assignee: U.manager2 }))
        .status,
    ).toBe(204);
  });

  afterAll(async () => {
    if (!owner) return;
    await owner.query("delete from public.services where id = any($1::uuid[])", [services]);
    await owner.query("delete from public.bookings where id = any($1::uuid[])", [inquiries.map((i) => i.id)]);
    await owner.query("delete from auth.users where id = any($1::uuid[])", [Object.values(U)]);
    await owner.end();
  });

  describe("anonymous visitor", () => {
    it.each([
      "/bookings?select=id",
      "/booking_notes?select=id",
      "/booking_status_history?select=id",
      "/profiles?select=id",
      "/user_roles?select=user_id",
      "/role_permissions?select=role",
      "/audit_logs?select=id",
    ])("GET %s is denied", async (path) => {
      const r = await http("GET", path, ANON);
      expect([r.status, r.body.code]).toEqual([401, "42501"]);
    });

    it("cannot insert, update or delete inquiries", async () => {
      const id = inquiries[0]!.id;
      const insert = await http("POST", "/bookings", ANON, {
        event_type: "wedding",
        contact_name: "x",
        contact_email: "x@example.test",
        consent_given_at: new Date().toISOString(),
      });
      const update = await http("PATCH", `/bookings?id=eq.${id}`, ANON, { status: "confirmed" });
      const remove = await http("DELETE", `/bookings?id=eq.${id}`, ANON);
      for (const r of [insert, update, remove]) expect([r.status, r.body.code]).toEqual([401, "42501"]);
    });

    it.each([
      "submit_inquiry",
      "consume_rate_limit",
      "claim_notifications",
      "complete_notification",
      "list_bookings",
      "get_booking_detail",
      "booking_inbox_counts",
      "booking_report",
      "change_booking_status",
      "assign_booking",
      "add_booking_note",
      "list_assignable_staff",
      "assign_role",
      "revoke_role",
      "get_my_access",
    ])("cannot call rpc/%s", async (fn) => {
      const r = await rpc(fn, ANON, args()[fn] ?? {});
      expect([r.status, r.body.code], r.raw).toEqual([401, "42501"]);
    });

    it("cannot reach the private schema", async () => {
      expect(
        (await http("GET", "/rate_limits", ANON, undefined, { "Accept-Profile": "private" })).body.code,
      ).toBe("PGRST106");
      expect((await http("GET", "/notification_outbox", ANON)).status).toBe(404);
      expect((await rpc("has_permission", ANON, { requested: "admin.access" })).status).toBe(404);
    });

    it("reads only published services, through named public columns", async () => {
      expect((await http("GET", "/services?select=*", ANON)).body.code).toBe("42501");
      expect((await http("GET", "/services?select=id,updated_by", ANON)).body.code).toBe("42501");
      const services = await http("GET", "/services?select=slug,status", ANON);
      expect(services.status).toBe(200);
      expect(services.body.every((s: { status: string }) => s.status === "published")).toBe(true);
      const translations = await http("GET", "/service_translations?select=locale,status", ANON);
      expect(translations.body.every((t: { status: string }) => t.status === "published")).toBe(true);
    });

    it("the API description, if served to visitors, lists no private tables or privileged functions", async () => {
      const r = await http("GET", "/", ANON);
      if (r.status !== 200) return; // some gateways do not serve it to anon at all
      const paths = Object.keys(r.body.paths ?? {});
      for (const hidden of [
        "/bookings",
        "/booking_notes",
        "/audit_logs",
        "/user_roles",
        "/rpc/submit_inquiry",
        "/rpc/list_bookings",
        "/rpc/assign_role",
      ])
        expect(paths).not.toContain(hidden);
    });

    it("error bodies carry only code, details, hint and message", async () => {
      const r = await rpc("submit_inquiry", ANON, args().submit_inquiry);
      expect(Object.keys(r.body).sort()).toEqual(["code", "details", "hint", "message"]);
      expect(r.raw).not.toMatch(/stack|SQLSTATE|line \d+/i);
    });
  });

  describe("server secret key (service_role)", () => {
    it("can submit inquiries but cannot read, change or work them", async () => {
      for (const path of [
        "/bookings?select=id",
        "/booking_notes?select=id",
        "/booking_status_history?select=id",
      ])
        expect((await http("GET", path, SERVICE)).body.code).toBe("42501");
      const patch = await http("PATCH", `/bookings?id=eq.${inquiries[0]!.id}`, SERVICE, {
        status: "confirmed",
      });
      expect([patch.status, patch.body.code]).toEqual([403, "42501"]);
      for (const fn of [
        "list_bookings",
        "get_booking_detail",
        "booking_inbox_counts",
        "booking_report",
        "change_booking_status",
        "assign_booking",
        "add_booking_note",
        "list_assignable_staff",
        "assign_role",
        "revoke_role",
        "get_my_access",
      ]) {
        const r = await rpc(fn, SERVICE, args()[fn] ?? {});
        expect([r.status, r.body.code], fn).toEqual([403, "42501"]);
      }
    });
  });

  describe("authenticated account with no role", () => {
    it("sees and changes nothing", async () => {
      expect((await rpc("get_my_access", T.norole!)).body).toEqual([{ roles: [], permissions: [] }]);
      expect((await rpc("list_bookings", T.norole!)).body).toEqual([]);
      expect((await http("GET", "/bookings?select=id", T.norole!)).body).toEqual([]);
      expect((await rpc("booking_report", T.norole!)).status).toBe(403);
      const change = await rpc("change_booking_status", T.norole!, {
        p_booking_id: inquiries[2]!.id,
        p_to_status: "in_review",
      });
      expect(change.body.code).toBe("P0002");
    });
  });

  describe("content editor", () => {
    it("cannot read the inbox or any inquiry data", async () => {
      expect((await rpc("list_bookings", T.editor!)).body).toEqual([]);
      expect((await rpc("booking_inbox_counts", T.editor!)).body).toEqual([]);
      expect((await http("GET", "/bookings?select=contact_email", T.editor!)).body).toEqual([]);
      expect((await http("GET", "/booking_notes?select=body", T.editor!)).body).toEqual([]);
      const detail = await http(
        "GET",
        `/rpc/get_booking_detail?p_reference=${inquiries[0]!.reference}`,
        T.editor!,
      );
      expect([detail.status, detail.body]).toEqual([200, null]);
      expect((await rpc("booking_report", T.editor!)).status).toBe(403);
    });

    it("cannot modify inquiry data through functions or tables", async () => {
      const id = inquiries[2]!.id;
      expect(
        (await rpc("change_booking_status", T.editor!, { p_booking_id: id, p_to_status: "in_review" })).body
          .code,
      ).toBe("P0002");
      expect((await rpc("add_booking_note", T.editor!, { p_booking_id: id, p_body: "x" })).body.code).toBe(
        "P0002",
      );
      expect(
        (await rpc("assign_booking", T.editor!, { p_booking_id: id, p_assignee: U.editor })).status,
      ).toBe(403);
      expect(
        (await http("PATCH", `/bookings?id=eq.${id}`, T.editor!, { status: "confirmed" })).body.code,
      ).toBe("42501");
      const remove = await http("DELETE", `/bookings?id=eq.${id}`, T.editor!, undefined, {
        Prefer: "return=representation",
      });
      expect([remove.status, remove.body]).toEqual([200, []]);
    });
  });

  describe("analyst", () => {
    it("gets aggregate reporting only", async () => {
      const report = await rpc("booking_report", T.analyst!);
      expect(report.status).toBe(200);
      expect(Object.keys(report.body).sort()).toEqual([
        "by_event_type",
        "by_status",
        "last_30_days",
        "total",
      ]);
      expect(report.raw).not.toMatch(PRIVATE_DATA);
      expect((await http("GET", "/rpc/booking_report", T.analyst!)).status).toBe(200); // STABLE: read-only over GET
      expect((await rpc("list_bookings", T.analyst!)).body).toEqual([]);
      expect((await http("GET", "/bookings?select=contact_email", T.analyst!)).body).toEqual([]);
      expect(
        (await http("GET", `/rpc/get_booking_detail?p_reference=${inquiries[0]!.reference}`, T.analyst!))
          .body,
      ).toBeNull();
    });
  });

  describe("event manager", () => {
    it("lists and reads only inquiries assigned to them", async () => {
      const list = await rpc("list_bookings", T.manager1!, { p_limit: 100 });
      expect(list.body.map((r: { reference: string }) => r.reference)).toEqual([inquiries[0]!.reference]);
      expect((await rpc("booking_inbox_counts", T.manager1!)).body).toEqual([{ status: "new", total: 1 }]);
      const own = await http(
        "GET",
        `/rpc/get_booking_detail?p_reference=${inquiries[0]!.reference}`,
        T.manager1!,
      );
      expect(own.body.booking.contact_email).toBe(inquiries[0]!.email);
      expect(own.body.booking).not.toHaveProperty("submission_key");
    });

    it("cannot read other inquiries through any alternate route", async () => {
      for (const other of [inquiries[1]!, inquiries[2]!]) {
        expect(
          (await http("GET", `/rpc/get_booking_detail?p_reference=${other.reference}`, T.manager1!)).body,
        ).toBeNull();
        expect(
          (await http("GET", `/bookings?select=contact_email,contact_phone&id=eq.${other.id}`, T.manager1!))
            .body,
        ).toEqual([]);
        expect(
          (await http("GET", `/booking_status_history?select=note&booking_id=eq.${other.id}`, T.manager1!))
            .body,
        ).toEqual([]);
        expect(
          (await http("GET", `/booking_notes?select=body&booking_id=eq.${other.id}`, T.manager1!)).body,
        ).toEqual([]);
        expect((await rpc("list_bookings", T.manager1!, { p_search: other.email })).body).toEqual([]);
      }
      expect((await rpc("list_bookings", T.manager1!, { p_assignee: U.manager2 })).body).toEqual([]);
      expect((await http("GET", "/profiles?select=id", T.manager1!)).body).toEqual([{ id: U.manager1 }]);
    });

    it("works assigned inquiries through audited functions; history and audit are written", async () => {
      const { id, reference } = inquiries[0]!;
      const change = await rpc("change_booking_status", T.manager1!, {
        p_booking_id: id,
        p_to_status: "in_review",
        p_note: "Called back",
      });
      expect([change.status, change.body]).toEqual([200, "in_review"]);
      expect(
        (await rpc("add_booking_note", T.manager1!, { p_booking_id: id, p_body: "Internal note" })).status,
      ).toBe(200);
      const invalid = await rpc("change_booking_status", T.manager1!, {
        p_booking_id: id,
        p_to_status: "completed",
      });
      expect([invalid.status, invalid.body.code]).toEqual([400, "22023"]);

      const history = await owner.query(
        "select from_status, to_status, changed_by, note from public.booking_status_history where booking_id = $1 order by id",
        [id],
      );
      expect(history.rows).toEqual([
        { from_status: null, to_status: "new", changed_by: null, note: null },
        { from_status: "new", to_status: "in_review", changed_by: U.manager1, note: "Called back" },
      ]);
      const audit = await owner.query(
        "select actor_id, action, details from public.audit_logs where target_id = $1 order by id",
        [reference],
      );
      expect(audit.rows.map((a) => a.action)).toEqual(["booking.assigned", "booking.status_changed"]);
      expect(audit.rows[1]).toMatchObject({
        actor_id: U.manager1,
        details: { from: "new", to: "in_review" },
      });
      expect(JSON.stringify(audit.rows)).not.toMatch(PRIVATE_DATA);
    });

    it("is refused for unassigned inquiries, assignment and reporting; missing looks like forbidden", async () => {
      const forbidden = await rpc("change_booking_status", T.manager1!, {
        p_booking_id: inquiries[2]!.id,
        p_to_status: "in_review",
      });
      // PostgREST answers P0002 with HTTP 500; the app reads the code, not the status.
      expect([forbidden.status, forbidden.body.code, forbidden.body.message]).toEqual([
        500,
        "P0002",
        "Inquiry not found",
      ]);
      const missing = await rpc("change_booking_status", T.manager1!, {
        p_booking_id: randomUUID(),
        p_to_status: "in_review",
      });
      expect([missing.status, missing.body]).toEqual([forbidden.status, forbidden.body]);
      expect(
        (await rpc("add_booking_note", T.manager1!, { p_booking_id: inquiries[2]!.id, p_body: "x" })).body
          .code,
      ).toBe("P0002");
      expect(
        (await rpc("assign_booking", T.manager1!, { p_booking_id: inquiries[2]!.id, p_assignee: U.manager1 }))
          .status,
      ).toBe(403);
      expect((await rpc("booking_report", T.manager1!)).status).toBe(403);
    });

    it("cannot bypass the functions with direct table writes", async () => {
      const id = inquiries[0]!.id;
      for (const body of [
        { status: "confirmed" },
        { assigned_to: U.manager1 },
        { contact_email: "evil@example.test" },
      ])
        expect((await http("PATCH", `/bookings?id=eq.${id}`, T.manager1!, body)).body.code).toBe("42501");
      for (const [path, body] of [
        ["/booking_notes", { booking_id: id, author_id: U.owner, body: "forged" }],
        ["/booking_status_history", { booking_id: id, to_status: "confirmed" }],
        ["/audit_logs", { action: "forged.entry" }],
      ] as const)
        expect((await http("POST", path, T.manager1!, body)).body.code, path).toBe("42501");
      expect(
        (await http("DELETE", `/booking_status_history?booking_id=eq.${id}`, T.manager1!)).body.code,
      ).toBe("42501");
    });
  });

  describe("admin", () => {
    it("assigns only to staff who can work inquiries", async () => {
      const r = await rpc("assign_booking", T.admin!, {
        p_booking_id: inquiries[2]!.id,
        p_assignee: U.editor,
      });
      expect([r.status, r.body.code]).toEqual([400, "22023"]);
      const staff = (await rpc("list_assignable_staff", T.admin!)).body.map(
        (s: { user_id: string }) => s.user_id,
      );
      expect(staff).toEqual(expect.arrayContaining([U.manager1, U.manager2, U.admin, U.owner]));
      expect(staff).not.toContain(U.editor);
    });

    it("cannot erase inquiries (owner-only privacy erasure)", async () => {
      const r = await http("DELETE", `/bookings?id=eq.${inquiries[2]!.id}`, T.admin!, undefined, {
        Prefer: "return=representation",
      });
      expect([r.status, r.body]).toEqual([200, []]);
      expect(
        (await owner.query("select 1 from public.bookings where id = $1", [inquiries[2]!.id])).rows,
      ).toHaveLength(1);
    });

    it("manages non-privileged roles only, never owner/admin and never their own", async () => {
      expect(
        (await rpc("assign_role", T.admin!, { target_user_id: U.norole, new_role: "analyst" })).status,
      ).toBe(204);
      expect(
        (await rpc("revoke_role", T.admin!, { target_user_id: U.norole, old_role: "analyst" })).status,
      ).toBe(204);
      const privileged = await rpc("assign_role", T.admin!, { target_user_id: U.norole, new_role: "admin" });
      expect([privileged.status, privileged.body.message]).toEqual([
        403,
        "Not authorized to manage privileged roles",
      ]);
      expect(
        (await rpc("revoke_role", T.admin!, { target_user_id: U.owner, old_role: "owner" })).status,
      ).toBe(403);
      const self = await rpc("assign_role", T.admin!, { target_user_id: U.admin, new_role: "owner" });
      expect([self.status, self.body.message]).toEqual([403, "You cannot change your own roles"]);
    });
  });

  describe("self-elevation", () => {
    it.each(["admin", "manager1", "editor", "analyst", "norole"])(
      "%s cannot raise their own privileges",
      async (who) => {
        expect(
          (await rpc("assign_role", T[who]!, { target_user_id: U[who], new_role: "owner" })).status,
        ).toBe(403);
        expect(
          (await http("POST", "/user_roles", T[who]!, { user_id: U[who], role: "owner" })).body.code,
        ).toBe("42501");
        expect(
          (
            await http("POST", "/role_permissions", T[who]!, {
              role: "analyst",
              permission: "bookings.read_all",
            })
          ).body.code,
        ).toBe("42501");
        expect((await http("PATCH", `/profiles?id=eq.${U[who]}`, T[who]!, { id: U.owner })).body.code).toBe(
          "42501",
        );
        const rename = await http(
          "PATCH",
          `/profiles?id=eq.${U[who]}`,
          T[who]!,
          { display_name: `renamed ${who}` },
          { Prefer: "return=representation" },
        );
        expect(rename.status).toBe(200);
      },
    );
  });

  describe("owner", () => {
    it("erases an inquiry; the audit entry keeps the reference and no personal data", async () => {
      const { id, reference } = inquiries[2]!;
      expect(
        (await http("DELETE", `/bookings?id=eq.${id}`, T.owner!, undefined, { Prefer: "return=minimal" }))
          .status,
      ).toBe(204);
      expect((await owner.query("select 1 from public.bookings where id = $1", [id])).rows).toHaveLength(0);
      const audit = await http(
        "GET",
        `/audit_logs?select=actor_id,action,target_id,details&target_id=eq.${reference}`,
        T.owner!,
      );
      expect(audit.body).toEqual([
        {
          actor_id: U.owner,
          action: "booking.erased",
          target_id: reference,
          details: { status: "new", source: "website" },
        },
      ]);
    });

    it("cannot change or delete audit entries over the API", async () => {
      expect(
        (await http("PATCH", "/audit_logs?id=gt.0", T.owner!, { action: "tampered.entry" })).body.code,
      ).toBe("42501");
      expect((await http("DELETE", "/audit_logs?id=gt.0", T.owner!)).body.code).toBe("42501");
    });
  });

  describe("content (Stage 3)", () => {
    it.each(CONTENT_TABLES)("visitors cannot read whole rows of %s", async (table) => {
      const r = await http("GET", `/${table}?select=*`, ANON);
      expect([r.status, r.body.code]).toEqual([401, "42501"]);
    });

    it.each(CONTENT_TABLES)("the server secret key has no access to %s", async (table) => {
      const r = await http("GET", `/${table}?select=*`, SERVICE);
      expect([r.status, r.body.code]).toEqual([403, "42501"]);
    });

    it("visitors call only the public read functions, and never write", async () => {
      for (const [fn, fnArgs] of [
        ["public_services", {}],
        ["public_menu", {}],
        ["public_gallery", {}],
        ["public_navigation", {}],
        ["public_page", { p_key: "home" }],
        ["public_journal", { p_locale: "en", p_limit: 5, p_offset: 0 }],
      ] as const)
        expect((await rpc(fn, ANON, fnArgs)).status, fn).toBe(200);
      for (const [fn, fnArgs] of [
        ["cms_list", { p_type: "service" }],
        ["cms_get", { p_type: "page", p_id: "home" }],
        ["media_list", {}],
        ["media_cleanup_candidates", {}],
      ] as const) {
        const r = await rpc(fn, ANON, fnArgs);
        expect([r.status, r.body.code], fn).toEqual([401, "42501"]);
      }
      // Private helpers are not part of the Data API at all.
      expect((await rpc("media_object_is_public", ANON, { p_name: "x" })).status).toBe(404);
      for (const r of [
        await http("POST", "/services", ANON, { slug: `anon-${run}` }),
        await http("PATCH", "/pages?key=eq.home", ANON, { status: "published" }),
        await http("POST", "/media_assets", ANON, { title: "x", pending_path: "x" }),
      ])
        expect([r.status, r.body.code]).toEqual([401, "42501"]);
    });

    it("an editor drafts and publishes with versioned writes; visitors see only the published result", async () => {
      const slug = `http-${run}`;
      const created = await http(
        "POST",
        "/services?select=id,version",
        T.editor!,
        { slug },
        {
          ...representation,
          Accept: "application/vnd.pgrst.object+json",
        },
      );
      expect(created.status, created.raw).toBe(201);
      const id = created.body.id as string;
      services.push(id);
      const english = await http("POST", "/service_translations", T.editor!, {
        service_id: id,
        locale: "en",
        title: `HTTP ${run}`,
      });
      expect(english.status, english.raw).toBe(201);

      expect((await http("GET", `/services?select=id&slug=eq.${slug}`, ANON)).body).toEqual([]);
      expect((await rpc("public_service", ANON, { p_slug: slug })).body).toBeNull();

      const publishText = await http(
        "PATCH",
        `/service_translations?service_id=eq.${id}&locale=eq.en&version=eq.1&select=version`,
        T.editor!,
        { status: "published" },
        representation,
      );
      expect(publishText.body).toEqual([{ version: 2 }]);
      const publish = await http(
        "PATCH",
        `/services?id=eq.${id}&version=eq.${created.body.version}&select=version`,
        T.editor!,
        { status: "published" },
        representation,
      );
      expect(publish.body).toEqual([{ version: created.body.version + 1 }]);
      const stale = await http(
        "PATCH",
        `/services?id=eq.${id}&version=eq.${created.body.version}&select=version`,
        T.editor!,
        { sort_order: 5 },
        representation,
      );
      expect(stale.body).toEqual([]);

      expect((await http("GET", `/services?select=id,slug&slug=eq.${slug}`, ANON)).body).toEqual([
        { id, slug },
      ]);
      expect((await rpc("public_service", ANON, { p_slug: slug })).body).toMatchObject({ slug });

      const amharic = await http("POST", "/service_translations", T.editor!, {
        service_id: id,
        locale: "am",
        title: "ሙከራ",
        status: "published",
      });
      expect([amharic.status, amharic.body.code, amharic.body.hint]).toEqual([
        400,
        "P0001",
        "review_required",
      ]);
    });

    it("event managers and analysts see no drafts and cannot write content", async () => {
      const draft = await http(
        "POST",
        "/services?select=id",
        T.editor!,
        { slug: `draft-${run}` },
        {
          ...representation,
          Accept: "application/vnd.pgrst.object+json",
        },
      );
      expect(draft.status, draft.raw).toBe(201);
      services.push(draft.body.id);
      for (const token of [T.manager1!, T.analyst!]) {
        // Like visitors: signed-in accounts share the public read policy, so published entries only.
        const list = await rpc("cms_list", token, { p_type: "service", p_limit: 100 });
        expect(list.status, list.raw).toBe(200);
        expect(list.body.map((row: { id: string }) => row.id)).not.toContain(draft.body.id);
        expect(list.body.every((row: { status: string }) => row.status === "published")).toBe(true);
        expect((await rpc("cms_get", token, { p_type: "service", p_id: draft.body.id })).body).toBeNull();
        const write = await http("POST", "/services", token, { slug: `staff-${run}` });
        expect([write.status, write.body.code]).toEqual([403, "42501"]);
        const media = await http("POST", "/media_assets", token, { title: "x", pending_path: "x" });
        expect([media.status, media.body.code]).toEqual([403, "42501"]);
      }
    });
  });
});
