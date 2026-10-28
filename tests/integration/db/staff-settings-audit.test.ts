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
} from "./harness";

const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";

/** Stage 4: staff list and role changes, site settings, audit log reads. */
describe("staff, settings and audit log (Stage 4)", () => {
  let db: PGlite;
  const ids = {} as Record<"owner" | "owner2" | "admin" | "editor" | "analyst" | "newcomer", string>;

  const rolesOf = async (userId: string) =>
    (
      await db.query<{ role: string }>(
        "select role::text from public.user_roles where user_id = $1 order by role",
        [userId],
      )
    ).rows.map((row) => row.role);

  const lastAudit = async () =>
    (
      await db.query<{ action: string; actor_id: string | null; target_id: string; details: unknown }>(
        "select action, actor_id, target_id, details from public.audit_logs order by id desc limit 1",
      )
    ).rows[0];

  beforeAll(async () => {
    db = await createTestDatabase({ seed: false });
    ids.owner = await createAuthUser(db, "owner@example.test", { display_name: "Owner Person" });
    ids.owner2 = await createAuthUser(db, "owner2@example.test");
    ids.admin = await createAuthUser(db, "admin@example.test", { display_name: "Admin Person" });
    ids.editor = await createAuthUser(db, "editor@example.test");
    ids.analyst = await createAuthUser(db, "analyst@example.test");
    ids.newcomer = await createAuthUser(db, "newcomer@example.test");
    await grantRoleAsOwner(db, ids.owner, "owner");
    await grantRoleAsOwner(db, ids.owner2, "owner");
    await grantRoleAsOwner(db, ids.admin, "admin");
    await grantRoleAsOwner(db, ids.editor, "content_editor");
    await grantRoleAsOwner(db, ids.analyst, "analyst");
    await db.query("update auth.users set last_sign_in_at = '2026-10-27T08:00:00Z' where id = $1", [
      ids.admin,
    ]);
  });

  afterAll(async () => {
    await db?.close();
  });

  describe("list_staff", () => {
    it("lists every account with its email, roles and sign-in time for staff managers", async () => {
      for (const manager of [ids.owner, ids.admin]) {
        const result = await asActor<{
          user_id: string;
          email: string;
          display_name: string | null;
          roles: string;
          last_sign_in_at: Date | null;
        }>(db, user(manager), "select * from public.list_staff()");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.rows).toHaveLength(6);
        const admin = result.rows.find((row) => row.user_id === ids.admin)!;
        expect(admin).toMatchObject({ email: "admin@example.test", display_name: "Admin Person" });
        expect(admin.last_sign_in_at).not.toBeNull();
        // Accounts without a role are listed too, so they can be given one.
        expect(result.rows.find((row) => row.user_id === ids.newcomer)).toMatchObject({
          email: "newcomer@example.test",
          display_name: null,
          roles: "{}",
        });
      }
    });

    it("refuses everyone else, including visitors and the secret key", async () => {
      for (const actor of [user(ids.editor), user(ids.analyst), user(ids.newcomer), anon, service]) {
        const result = await asActor(db, actor, "select * from public.list_staff()");
        expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
      }
    });
  });

  describe("set_user_roles", () => {
    it("applies a new set of roles as individual audited changes", async () => {
      const result = await asActor(
        db,
        user(ids.admin),
        "select public.set_user_roles($1, array['event_manager', 'analyst']::public.app_role[])",
        [ids.newcomer],
        { persist: true },
      );
      expect(result.ok).toBe(true);
      expect(await rolesOf(ids.newcomer)).toEqual(["analyst", "event_manager"]);

      const replaced = await asActor(
        db,
        user(ids.admin),
        "select public.set_user_roles($1, array['event_manager']::public.app_role[])",
        [ids.newcomer],
        { persist: true },
      );
      expect(replaced.ok).toBe(true);
      expect(await rolesOf(ids.newcomer)).toEqual(["event_manager"]);
      expect(await lastAudit()).toEqual({
        action: "role.revoked",
        actor_id: ids.admin,
        target_id: ids.newcomer,
        details: { role: "analyst" },
      });
    });

    it("changes nothing when any part is refused (one transaction)", async () => {
      // An admin may add analyst but not admin: neither happens.
      const result = await asActor(
        db,
        user(ids.admin),
        "select public.set_user_roles($1, array['event_manager', 'analyst', 'admin']::public.app_role[])",
        [ids.newcomer],
        { persist: true },
      );
      expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
      expect(await rolesOf(ids.newcomer)).toEqual(["event_manager"]);
    });

    it("keeps every existing rule: no self-changes, privileged accounts need an owner", async () => {
      const own = await asActor(
        db,
        user(ids.admin),
        "select public.set_user_roles($1, array['owner']::public.app_role[])",
        [ids.admin],
      );
      expect(own).toMatchObject({ ok: false, code: PERMISSION_DENIED });

      const onOwner = await asActor(
        db,
        user(ids.admin),
        "select public.set_user_roles($1, array['analyst']::public.app_role[])",
        [ids.owner],
      );
      expect(onOwner).toMatchObject({ ok: false, code: PERMISSION_DENIED });

      const byOwner = await asActor(
        db,
        user(ids.owner),
        "select public.set_user_roles($1, array['owner', 'admin']::public.app_role[])",
        [ids.owner2],
      );
      expect(byOwner.ok).toBe(true);
    });

    it("refuses staff without users.manage, visitors and the secret key", async () => {
      for (const actor of [user(ids.editor), user(ids.analyst), anon, service]) {
        const result = await asActor(
          db,
          actor,
          "select public.set_user_roles($1, array['analyst']::public.app_role[])",
          [ids.newcomer],
        );
        expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
      }
      expect(await rolesOf(ids.newcomer)).toEqual(["event_manager"]);
    });
  });

  describe("site_settings", () => {
    const publicRow = async () => {
      const result = await asActor<Record<string, unknown>>(
        db,
        anon,
        "select * from public.public_site_settings()",
      );
      expect(result.ok).toBe(true);
      return result.ok ? result.rows[0]! : {};
    };

    it("starts empty, with inquiries open, and visitors read it only through the public function", async () => {
      expect(await publicRow()).toMatchObject({
        contact_email: null,
        location_en: null,
        location_am: null,
        inquiries_open: true,
      });
      for (const sql of [
        "select contact_email from public.site_settings",
        "update public.site_settings set inquiries_open = false",
      ]) {
        expect(await asActor(db, anon, sql)).toMatchObject({ ok: false, code: PERMISSION_DENIED });
      }
    });

    it("lets settings managers save, versioned, stamped and audited", async () => {
      const saved = await asActor<{ version: number; updated_by: string }>(
        db,
        user(ids.admin),
        `update public.site_settings
           set contact_email = 'hello@chefsis.example', contact_phone = '+251 911 234 567',
               location_en = 'Addis Ababa', instagram_url = 'https://www.instagram.com/chefsis'
         where id and version = 1
         returning version, updated_by`,
        [],
        { persist: true },
      );
      expect(saved).toMatchObject({ ok: true, rows: [{ version: 2, updated_by: ids.admin }] });
      expect(await lastAudit()).toEqual({
        action: "settings.updated",
        actor_id: ids.admin,
        target_id: "site",
        details: { fields: ["contact_email", "contact_phone", "instagram_url", "location_en"] },
      });
      expect(await publicRow()).toMatchObject({
        contact_email: "hello@chefsis.example",
        instagram_url: "https://www.instagram.com/chefsis",
      });

      // A save based on an old version matches nothing (the form reports a conflict).
      const stale = await asActor(
        db,
        user(ids.owner),
        "update public.site_settings set inquiries_open = false where id and version = 1",
      );
      expect(stale).toMatchObject({ ok: true, affectedRows: 0 });
    });

    it("shows the Amharic location to visitors only after a confirmed review, cleared when it changes", async () => {
      const save = (sql: string) => asActor(db, user(ids.owner), sql, [], { persist: true });
      await save("update public.site_settings set location_am = 'አዲስ አበባ' where id");
      expect(await publicRow()).toMatchObject({ location_am: null });

      await save("update public.site_settings set location_am_reviewed_at = now() where id");
      expect(await publicRow()).toMatchObject({ location_am: "አዲስ አበባ" });
      const reviewer = await db.query<{ location_am_reviewed_by: string }>(
        "select location_am_reviewed_by from public.site_settings",
      );
      expect(reviewer.rows[0]!.location_am_reviewed_by).toBe(ids.owner);

      await save("update public.site_settings set location_am = 'አዲስ አበባ፣ ኢትዮጵያ' where id");
      expect(await publicRow()).toMatchObject({ location_am: null });
    });

    it("refuses staff without settings.manage, and the secret key entirely", async () => {
      for (const staff of [ids.editor, ids.analyst, ids.newcomer]) {
        const update = await asActor(
          db,
          user(staff),
          "update public.site_settings set inquiries_open = false",
        );
        expect(update, staff).toMatchObject({ ok: true, affectedRows: 0 });
        const read = await asActor(db, user(staff), "select * from public.get_site_settings()");
        expect(read, staff).toMatchObject({ ok: true, rows: [] });
      }
      for (const sql of [
        "select * from public.site_settings",
        "update public.site_settings set inquiries_open = false",
        "select * from public.profiles",
      ]) {
        expect(await asActor(db, service, sql), sql).toMatchObject({ ok: false, code: PERMISSION_DENIED });
      }
    });

    it("never adds or removes the single row", async () => {
      for (const sql of [
        "insert into public.site_settings (id) values (true)",
        "delete from public.site_settings",
      ]) {
        expect(await asActor(db, user(ids.owner), sql), sql).toMatchObject({
          ok: false,
          code: PERMISSION_DENIED,
        });
      }
    });

    it("rejects malformed contact details and links to other sites", async () => {
      for (const assignment of [
        "contact_email = 'not-an-email'",
        "contact_phone = 'call me'",
        "telegram_username = '@x'",
        "instagram_url = 'http://instagram.com/chefsis'",
        "instagram_url = 'https://evil.example/instagram.com/chefsis'",
        "facebook_url = 'https://facebook.com.evil.example/x'",
        "youtube_url = 'javascript:alert(1)'",
      ]) {
        const result = await asActor(
          db,
          user(ids.owner),
          `update public.site_settings set ${assignment} where id`,
        );
        expect(result, assignment).toMatchObject({ ok: false, code: CHECK_VIOLATION });
      }
    });

    it("gives settings managers the whole row, with who saved last", async () => {
      const result = await asActor<{ version: number; updated_by_name: string }>(
        db,
        user(ids.admin),
        "select * from public.get_site_settings()",
      );
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.rows[0]).toMatchObject({ updated_by_name: "Owner Person" });
    });
  });

  describe("list_audit_log", () => {
    it("pages newest first with names, and filters by category and person", async () => {
      const page = await asActor<{
        id: number;
        action: string;
        actor_name: string;
        target_name: string | null;
      }>(db, user(ids.admin), "select * from public.list_audit_log(null, null, null, 3)");
      expect(page.ok).toBe(true);
      if (!page.ok) return;
      expect(page.rows).toHaveLength(3);
      expect(page.rows[0]!.id).toBeGreaterThan(page.rows[2]!.id);

      const older = await asActor<{ id: number }>(
        db,
        user(ids.admin),
        "select * from public.list_audit_log(null, null, $1, 50)",
        [page.rows[2]!.id],
      );
      expect(older.ok && older.rows.every((row) => row.id < page.rows[2]!.id)).toBe(true);

      const roles = await asActor<{ action: string; actor_name: string; target_name: string }>(
        db,
        user(ids.owner),
        "select * from public.list_audit_log('role', $1, null, 50)",
        [ids.admin],
      );
      expect(roles.ok).toBe(true);
      if (!roles.ok) return;
      expect(roles.rows.length).toBeGreaterThan(0);
      for (const row of roles.rows) {
        expect(row.action.startsWith("role.")).toBe(true);
        expect(row.actor_name).toBe("Admin Person");
      }
      expect(roles.rows.some((row) => row.target_name === "newcomer")).toBe(true);
    });

    it("ignores categories that are not plain words (no pattern injection)", async () => {
      for (const category of ["%", "role%", "role.assigned"]) {
        const result = await asActor(
          db,
          user(ids.owner),
          "select * from public.list_audit_log($1, null, null, 50)",
          [category],
        );
        expect(result, category).toMatchObject({ ok: true, rows: [] });
      }
    });

    it("shows nothing to staff without audit.read, and refuses visitors and the secret key", async () => {
      for (const staff of [ids.editor, ids.analyst, ids.newcomer]) {
        const result = await asActor(
          db,
          user(staff),
          "select * from public.list_audit_log(null, null, null, 50)",
        );
        expect(result, staff).toMatchObject({ ok: true, rows: [] });
      }
      for (const actor of [anon, service]) {
        const result = await asActor(db, actor, "select * from public.list_audit_log(null, null, null, 50)");
        expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
      }
    });
  });
});
