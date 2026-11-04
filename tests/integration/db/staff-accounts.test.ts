import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isValidUsername } from "@/features/account/rules";
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

/*
 * Staff usernames: who may set them, and above all that nobody but the server's
 * secret key can turn a username into an email address.
 */

const PERMISSION_DENIED = "42501";
const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";

let db: PGlite;
const ids = {} as Record<"editor" | "analyst" | "noRole", string>;
const persist = { persist: true };

async function ok<T = Record<string, unknown>>(actor: Actor, sql: string, params: unknown[] = []) {
  const result = await asActor<T>(db, actor, sql, params, persist);
  if (!result.ok) throw new Error(`${sql}\n→ ${result.code} ${result.message}`);
  return result;
}

const setUsername = (actor: Actor, id: string, username: string | null) =>
  asActor(db, actor, "update public.profiles set username = $2 where id = $1", [id, username], persist);

const LOOKUP = "select public.staff_login_email($1) as email";

beforeAll(async () => {
  db = await createTestDatabase();
  ids.editor = await createAuthUser(db, "editor@example.test");
  ids.analyst = await createAuthUser(db, "analyst@example.test");
  ids.noRole = await createAuthUser(db, "visitor@example.test");
  await grantRoleAsOwner(db, ids.editor, "content_editor");
  await grantRoleAsOwner(db, ids.analyst, "analyst");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("usernames", () => {
  it("are chosen by each staff member for themselves", async () => {
    expect(await setUsername(user(ids.editor), ids.editor, "chef.sis")).toMatchObject({ ok: true, affectedRows: 1 });
    const mine = await ok<{ username: string }>(user(ids.editor), "select public.get_my_username() as username");
    expect(mine.rows).toEqual([{ username: "chef.sis" }]);
  });

  it("cannot be set on someone else's account", async () => {
    expect(await setUsername(user(ids.analyst), ids.editor, "taken-over")).toMatchObject({
      ok: true,
      affectedRows: 0,
    });
    const { rows } = await db.query("select username from public.profiles where id = $1", [ids.editor]);
    expect(rows).toEqual([{ username: "chef.sis" }]);
  });

  it("cannot be set by visitors", async () => {
    const result = await setUsername(anon, ids.editor, "visitor");
    expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });

  it("are unique", async () => {
    expect(await setUsername(user(ids.analyst), ids.analyst, "chef.sis")).toMatchObject({
      ok: false,
      code: UNIQUE_VIOLATION,
    });
  });

  it.each([
    "ab",
    "a".repeat(33),
    "Upper.Case",
    "with space",
    "name@example.test",
    ".leading",
    "trailing-",
    "emoji😀name",
    "አማርኛ",
  ])("refuse %j, in the database and in the code", async (name) => {
    expect(await setUsername(user(ids.analyst), ids.analyst, name)).toMatchObject({
      ok: false,
      code: CHECK_VIOLATION,
    });
    expect(isValidUsername(name)).toBe(false);
  });

  it.each(["abc", "a".repeat(32), "chef_sis-2", "x.y.z", "007"])(
    "accept %j, in the database and in the code",
    async (name) => {
      expect(await setUsername(user(ids.analyst), ids.analyst, name)).toMatchObject({ ok: true, affectedRows: 1 });
      expect(isValidUsername(name)).toBe(true);
    },
  );

  it("can be removed, which frees the name", async () => {
    await ok(user(ids.analyst), "update public.profiles set username = 'free.me' where id = $1", [ids.analyst]);
    expect(await setUsername(user(ids.analyst), ids.analyst, null)).toMatchObject({ ok: true, affectedRows: 1 });
    expect(await setUsername(user(ids.noRole), ids.noRole, "free.me")).toMatchObject({ ok: true, affectedRows: 1 });
    await setUsername(user(ids.noRole), ids.noRole, null);
  });

  it("leave no way to widen the grant to other columns", async () => {
    const result = await asActor(db, user(ids.analyst), "update public.profiles set id = $1 where id = $1", [
      ids.analyst,
    ]);
    expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
  });
});

describe("from a username to an email address", () => {
  it("works only for the server's secret key", async () => {
    const lookup = await ok<{ email: string }>(service, LOOKUP, ["chef.sis"]);
    expect(lookup.rows).toEqual([{ email: "editor@example.test" }]);
  });

  it("is refused to visitors and to every signed-in account", async () => {
    for (const who of [anon, user(ids.editor), user(ids.analyst), user(ids.noRole)]) {
      expect(await asActor(db, who, LOOKUP, ["chef.sis"])).toMatchObject({
        ok: false,
        code: PERMISSION_DENIED,
      });
    }
  });

  it("gives nothing for an unknown username, and ignores case and spaces", async () => {
    expect((await ok<{ email: string | null }>(service, LOOKUP, ["nobody"])).rows).toEqual([{ email: null }]);
    expect((await ok<{ email: string | null }>(service, LOOKUP, ["  CHEF.sis "])).rows).toEqual([
      { email: "editor@example.test" },
    ]);
  });

  it("does not give the secret key the tables behind it", async () => {
    for (const sql of ["select * from public.profiles", "select * from auth.users"]) {
      const result = await asActor(db, service, sql);
      expect(result).toMatchObject({ ok: false, code: PERMISSION_DENIED });
    }
  });

  it("follows a changed email address", async () => {
    await db.query("update auth.users set email = 'new@example.test' where id = $1", [ids.editor]);
    expect((await ok<{ email: string }>(service, LOOKUP, ["chef.sis"])).rows).toEqual([
      { email: "new@example.test" },
    ]);
    await db.query("update auth.users set email = 'editor@example.test' where id = $1", [ids.editor]);
  });
});

describe("the audit log", () => {
  const entries = async (id: string) => {
    const { rows } = await db.query<{ action: string; actor_id: string; target_type: string; details: unknown }>(
      "select action, actor_id, target_type, details from public.audit_logs where target_id = $1 order by id",
      [id],
    );
    return rows;
  };

  it("records usernames being set, changed and removed, and nothing else on the profile", async () => {
    const before = (await entries(ids.noRole)).length;
    await setUsername(user(ids.noRole), ids.noRole, "audit.me");
    await ok(user(ids.noRole), "update public.profiles set display_name = 'Someone' where id = $1", [ids.noRole]);
    await setUsername(user(ids.noRole), ids.noRole, null);
    const added = (await entries(ids.noRole)).slice(before);
    expect(added.map((entry) => entry.action)).toEqual([
      "account.username_changed",
      "account.username_changed",
    ]);
    expect(added[0]).toMatchObject({ actor_id: ids.noRole, target_type: "user" });
  });

  it("records password and email changes against the signed-in account only", async () => {
    const before = (await entries(ids.analyst)).length;
    await ok(user(ids.analyst), "select public.record_account_change('password_changed')");
    await ok(user(ids.analyst), "select public.record_account_change('email_change_requested')");
    const added = (await entries(ids.analyst)).slice(before);
    expect(added.map((entry) => entry.action)).toEqual([
      "account.password_changed",
      "account.email_change_requested",
    ]);
    expect(new Set(added.map((entry) => entry.actor_id))).toEqual(new Set([ids.analyst]));
  });

  it("refuses visitors and any other kind of entry", async () => {
    expect(await asActor(db, anon, "select public.record_account_change('password_changed')")).toMatchObject({
      ok: false,
      code: PERMISSION_DENIED,
    });
    expect(await asActor(db, service, "select public.record_account_change('password_changed')")).toMatchObject({
      ok: false,
      code: PERMISSION_DENIED,
    });
    const forged = await asActor(db, user(ids.analyst), "select public.record_account_change('role.assigned')");
    expect(forged).toMatchObject({ ok: false, code: "22023" });
  });
});
