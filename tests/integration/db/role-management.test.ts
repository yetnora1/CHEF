import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asActor, createAuthUser, createTestDatabase, grantRoleAsOwner, service, user } from "./harness";

const PERMISSION_DENIED = "42501";

describe("role assignment through assign_role / revoke_role", () => {
  let db: PGlite;
  const ids = {} as Record<"owner" | "secondOwner" | "admin" | "otherAdmin" | "staff" | "newcomer", string>;

  const rolesOf = async (userId: string) =>
    (
      await db.query<{ role: string }>(
        "select role::text from public.user_roles where user_id = $1 order by role",
        [userId],
      )
    ).rows.map((r) => r.role);

  beforeAll(async () => {
    db = await createTestDatabase({ seed: false });
    ids.owner = await createAuthUser(db, "owner@example.test");
    ids.secondOwner = await createAuthUser(db, "owner2@example.test");
    ids.admin = await createAuthUser(db, "admin@example.test");
    ids.otherAdmin = await createAuthUser(db, "admin2@example.test");
    ids.staff = await createAuthUser(db, "staff@example.test");
    ids.newcomer = await createAuthUser(db, "new@example.test");
    await grantRoleAsOwner(db, ids.owner, "owner");
    await grantRoleAsOwner(db, ids.secondOwner, "owner");
    await grantRoleAsOwner(db, ids.admin, "admin");
    await grantRoleAsOwner(db, ids.otherAdmin, "admin");
    await grantRoleAsOwner(db, ids.staff, "content_editor");
  });

  afterAll(async () => {
    await db?.close();
  });

  it("admin can grant a non-privileged role, and the change is audited", async () => {
    const result = await asActor(
      db,
      user(ids.admin),
      "select public.assign_role($1, 'event_manager')",
      [ids.newcomer],
      { persist: true },
    );
    expect(result.ok).toBe(true);
    expect(await rolesOf(ids.newcomer)).toEqual(["event_manager"]);

    const audit = await db.query<{ actor_id: string; action: string; target_id: string; details: unknown }>(
      "select actor_id, action, target_id, details from public.audit_logs order by id desc limit 1",
    );
    expect(audit.rows[0]).toEqual({
      actor_id: ids.admin,
      action: "role.assigned",
      target_id: ids.newcomer,
      details: { role: "event_manager" },
    });

    const granted = await db.query<{ granted_by: string }>(
      "select granted_by from public.user_roles where user_id = $1",
      [ids.newcomer],
    );
    expect(granted.rows[0]!.granted_by).toBe(ids.admin);
  });

  it("admin cannot grant owner or admin", async () => {
    for (const role of ["owner", "admin"]) {
      const result = await asActor(db, user(ids.admin), `select public.assign_role($1, '${role}')`, [
        ids.staff,
      ]);
      expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    }
    expect(await rolesOf(ids.staff)).toEqual(["content_editor"]);
  });

  it("admin cannot alter the roles of an owner or another admin", async () => {
    const onOwner = await asActor(db, user(ids.admin), "select public.revoke_role($1, 'owner')", [ids.owner]);
    const onAdmin = await asActor(db, user(ids.admin), "select public.assign_role($1, 'analyst')", [
      ids.otherAdmin,
    ]);
    expect(onOwner).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    expect(onAdmin).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("nobody can change their own roles, including owners", async () => {
    const promote = await asActor(db, user(ids.admin), "select public.assign_role($1, 'owner')", [ids.admin]);
    const demote = await asActor(db, user(ids.owner), "select public.revoke_role($1, 'owner')", [ids.owner]);
    expect(promote).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    expect(demote).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    expect(await rolesOf(ids.owner)).toEqual(["owner"]);
  });

  it("a non-manager staff member cannot change anyone's roles", async () => {
    const result = await asActor(db, user(ids.staff), "select public.revoke_role($1, 'event_manager')", [
      ids.newcomer,
    ]);
    expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("owner can grant and revoke privileged roles", async () => {
    const grant = await asActor(db, user(ids.owner), "select public.assign_role($1, 'admin')", [ids.staff], {
      persist: true,
    });
    expect(grant.ok).toBe(true);
    expect(await rolesOf(ids.staff)).toEqual(["admin", "content_editor"]);

    const revoke = await asActor(db, user(ids.owner), "select public.revoke_role($1, 'admin')", [ids.staff], {
      persist: true,
    });
    expect(revoke.ok).toBe(true);
    expect(await rolesOf(ids.staff)).toEqual(["content_editor"]);
  });

  it("owner can remove another owner while at least one owner remains", async () => {
    const result = await asActor(
      db,
      user(ids.owner),
      "select public.revoke_role($1, 'owner')",
      [ids.secondOwner],
      { persist: true },
    );
    expect(result.ok).toBe(true);
    const owners = await db.query<{ count: number }>(
      "select count(*)::int as count from public.user_roles where role = 'owner'",
    );
    expect(owners.rows[0]!.count).toBe(1);
  });

  it("rejects unknown users", async () => {
    const result = await asActor(
      db,
      user(ids.owner),
      "select public.assign_role(gen_random_uuid(), 'analyst')",
    );
    expect(result).toMatchObject({ ok: false, code: "P0002" });
  });

  it("keeps the audit log append-only, even for owners and the database owner", async () => {
    const ownerUpdate = await asActor(
      db,
      user(ids.owner),
      "update public.audit_logs set action = 'role.hidden'",
    );
    const ownerDelete = await asActor(db, user(ids.owner), "delete from public.audit_logs");
    expect(ownerUpdate).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    expect(ownerDelete).toMatchObject({ ok: false, code: PERMISSION_DENIED });

    await expect(db.query("delete from public.audit_logs")).rejects.toThrow(/append-only/);
    await expect(db.query("truncate public.audit_logs")).rejects.toThrow(/append-only/);
  });

  it("denies the server secret key (service_role) direct writes to privilege and audit tables", async () => {
    for (const sql of [
      `insert into public.user_roles (user_id, role) values ('${ids.newcomer}', 'owner')`,
      "delete from public.user_roles",
      "insert into public.role_permissions (role, permission) values ('analyst', 'users.manage')",
      "insert into public.audit_logs (action) values ('role.assigned')",
      "update public.audit_logs set action = 'role.hidden'",
      "truncate public.audit_logs",
    ]) {
      expect(await asActor(db, service, sql), sql).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    }
    // Reading stays available for server-side reporting.
    expect((await asActor(db, service, "select count(*) from public.audit_logs")).ok).toBe(true);
  });
});

describe("first owner bootstrap", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDatabase({ seed: false });
  });

  afterAll(async () => {
    await db?.close();
  });

  it("is not executable by API roles", async () => {
    const uid = await createAuthUser(db, "hopeful@example.test");
    const result = await asActor(
      db,
      user(uid),
      "select private.bootstrap_first_owner('hopeful@example.test')",
    );
    expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("works once for the database owner, then refuses", async () => {
    const uid = await createAuthUser(db, "Chef.Owner@example.test");
    const first = await db.query<{ id: string }>(
      "select private.bootstrap_first_owner('chef.owner@example.test') as id",
    );
    expect(first.rows[0]!.id).toBe(uid);

    await expect(db.query("select private.bootstrap_first_owner('hopeful@example.test')")).rejects.toThrow(
      /owner already exists/,
    );
  });
});

describe("new auth users", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDatabase({ seed: false });
  });

  afterAll(async () => {
    await db?.close();
  });

  it("get a profile but never a role, whatever their metadata claims", async () => {
    const uid = await createAuthUser(db, "signup@example.test", {
      display_name: "  New Staff  ",
      role: "owner",
      roles: ["owner"],
    });

    const profile = await db.query<{ display_name: string; preferred_locale: string }>(
      "select display_name, preferred_locale from public.profiles where id = $1",
      [uid],
    );
    expect(profile.rows[0]).toEqual({ display_name: "New Staff", preferred_locale: "en" });

    const roles = await db.query("select * from public.user_roles where user_id = $1", [uid]);
    expect(roles.rows).toEqual([]);
  });

  it("reject unsupported locales", async () => {
    const uid = await createAuthUser(db, "locale@example.test");
    const result = await asActor(
      db,
      user(uid),
      "update public.profiles set preferred_locale = 'fr' where id = $1",
      [uid],
    );
    expect(result).toMatchObject({ ok: false, code: "23514" });
  });
});
