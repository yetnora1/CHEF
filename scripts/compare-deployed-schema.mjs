#!/usr/bin/env node
/**
 * Compares a deployed database with this repository's migrations:
 *
 *   DEPLOYED_DATABASE_URL=postgresql://… npm run db:compare
 *
 * 1. Builds the expected schema in PGlite (the test shim + every migration).
 * 2. Reads the same catalog facts from the deployed database in a READ ONLY
 *    session: RLS flags, policies, table/column/sequence privileges of anon,
 *    authenticated and service_role, function security, volatility, search_path
 *    and EXECUTE rights, triggers, enum values, schema usage and the role
 *    permission matrix, plus the Supabase CLI migration history. For Storage:
 *    RLS on storage.objects/buckets, every policy on them (so a policy added in
 *    the dashboard shows up as a difference) and the "media" bucket settings.
 * 3. Prints every difference and exits non-zero if there is one.
 *
 * Nothing is written to the deployed database. Never put the URL in a file
 * that is committed; pass it in the environment.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import pg from "pg";

const root = path.resolve(import.meta.dirname, "..");
const url = process.env.DEPLOYED_DATABASE_URL;
if (!url) {
  console.error("Set DEPLOYED_DATABASE_URL (owner connection string of the database to check).");
  process.exit(2);
}

const API_ROLES = "(values ('anon'), ('authenticated'), ('service_role')) r (rolname)";
const SCHEMAS = "('public', 'private')";

const QUERIES = {
  tables: `
    select n.nspname || '.' || c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ${SCHEMAS} and c.relkind in ('r', 'p') order by 1`,
  policies: `
    select schemaname || '.' || tablename || ' :: ' || policyname as name, cmd, roles::text as roles,
           regexp_replace(coalesce(qual, ''), '\\s+', ' ', 'g') as using_expr,
           regexp_replace(coalesce(with_check, ''), '\\s+', ' ', 'g') as check_expr
    from pg_policies where schemaname in ${SCHEMAS} order by 1`,
  table_privileges: `
    select n.nspname || '.' || c.relname || ' / ' || r.rolname as name,
           array_to_string(array_remove(array[
             case when has_table_privilege(r.rolname, c.oid, 'select') then 'S' end,
             case when has_table_privilege(r.rolname, c.oid, 'insert') then 'I' end,
             case when has_table_privilege(r.rolname, c.oid, 'update') then 'U' end,
             case when has_table_privilege(r.rolname, c.oid, 'delete') then 'D' end,
             case when has_table_privilege(r.rolname, c.oid, 'truncate') then 'T' end,
             case when has_table_privilege(r.rolname, c.oid, 'references') then 'R' end,
             case when has_table_privilege(r.rolname, c.oid, 'trigger') then 'G' end], null), '') as privileges
    from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join ${API_ROLES}
    where n.nspname in ${SCHEMAS} and c.relkind in ('r', 'p', 'S', 'v') order by 1`,
  column_privileges: `
    select table_schema || '.' || table_name || '.' || column_name || ' / ' || grantee || ' / ' || privilege_type as name
    from information_schema.column_privileges cp
    where table_schema in ${SCHEMAS} and grantee in ('anon', 'authenticated', 'service_role')
      and not exists (
        select 1 from information_schema.table_privileges t
        where t.table_schema = cp.table_schema and t.table_name = cp.table_name
          and t.grantee = cp.grantee and t.privilege_type = cp.privilege_type)
    order by 1`,
  functions: `
    select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as name,
           p.prosecdef as security_definer, p.provolatile as volatility, array_to_string(p.proconfig, ',') as config,
           has_function_privilege('anon', p.oid, 'execute') and has_schema_privilege('anon', n.oid, 'usage') as anon,
           has_function_privilege('authenticated', p.oid, 'execute')
             and has_schema_privilege('authenticated', n.oid, 'usage') as authenticated,
           has_function_privilege('service_role', p.oid, 'execute')
             and has_schema_privilege('service_role', n.oid, 'usage') as service_role
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ${SCHEMAS} order by 1`,
  triggers: `
    select n.nspname || '.' || c.relname || ' :: ' || t.tgname as name, t.tgenabled as enabled,
           pg_get_triggerdef(t.oid) as definition
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal
      and (n.nspname in ${SCHEMAS} or (n.nspname = 'auth' and t.tgname = 'on_auth_user_created'))
    order by 1`,
  enums: `
    select t.typname as name, string_agg(e.enumlabel, ',' order by e.enumsortorder) as labels
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' group by t.typname order by 1`,
  schema_usage: `
    select n.nspname || ' / ' || r.rolname as name, has_schema_privilege(r.rolname, n.oid, 'usage') as usage,
           has_schema_privilege(r.rolname, n.oid, 'create') as "create"
    from pg_namespace n cross join ${API_ROLES} where n.nspname in ${SCHEMAS} order by 1`,
  role_permissions:
    "select role::text || ' ' || permission::text as name from public.role_permissions order by 1",
};

// Only when the storage schema exists; a Supabase project always has it.
const STORAGE_QUERIES = {
  storage_rls: `
    select n.nspname || '.' || c.relname as name, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname in ('objects', 'buckets') order by 1`,
  storage_policies: `
    select tablename || ' :: ' || policyname as name, cmd, roles::text as roles,
           regexp_replace(coalesce(qual, ''), '\\s+', ' ', 'g') as using_expr,
           regexp_replace(coalesce(with_check, ''), '\\s+', ' ', 'g') as check_expr
    from pg_policies where schemaname = 'storage' and tablename in ('objects', 'buckets') order by 1`,
  storage_buckets: `
    select id as name, public, file_size_limit::text as file_size_limit,
           array_to_string(allowed_mime_types, ',') as allowed_mime_types
    from storage.buckets where id = 'media' order by 1`,
};

async function fingerprint(run) {
  const out = {};
  for (const [key, sql] of Object.entries(QUERIES)) out[key] = await run(sql);
  const [{ ok }] = await run(
    "select to_regclass('storage.objects') is not null and to_regclass('storage.buckets') is not null as ok",
  );
  for (const [key, sql] of Object.entries(STORAGE_QUERIES)) out[key] = ok ? await run(sql) : [];
  return out;
}

const migrations = readdirSync(path.join(root, "supabase", "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .sort();

const expectedDb = await PGlite.create();
await expectedDb.exec(
  readFileSync(path.join(root, "tests", "integration", "db", "supabase-shim.sql"), "utf8"),
);
for (const file of migrations)
  await expectedDb.exec(readFileSync(path.join(root, "supabase", "migrations", file), "utf8"));
const expected = await fingerprint(async (sql) => (await expectedDb.query(sql)).rows);
await expectedDb.close();

const client = new pg.Client({ connectionString: url });
await client.connect();
let deployed;
let history = null;
try {
  await client.query("set session characteristics as transaction read only");
  deployed = await fingerprint(async (sql) => (await client.query(sql)).rows);
  const exists = await client.query(
    "select to_regclass('supabase_migrations.schema_migrations') is not null as ok",
  );
  if (exists.rows[0].ok)
    history = (
      await client.query("select version from supabase_migrations.schema_migrations order by version")
    ).rows.map((r) => r.version);
} finally {
  await client.end();
}

let differences = 0;
const local = migrations.map((file) => file.slice(0, 14));
if (history === null) {
  console.log(
    "migration history: supabase_migrations.schema_migrations not found (not deployed with the Supabase CLI?)",
  );
  differences++;
} else if (JSON.stringify(history) !== JSON.stringify(local)) {
  console.log(
    `migration history differs\n  deployed:   ${history.join(", ")}\n  repository: ${local.join(", ")}`,
  );
  differences++;
} else {
  console.log(`migration history: ${history.length} migrations, same order as the repository`);
}

for (const key of [...Object.keys(QUERIES), ...Object.keys(STORAGE_QUERIES)]) {
  const want = new Map(expected[key].map((row) => [row.name, JSON.stringify(row)]));
  const have = new Map(deployed[key].map((row) => [row.name, JSON.stringify(row)]));
  let sectionDiffs = 0;
  for (const name of new Set([...want.keys(), ...have.keys()])) {
    if (want.get(name) === have.get(name)) continue;
    sectionDiffs++;
    console.log(
      `DIFF ${key}: ${name}\n  deployed:   ${have.get(name) ?? "(missing)"}\n  repository: ${want.get(name) ?? "(missing)"}`,
    );
  }
  differences += sectionDiffs;
  console.log(`${key}: ${have.size} deployed, ${want.size} expected, ${sectionDiffs} differences`);
}

console.log(
  differences === 0 ? "✓ The deployed schema matches the repository." : `✗ ${differences} difference(s).`,
);
process.exit(differences === 0 ? 0 : 1);
