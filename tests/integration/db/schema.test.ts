import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APP_PERMISSIONS, APP_ROLES, ROLE_PERMISSIONS } from "@/lib/permissions/matrix";
import { createTestDatabase, migrationFiles } from "./harness";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db?.close();
});

describe("migrations", () => {
  it("are named with sortable timestamps and apply cleanly with the seed", async () => {
    const files = migrationFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(file).toMatch(/^\d{14}_[a-z0-9_]+\.sql$/);

    const { rows } = await db.query<{ count: number }>("select count(*)::int as count from public.services");
    expect(rows[0]!.count).toBe(4);
  });

  it("enable row level security on every public table", async () => {
    const { rows } = await db.query<{ relname: string }>(`
      select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
    `);
    expect(rows).toEqual([]);
  });

  it("pin search_path on every SECURITY DEFINER function", async () => {
    const { rows } = await db.query<{ proname: string }>(`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private')
        and p.prosecdef
        and not exists (
          select 1 from unnest(coalesce(p.proconfig, '{}')) as cfg where cfg like 'search_path=%'
        )
    `);
    expect(rows).toEqual([]);
  });
});

describe("table privileges for API roles", () => {
  const privateTables = ["profiles", "user_roles", "role_permissions", "audit_logs", "bookings"];

  it.each(privateTables)("anon has no privileges on %s", async (table) => {
    const { rows } = await db.query<{ privileges: string[] }>(
      `select array_remove(array[
         case when has_table_privilege('anon', $1, 'select') then 'select' end,
         case when has_table_privilege('anon', $1, 'insert') then 'insert' end,
         case when has_table_privilege('anon', $1, 'update') then 'update' end,
         case when has_table_privilege('anon', $1, 'delete') then 'delete' end
       ], null) as privileges`,
      [`public.${table}`],
    );
    expect(rows[0]!.privileges).toEqual([]);
  });

  it.each(["user_roles", "role_permissions", "audit_logs"])(
    "authenticated cannot write to %s directly",
    async (table) => {
      const { rows } = await db.query<{ writable: boolean }>(
        `select has_table_privilege('authenticated', $1, 'insert')
             or has_table_privilege('authenticated', $1, 'update')
             or has_table_privilege('authenticated', $1, 'delete') as writable`,
        [`public.${table}`],
      );
      expect(rows[0]!.writable).toBe(false);
    },
  );

  it("authenticated can update only safe profile columns", async () => {
    const { rows } = await db.query<{ column_name: string }>(`
      select column_name from information_schema.column_privileges
      where table_schema = 'public' and table_name = 'profiles'
        and grantee = 'authenticated' and privilege_type = 'UPDATE'
      order by column_name
    `);
    expect(rows.map((r) => r.column_name)).toEqual(["display_name", "preferred_locale"]);
  });
});

describe("function privileges", () => {
  it("expose only the intended functions to API roles", async () => {
    const { rows } = await db.query<{ fn: string; role: string }>(`
      select n.nspname || '.' || p.proname as fn, r.rolname as role
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join (values ('anon'), ('authenticated')) as r (rolname)
      where n.nspname in ('public', 'private')
        and has_function_privilege(r.rolname, p.oid, 'execute')
        and has_schema_privilege(r.rolname, n.oid, 'usage')
      order by 1, 2
    `);
    expect(rows).toEqual([
      { fn: "private.has_permission", role: "authenticated" },
      { fn: "private.staff_display_name", role: "authenticated" },
      { fn: "public.add_booking_note", role: "authenticated" },
      { fn: "public.assign_booking", role: "authenticated" },
      { fn: "public.assign_role", role: "authenticated" },
      { fn: "public.booking_inbox_counts", role: "authenticated" },
      { fn: "public.booking_report", role: "authenticated" },
      { fn: "public.change_booking_status", role: "authenticated" },
      { fn: "public.get_booking_detail", role: "authenticated" },
      { fn: "public.get_my_access", role: "authenticated" },
      { fn: "public.list_assignable_staff", role: "authenticated" },
      { fn: "public.list_bookings", role: "authenticated" },
      { fn: "public.revoke_role", role: "authenticated" },
    ]);
  });

  it("reserve submission and delivery functions for the server secret key", async () => {
    const { rows } = await db.query<{ fn: string; anon: boolean; authenticated: boolean; service: boolean }>(`
      select p.proname as fn,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
             has_function_privilege('service_role', p.oid, 'execute') as service
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('submit_inquiry', 'consume_rate_limit', 'claim_notifications', 'complete_notification')
      order by 1
    `);
    expect(rows).toHaveLength(4);
    for (const row of rows)
      expect(row, row.fn).toMatchObject({ anon: false, authenticated: false, service: true });
  });

  it("give the server secret key no direct access to booking data", async () => {
    const { rows } = await db.query<{ t: string; any_privilege: boolean }>(`
      select t, has_table_privilege('service_role', t, 'select,insert,update,delete,truncate') as any_privilege
      from unnest(array['public.bookings', 'public.booking_status_history', 'public.booking_notes',
                        'private.rate_limits', 'private.notification_outbox']) as t
    `);
    for (const row of rows) expect(row.any_privilege, row.t).toBe(false);
  });
});

describe("permission matrix", () => {
  it("database enums match the TypeScript specification", async () => {
    const roles = await db.query<{ v: string }>(
      "select unnest(enum_range(null::public.app_role))::text as v",
    );
    const permissions = await db.query<{ v: string }>(
      "select unnest(enum_range(null::public.app_permission))::text as v",
    );
    expect(roles.rows.map((r) => r.v)).toEqual([...APP_ROLES]);
    expect(permissions.rows.map((r) => r.v)).toEqual([...APP_PERMISSIONS]);
  });

  it("public.role_permissions matches src/lib/permissions/matrix.ts exactly", async () => {
    const { rows } = await db.query<{ role: string; permission: string }>(
      "select role::text, permission::text from public.role_permissions",
    );
    const actual = Object.fromEntries(
      APP_ROLES.map((role) => [
        role,
        rows
          .filter((r) => r.role === role)
          .map((r) => r.permission)
          .sort(),
      ]),
    );
    const expected = Object.fromEntries(APP_ROLES.map((role) => [role, [...ROLE_PERMISSIONS[role]].sort()]));
    expect(actual).toEqual(expected);
  });
});
