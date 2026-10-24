-- =============================================================================
-- Chief Harena · Stage 1 · Identity, roles, permissions and audit log
-- =============================================================================
-- Security model (see docs/SECURITY_MODEL.md):
--   * Identities live in Supabase Auth (auth.users). Passwords are never stored here.
--   * Role assignments live in public.user_roles, separate from profiles, so an
--     ordinary profile update can never touch privilege data.
--   * The role → permission matrix lives in public.role_permissions and is changed
--     only through migrations.
--   * API roles (anon, authenticated) get NO write access to user_roles,
--     role_permissions or audit_logs. Role changes go through assign_role /
--     revoke_role, which authorize the caller explicitly.
--   * Supabase grants ALL on new public tables and functions to anon and
--     authenticated by default. Every object below revokes that first and grants
--     back only what is needed (least privilege), and RLS is enabled on every table.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Private schema for internal helpers.
-- It is NOT in the Data API's exposed schemas (supabase/config.toml [api].schemas),
-- so nothing here can be called over REST/RPC.
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;
-- RLS policies call private.has_permission() with the privileges of the querying
-- role, so authenticated needs USAGE on the schema (and EXECUTE on that function).
-- Postgres grants EXECUTE on new functions to PUBLIC, and per-schema default
-- privileges cannot revoke that, so every migration that adds a private function
-- must revoke it explicitly (tests/integration/db/schema.test.ts enforces this).
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Shared types
-- -----------------------------------------------------------------------------
-- Supported content/interface locales. Extend this domain (and src/i18n/routing.ts)
-- to add a language.
create domain public.locale_code as text
  constraint locale_code_supported check (value in ('en', 'am'));

create type public.app_role as enum (
  'owner',
  'admin',
  'content_editor',
  'event_manager',
  'analyst'
);

create type public.app_permission as enum (
  'admin.access',            -- enter the admin application
  'reports.read',            -- dashboards and aggregate reports
  'content.read',            -- read unpublished content in admin
  'content.write',           -- create and edit content
  'content.publish',         -- publish, unpublish, archive and delete content
  'media.write',             -- upload and manage media assets
  'translations.write',      -- edit localized content
  'bookings.read_all',       -- read every booking inquiry
  'bookings.read_assigned',  -- read inquiries assigned to oneself
  'bookings.write_all',      -- edit any booking inquiry
  'bookings.write_assigned', -- edit inquiries assigned to oneself
  'bookings.assign',         -- assign inquiries to staff
  'bookings.delete',         -- permanently delete inquiries (privacy erasure)
  'users.read',              -- list staff profiles and role assignments
  'users.manage',            -- grant/revoke non-privileged roles
  'users.manage_privileged', -- grant/revoke owner and admin roles
  'settings.manage',         -- manage public website settings
  'audit.read'               -- read the security audit log
);

-- -----------------------------------------------------------------------------
-- Generic trigger: maintain updated_at
-- -----------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles: non-privileged metadata for authenticated identities
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text constraint profiles_display_name_length check (char_length(display_name) <= 120),
  preferred_locale public.locale_code not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Non-privileged staff profile metadata. Never holds roles, permissions or credentials.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- user_roles: trusted role assignments (writes only via assign_role/revoke_role)
-- -----------------------------------------------------------------------------
create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create index user_roles_role_idx on public.user_roles (role);
create index user_roles_granted_by_idx on public.user_roles (granted_by);

comment on table public.user_roles is
  'Role assignments. No API role may write here directly; use public.assign_role / public.revoke_role.';

-- -----------------------------------------------------------------------------
-- role_permissions: the role → permission matrix (changed only via migrations)
-- Mirrors src/lib/permissions/matrix.ts; tests/db fails if they drift.
-- -----------------------------------------------------------------------------
create table public.role_permissions (
  role public.app_role not null,
  permission public.app_permission not null,
  primary key (role, permission)
);

insert into public.role_permissions (role, permission)
select 'owner'::public.app_role, p
from unnest(enum_range(null::public.app_permission)) as p;

insert into public.role_permissions (role, permission) values
  ('admin', 'admin.access'),
  ('admin', 'reports.read'),
  ('admin', 'content.read'),
  ('admin', 'content.write'),
  ('admin', 'content.publish'),
  ('admin', 'media.write'),
  ('admin', 'translations.write'),
  ('admin', 'bookings.read_all'),
  ('admin', 'bookings.write_all'),
  ('admin', 'bookings.assign'),
  ('admin', 'users.read'),
  ('admin', 'users.manage'),
  ('admin', 'settings.manage'),
  ('admin', 'audit.read'),

  ('content_editor', 'admin.access'),
  ('content_editor', 'content.read'),
  ('content_editor', 'content.write'),
  ('content_editor', 'content.publish'),
  ('content_editor', 'media.write'),
  ('content_editor', 'translations.write'),

  ('event_manager', 'admin.access'),
  ('event_manager', 'bookings.read_assigned'),
  ('event_manager', 'bookings.write_assigned'),

  ('analyst', 'admin.access'),
  ('analyst', 'reports.read');

-- -----------------------------------------------------------------------------
-- audit_logs: append-only record of security-sensitive administrative events
-- actor_id intentionally has no foreign key so entries survive account deletion.
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  action text not null constraint audit_logs_action_format check (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
  target_type text,
  target_id text,
  details jsonb not null default '{}'::jsonb
);

create index audit_logs_occurred_at_idx on public.audit_logs (occurred_at desc);
create index audit_logs_actor_id_idx on public.audit_logs (actor_id);

create function private.prevent_audit_log_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute function private.prevent_audit_log_mutation();

create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function private.prevent_audit_log_mutation();

-- -----------------------------------------------------------------------------
-- Authorization helpers
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER so policies on user_roles can call it without recursing into
-- user_roles' own RLS. Fixed empty search_path and fully qualified names prevent
-- search-path hijacking. It only ever answers for auth.uid(), never for a
-- caller-supplied user id.
create function private.has_permission(requested public.app_permission)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = (select auth.uid())
      and rp.permission = requested
  );
$$;

revoke all on function private.has_permission(public.app_permission) from public;
grant execute on function private.has_permission(public.app_permission) to authenticated;

-- The signed-in user's own roles and effective permissions. The Next.js server
-- calls this to make authorization decisions.
create function public.get_my_access()
returns table (roles public.app_role[], permissions public.app_permission[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(
      (select array_agg(ur.role order by ur.role)
       from public.user_roles ur
       where ur.user_id = (select auth.uid())),
      '{}'::public.app_role[]
    ),
    coalesce(
      (select array_agg(distinct rp.permission order by rp.permission)
       from public.user_roles ur
       join public.role_permissions rp on rp.role = ur.role
       where ur.user_id = (select auth.uid())),
      '{}'::public.app_permission[]
    );
$$;

revoke all on function public.get_my_access() from public, anon, authenticated;
grant execute on function public.get_my_access() to authenticated;

-- -----------------------------------------------------------------------------
-- Role management (the only write path into user_roles for API callers)
-- -----------------------------------------------------------------------------
-- Every role change takes this transaction-scoped lock FIRST, before any
-- authorization check, so checks always read committed state: an owner or
-- admin demoted by a concurrent transaction cannot complete a change that
-- passed authorization on a stale snapshot, and two owners cannot remove each
-- other concurrently.
create function private.lock_role_changes()
returns void
language sql
volatile
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtext('public.user_roles'));
$$;

create function private.assert_can_manage_roles_of(target_user_id uuid, role_in_question public.app_role)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if target_user_id is null then
    raise exception 'A target user is required' using errcode = '22004';
  end if;

  -- Nobody may change their own privileges, in either direction.
  if target_user_id = actor then
    raise exception 'You cannot change your own roles' using errcode = '42501';
  end if;

  if not private.has_permission('users.manage') then
    raise exception 'Not authorized to manage staff roles' using errcode = '42501';
  end if;

  -- Granting/revoking owner or admin, or touching an existing owner/admin
  -- account at all, is an owner-level operation.
  if (
    role_in_question in ('owner', 'admin')
    or exists (
      select 1 from public.user_roles
      where user_id = target_user_id and role in ('owner', 'admin')
    )
  ) and not private.has_permission('users.manage_privileged') then
    raise exception 'Not authorized to manage privileged roles' using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.assert_can_manage_roles_of(uuid, public.app_role) from public;

create function public.assign_role(target_user_id uuid, new_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  perform private.lock_role_changes();
  perform private.assert_can_manage_roles_of(target_user_id, new_role);

  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (target_user_id, new_role, (select auth.uid()))
  on conflict (user_id, role) do nothing;

  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'role.assigned', 'user', target_user_id::text,
            jsonb_build_object('role', new_role));
  end if;
end;
$$;

create function public.revoke_role(target_user_id uuid, old_role public.app_role)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  perform private.lock_role_changes();
  perform private.assert_can_manage_roles_of(target_user_id, old_role);

  if old_role = 'owner'
     and (select count(*) from public.user_roles where role = 'owner' and user_id <> target_user_id) = 0 then
    raise exception 'The last owner cannot be removed' using errcode = '42501';
  end if;

  delete from public.user_roles
  where user_id = target_user_id and role = old_role;

  get diagnostics deleted_count = row_count;

  if deleted_count > 0 then
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'role.revoked', 'user', target_user_id::text,
            jsonb_build_object('role', old_role));
  end if;
end;
$$;

revoke all on function public.assign_role(uuid, public.app_role) from public, anon, authenticated;
revoke all on function public.revoke_role(uuid, public.app_role) from public, anon, authenticated;
grant execute on function public.assign_role(uuid, public.app_role) to authenticated;
grant execute on function public.revoke_role(uuid, public.app_role) to authenticated;

-- One-time bootstrap of the first owner. Run as the database owner from the
-- Supabase SQL editor or psql; no API role can execute it, and it refuses to run
-- once any owner exists.
--   select private.bootstrap_first_owner('owner@example.com');
create function private.bootstrap_first_owner(owner_email text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  target uuid;
begin
  perform private.lock_role_changes();

  if exists (select 1 from public.user_roles where role = 'owner') then
    raise exception 'An owner already exists; use public.assign_role instead';
  end if;

  select id into target from auth.users where lower(email) = lower(owner_email);

  if target is null then
    raise exception 'No auth user with email %', owner_email;
  end if;

  insert into public.user_roles (user_id, role, granted_by) values (target, 'owner', null);

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values (null, 'role.bootstrap_owner', 'user', target::text, jsonb_build_object('role', 'owner'));

  return target;
end;
$$;

revoke all on function private.bootstrap_first_owner(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Create a profile for every new auth user.
-- Only display_name is read from user-supplied metadata; roles are never derived
-- from metadata.
-- -----------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 120), '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Privileges and Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.audit_logs enable row level security;

revoke all on table public.profiles, public.user_roles, public.role_permissions, public.audit_logs
  from anon, authenticated;
revoke all on sequence public.audit_logs_id_seq from anon, authenticated, service_role;

-- service_role (the server-side secret key) bypasses RLS but not privileges. It
-- keeps read access, but privilege and audit tables are written only through the
-- SECURITY DEFINER functions above, so even a leaked secret key or a server bug
-- cannot grant roles without the assign_role rules or forge/erase audit entries.
revoke insert, update, delete, truncate on table public.user_roles, public.role_permissions, public.audit_logs
  from service_role;

-- profiles: read own row (or all, with users.read); update only safe columns of own row.
grant select on table public.profiles to authenticated;
grant update (display_name, preferred_locale) on table public.profiles to authenticated;

create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: staff managers read all"
  on public.profiles for select to authenticated
  using ((select private.has_permission('users.read')));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- user_roles: read-only for API roles.
grant select on table public.user_roles to authenticated;

create policy "user_roles: read own"
  on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_roles: staff managers read all"
  on public.user_roles for select to authenticated
  using ((select private.has_permission('users.read')));

-- role_permissions: readable by staff managers only.
grant select on table public.role_permissions to authenticated;

create policy "role_permissions: staff managers read"
  on public.role_permissions for select to authenticated
  using ((select private.has_permission('users.read')));

-- audit_logs: readable with audit.read; written only by SECURITY DEFINER functions.
grant select on table public.audit_logs to authenticated;

create policy "audit_logs: auditors read"
  on public.audit_logs for select to authenticated
  using ((select private.has_permission('audit.read')));

-- Private helpers are internal: revoke the default PUBLIC execute from all of
-- them, then re-grant the one function RLS policies need.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_permission(public.app_permission) to authenticated;
