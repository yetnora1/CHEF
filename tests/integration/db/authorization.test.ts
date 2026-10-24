import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ROLE_PERMISSIONS } from "@/lib/permissions/matrix";
import { anon, asActor, createAuthUser, createTestDatabase, grantRoleAsOwner, user } from "./harness";

const PERMISSION_DENIED = "42501";

let db: PGlite;
const ids = {} as Record<
  "owner" | "admin" | "editor" | "eventManager" | "otherEventManager" | "analyst" | "noRole",
  string
>;
let assignedBookingId: string;
let unassignedBookingId: string;

beforeAll(async () => {
  db = await createTestDatabase();

  ids.owner = await createAuthUser(db, "owner@example.test");
  ids.admin = await createAuthUser(db, "admin@example.test");
  ids.editor = await createAuthUser(db, "editor@example.test");
  ids.eventManager = await createAuthUser(db, "events@example.test");
  ids.otherEventManager = await createAuthUser(db, "events2@example.test");
  ids.analyst = await createAuthUser(db, "analyst@example.test");
  ids.noRole = await createAuthUser(db, "visitor@example.test");

  await grantRoleAsOwner(db, ids.owner, "owner");
  await grantRoleAsOwner(db, ids.admin, "admin");
  await grantRoleAsOwner(db, ids.editor, "content_editor");
  await grantRoleAsOwner(db, ids.eventManager, "event_manager");
  await grantRoleAsOwner(db, ids.otherEventManager, "event_manager");
  await grantRoleAsOwner(db, ids.analyst, "analyst");

  // Synthetic inquiries; no real customer data.
  const bookings = await db.query<{ id: string }>(
    `insert into public.bookings (event_type, contact_name, contact_email, consent_given_at, assigned_to)
     values ('wedding', 'Test Customer A', 'a@example.test', now(), $1),
            ('corporate', 'Test Customer B', 'b@example.test', now(), null)
     returning id`,
    [ids.eventManager],
  );
  assignedBookingId = bookings.rows[0]!.id;
  unassignedBookingId = bookings.rows[1]!.id;
});

afterAll(async () => {
  await db?.close();
});

describe("anonymous visitor", () => {
  it.each(["bookings", "profiles", "user_roles", "role_permissions", "audit_logs"])(
    "is denied any read of %s",
    async (table) => {
      const result = await asActor(db, anon, `select * from public.${table}`);
      expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    },
  );

  it("cannot submit a booking directly through the API", async () => {
    const result = await asActor(
      db,
      anon,
      `insert into public.bookings (event_type, contact_name, contact_email, consent_given_at)
       values ('wedding', 'X', 'x@example.test', now())`,
    );
    expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("cannot call access or role-management functions", async () => {
    for (const sql of [
      "select * from public.get_my_access()",
      `select public.assign_role('${ids.noRole}', 'owner')`,
      `select private.bootstrap_first_owner('visitor@example.test')`,
      `select private.has_permission('admin.access')`,
    ]) {
      expect(await asActor(db, anon, sql)).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    }
  });

  it("sees only published services", async () => {
    const result = await asActor<{ slug: string }>(
      db,
      anon,
      "select slug from public.services order by sort_order",
    );
    expect(result).toMatchObject({
      ok: true,
      rows: [{ slug: "weddings" }, { slug: "corporate-events" }, { slug: "summits-and-conferences" }],
    });
  });

  it("sees only published translations of published services", async () => {
    const result = await asActor<{ locale: string }>(
      db,
      anon,
      "select distinct locale from public.service_translations",
    );
    // Amharic seed rows are drafts pending review; the draft service's English row is hidden too.
    expect(result).toMatchObject({ ok: true, rows: [{ locale: "en" }] });
  });

  it("cannot create content", async () => {
    const result = await asActor(db, anon, "insert into public.services (slug) values ('nope')");
    expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("cannot read audit columns that would expose staff accounts", async () => {
    for (const sql of [
      "select updated_by from public.services",
      "select updated_by from public.service_translations",
      "select * from public.services",
    ]) {
      expect(await asActor(db, anon, sql), sql).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    }
  });
});

describe("signed-in user without a staff role", () => {
  const actor = () => user(ids.noRole);

  it("has no roles or permissions", async () => {
    // Cast: PGlite returns enum arrays as raw literals; PostgREST returns JSON arrays.
    const result = await asActor(
      db,
      actor(),
      "select roles::text[], permissions::text[] from public.get_my_access()",
    );
    expect(result).toMatchObject({ ok: true, rows: [{ roles: [], permissions: [] }] });
  });

  it("cannot read any booking, even by id", async () => {
    const all = await asActor(db, actor(), "select id from public.bookings");
    const byId = await asActor(db, actor(), "select id from public.bookings where id = $1", [
      assignedBookingId,
    ]);
    expect(all).toMatchObject({ ok: true, rows: [] });
    expect(byId).toMatchObject({ ok: true, rows: [] });
  });

  it("cannot grant itself a role by writing to user_roles", async () => {
    const insert = await asActor(
      db,
      actor(),
      "insert into public.user_roles (user_id, role) values ($1, 'owner')",
      [ids.noRole],
    );
    const update = await asActor(
      db,
      actor(),
      "update public.user_roles set user_id = $1 where role = 'owner'",
      [ids.noRole],
    );
    expect(insert).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    expect(update).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("cannot grant itself or anyone else a role through assign_role", async () => {
    const self = await asActor(db, actor(), "select public.assign_role($1, 'owner')", [ids.noRole]);
    const other = await asActor(db, actor(), "select public.assign_role($1, 'analyst')", [
      ids.otherEventManager,
    ]);
    expect(self).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    expect(self.ok === false && self.message).toContain("own roles");
    expect(other).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("reads only its own profile", async () => {
    const result = await asActor<{ id: string }>(db, actor(), "select id from public.profiles");
    expect(result).toMatchObject({ ok: true, rows: [{ id: ids.noRole }] });
  });

  it("can update its own display name but not another user's profile", async () => {
    const own = await asActor(
      db,
      actor(),
      "update public.profiles set display_name = 'Visitor' where id = $1",
      [ids.noRole],
    );
    const other = await asActor(
      db,
      actor(),
      "update public.profiles set display_name = 'Hijacked' where id = $1",
      [ids.owner],
    );
    expect(own).toMatchObject({ ok: true, affectedRows: 1 });
    expect(other).toMatchObject({ ok: true, affectedRows: 0 });
  });

  it("cannot rewrite protected profile columns or insert profiles", async () => {
    const idChange = await asActor(db, actor(), "update public.profiles set id = $1 where id = $2", [
      ids.owner,
      ids.noRole,
    ]);
    const insert = await asActor(db, actor(), "insert into public.profiles (id) values (gen_random_uuid())");
    expect(idChange).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    expect(insert).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("cannot read or forge audit log entries", async () => {
    const read = await asActor(db, actor(), "select * from public.audit_logs");
    const write = await asActor(
      db,
      actor(),
      "insert into public.audit_logs (action) values ('role.assigned')",
    );
    expect(read).toMatchObject({ ok: true, rows: [] });
    expect(write).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("cannot see drafts or create content", async () => {
    const drafts = await asActor(db, actor(), "select slug from public.services where status = 'draft'");
    const insert = await asActor(db, actor(), "insert into public.services (slug) values ('sneaky')");
    expect(drafts).toMatchObject({ ok: true, rows: [] });
    expect(insert).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });
});

describe("content editor", () => {
  const actor = () => user(ids.editor);

  it("reports exactly the content editor permissions", async () => {
    const result = await asActor<{ permissions: string[] }>(
      db,
      actor(),
      "select permissions::text[] from public.get_my_access()",
    );
    expect(result.ok && [...result.rows[0]!.permissions].sort()).toEqual(
      [...ROLE_PERMISSIONS.content_editor].sort(),
    );
  });

  it("can create, read and publish services, stamped with its own id", async () => {
    const result = await asActor<{ status: string; updated_by: string; published_at: string | null }>(
      db,
      actor(),
      `with created as (
         insert into public.services (slug, status) values ('tasting-menu', 'published')
         returning status, updated_by, published_at
       ) select * from created`,
    );
    expect(result).toMatchObject({ ok: true, rows: [{ status: "published", updated_by: ids.editor }] });
    expect(result.ok && result.rows[0]!.published_at).not.toBeNull();

    const drafts = await asActor(db, actor(), "select slug from public.services where status = 'draft'");
    expect(drafts).toMatchObject({ ok: true, rows: [{ slug: "culinary-experiences" }] });
  });

  it("must unpublish a translation before deleting it", async () => {
    const live = await asActor(
      db,
      actor(),
      `delete from public.service_translations t using public.services s
       where s.id = t.service_id and s.slug = 'weddings' and t.locale = 'en'`,
    );
    const draft = await asActor(
      db,
      actor(),
      `delete from public.service_translations t using public.services s
       where s.id = t.service_id and s.slug = 'weddings' and t.locale = 'am'`,
    );
    expect(live).toMatchObject({ ok: true, affectedRows: 0 });
    expect(draft).toMatchObject({ ok: true, affectedRows: 1 });
  });

  it("cannot forge the updated_by audit column", async () => {
    const result = await asActor(
      db,
      actor(),
      "update public.services set updated_by = $1 where slug = 'weddings'",
      [ids.owner],
    );
    expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("cannot read bookings or manage roles", async () => {
    const bookings = await asActor(db, actor(), "select id from public.bookings");
    const assign = await asActor(db, actor(), "select public.assign_role($1, 'analyst')", [ids.noRole]);
    expect(bookings).toMatchObject({ ok: true, rows: [] });
    expect(assign).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });
});

describe("event manager", () => {
  const actor = () => user(ids.eventManager);

  it("sees only inquiries assigned to them", async () => {
    const result = await asActor<{ id: string }>(db, actor(), "select id from public.bookings");
    expect(result).toMatchObject({ ok: true, rows: [{ id: assignedBookingId }] });
  });

  it("cannot read an unassigned inquiry through a manipulated id", async () => {
    const result = await asActor(db, actor(), "select * from public.bookings where id = $1", [
      unassignedBookingId,
    ]);
    expect(result).toMatchObject({ ok: true, rows: [] });
  });

  it("cannot read a colleague's assigned inquiry", async () => {
    const result = await asActor(db, user(ids.otherEventManager), "select id from public.bookings");
    expect(result).toMatchObject({ ok: true, rows: [] });
  });

  it("can change the status of an assigned inquiry through the audited function only", async () => {
    const direct = await asActor(
      db,
      actor(),
      "update public.bookings set status = 'in_review' where id = $1",
      [assignedBookingId],
    );
    const viaFunction = await asActor(db, actor(), "select public.change_booking_status($1, 'in_review')", [
      assignedBookingId,
    ]);
    expect(direct).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    expect(viaFunction.ok).toBe(true);
  });

  it("cannot change an unassigned inquiry", async () => {
    const result = await asActor(db, actor(), "select public.change_booking_status($1, 'in_review')", [
      unassignedBookingId,
    ]);
    expect(result).toMatchObject({ ok: false, code: "P0002" });
  });

  it("cannot edit inquiry fields directly (all writes go through audited functions)", async () => {
    for (const sql of [
      "update public.bookings set venue = 'Updated venue' where id = $1",
      "update public.bookings set contact_email = 'victim@example.com?bcc=attacker%40evil.example' where id = $1",
      "update public.bookings set event_date = '2000-01-01' where id = $1",
    ]) {
      expect(await asActor(db, actor(), sql, [assignedBookingId]), sql).toMatchObject({
        ok: false,
        code: PERMISSION_DENIED,
      });
    }
  });

  it("cannot reassign an inquiry", async () => {
    const result = await asActor(db, actor(), "update public.bookings set assigned_to = $1 where id = $2", [
      ids.otherEventManager,
      assignedBookingId,
    ]);
    expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("cannot delete inquiries or change content", async () => {
    const del = await asActor(db, actor(), "delete from public.bookings where id = $1", [assignedBookingId]);
    const content = await asActor(db, actor(), "update public.services set sort_order = 1");
    expect(del).toMatchObject({ ok: true, affectedRows: 0 });
    expect(content).toMatchObject({ ok: true, affectedRows: 0 });
  });
});

describe("analyst", () => {
  const actor = () => user(ids.analyst);

  it("cannot read customer inquiries", async () => {
    const result = await asActor(db, actor(), "select id from public.bookings");
    expect(result).toMatchObject({ ok: true, rows: [] });
  });

  it("cannot mutate business records", async () => {
    const service = await asActor(db, actor(), "insert into public.services (slug) values ('x')");
    const booking = await asActor(
      db,
      actor(),
      `insert into public.bookings (event_type, contact_name, contact_email, consent_given_at)
       values ('wedding', 'X', 'x@example.test', now())`,
    );
    expect(service).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    expect(booking).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });
});

describe("admin and owner", () => {
  it("admin reads every inquiry but cannot delete one", async () => {
    const read = await asActor(db, user(ids.admin), "select id from public.bookings");
    const del = await asActor(db, user(ids.admin), "delete from public.bookings where id = $1", [
      unassignedBookingId,
    ]);
    expect(read.ok && read.rows).toHaveLength(2);
    expect(del).toMatchObject({ ok: true, affectedRows: 0 });
  });

  it("owner can perform privacy erasure", async () => {
    const del = await asActor(db, user(ids.owner), "delete from public.bookings where id = $1", [
      unassignedBookingId,
    ]);
    expect(del).toMatchObject({ ok: true, affectedRows: 1 });
  });
});

describe("publishing rules for a role without content.publish", () => {
  // No current role has content.write without content.publish; this suite
  // removes the permission from content_editor in an isolated database to prove
  // the trigger and policies hold for such roles in future.
  let isolated: PGlite;
  let writer: string;

  beforeAll(async () => {
    isolated = await createTestDatabase();
    writer = await createAuthUser(isolated, "writer@example.test");
    await grantRoleAsOwner(isolated, writer, "content_editor");
    await isolated.query(
      "delete from public.role_permissions where role = 'content_editor' and permission = 'content.publish'",
    );
  });

  afterAll(async () => {
    await isolated?.close();
  });

  it("can edit drafts", async () => {
    const result = await asActor(
      isolated,
      user(writer),
      "update public.services set sort_order = 41 where slug = 'culinary-experiences'",
    );
    expect(result).toMatchObject({ ok: true, affectedRows: 1 });
  });

  it("cannot publish, edit live content or delete", async () => {
    for (const sql of [
      "update public.services set status = 'published' where slug = 'culinary-experiences'",
      "update public.services set sort_order = 99 where slug = 'weddings'",
      `update public.service_translations set title = 'Changed' where locale = 'en'
         and service_id = (select id from public.services where slug = 'weddings')`,
    ]) {
      expect(await asActor(isolated, user(writer), sql), sql).toMatchObject({
        ok: false,
        code: PERMISSION_DENIED,
      });
    }
    const removal = await asActor(isolated, user(writer), "delete from public.service_translations");
    expect(removal).toMatchObject({ ok: true, affectedRows: 0 });
  });
});
