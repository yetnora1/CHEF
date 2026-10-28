-- =============================================================================
-- CHEF SIS · Stage 4 · Staff & roles, site settings, audit log
-- =============================================================================
-- * list_staff: every account with its email, roles and sign-in times, for
--   staff managers (users.read). SECURITY DEFINER only because emails and
--   sign-in times live in auth.users, which no API role can read.
-- * set_user_roles: applies one person's new set of roles in a single
--   transaction by calling assign_role / revoke_role, so every existing rule
--   (users.manage, privileged roles, no self-changes, the last owner) and audit
--   entry still applies. SECURITY INVOKER: it adds no privilege of its own.
-- * site_settings: one row of non-secret public settings (contact details,
--   social links, the switch that opens or pauses event inquiries). Visitors
--   read it only through public_site_settings(); settings.manage edits it;
--   every save is versioned and audited.
-- * list_audit_log: paged, filtered reads of the audit log. SECURITY INVOKER:
--   audit.read (RLS) still decides what anyone sees.
-- * service_role loses the default table privileges it kept on profiles
--   (VERIFICATION.md W10): nothing server-side reads profiles with the secret key.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Staff and roles
-- -----------------------------------------------------------------------------
create function public.list_staff()
returns table (
  user_id uuid,
  email text,
  display_name text,
  roles public.app_role[],
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('users.read') then
    raise exception 'Not authorized to list staff' using errcode = '42501';
  end if;

  return query
    select u.id,
           u.email::text,
           nullif(btrim(p.display_name), ''),
           coalesce(
             (select array_agg(ur.role order by ur.role)
              from public.user_roles ur
              where ur.user_id = u.id),
             '{}'::public.app_role[]
           ),
           u.created_at,
           u.last_sign_in_at
    from auth.users u
    left join public.profiles p on p.id = u.id
    order by lower(coalesce(nullif(btrim(p.display_name), ''), u.email::text));
end;
$$;

-- Applies the difference between a person's roles and `new_roles`: one RPC is
-- one transaction, so either every change happens or none does.
create function public.set_user_roles(target_user_id uuid, new_roles public.app_role[])
returns public.app_role[]
language plpgsql
security invoker
set search_path = ''
as $$
declare
  wanted public.app_role[] := array(
    select distinct requested
    from unnest(coalesce(new_roles, '{}'::public.app_role[])) as requested
    order by requested
  );
  current_roles public.app_role[];
  one_role public.app_role;
begin
  if target_user_id is null then
    raise exception 'A target user is required' using errcode = '22004';
  end if;

  if not private.has_permission('users.manage') then
    raise exception 'Not authorized to manage staff roles' using errcode = '42501';
  end if;

  -- The lock assign_role / revoke_role take, taken first so the roles read
  -- below include every change committed by a concurrent transaction.
  perform pg_advisory_xact_lock(hashtext('public.user_roles'));

  select coalesce(array_agg(ur.role order by ur.role), '{}'::public.app_role[])
  into current_roles
  from public.user_roles ur
  where ur.user_id = target_user_id;

  foreach one_role in array wanted loop
    if not (one_role = any (current_roles)) then
      perform public.assign_role(target_user_id, one_role);
    end if;
  end loop;

  foreach one_role in array current_roles loop
    if not (one_role = any (wanted)) then
      perform public.revoke_role(target_user_id, one_role);
    end if;
  end loop;

  return wanted;
end;
$$;

revoke all on function public.list_staff() from public, anon, authenticated, service_role;
revoke all on function public.set_user_roles(uuid, public.app_role[]) from public, anon, authenticated, service_role;
grant execute on function public.list_staff() to authenticated;
grant execute on function public.set_user_roles(uuid, public.app_role[]) to authenticated;

-- The secret key has never needed staff profiles (W10).
revoke all on table public.profiles from service_role;

-- -----------------------------------------------------------------------------
-- 2. Site settings (a single row)
-- -----------------------------------------------------------------------------
create table public.site_settings (
  id boolean primary key default true
    constraint site_settings_single_row check (id),
  contact_email text
    constraint site_settings_email_format check (
      contact_email is null
      or (char_length(contact_email) <= 254
          and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')),
  contact_phone text
    constraint site_settings_phone_format check (contact_phone is null or contact_phone ~ '^\+?[0-9 ().-]{7,40}$'),
  whatsapp_phone text
    constraint site_settings_whatsapp_format check (whatsapp_phone is null or whatsapp_phone ~ '^\+?[0-9 ().-]{7,40}$'),
  telegram_username text
    constraint site_settings_telegram_format check (
      telegram_username is null or telegram_username ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$'),
  -- The city or area served, per language. Amharic reaches visitors only once
  -- a fluent speaker's review is confirmed (location_am_reviewed_at).
  location_en text
    constraint site_settings_location_en_length check (char_length(location_en) between 1 and 120),
  location_am text
    constraint site_settings_location_am_length check (char_length(location_am) between 1 and 120),
  location_am_reviewed_at timestamptz,
  location_am_reviewed_by uuid references auth.users (id) on delete set null,
  -- Links to the business's own pages on each platform (https, that platform only).
  instagram_url text
    constraint site_settings_instagram_url check (
      instagram_url is null
      or (char_length(instagram_url) <= 300 and instagram_url ~ '^https://(www\.)?instagram\.com/[^[:space:]]+$')),
  facebook_url text
    constraint site_settings_facebook_url check (
      facebook_url is null
      or (char_length(facebook_url) <= 300 and facebook_url ~ '^https://((www|m)\.)?facebook\.com/[^[:space:]]+$')),
  tiktok_url text
    constraint site_settings_tiktok_url check (
      tiktok_url is null
      or (char_length(tiktok_url) <= 300 and tiktok_url ~ '^https://(www\.)?tiktok\.com/@[^[:space:]]+$')),
  youtube_url text
    constraint site_settings_youtube_url check (
      youtube_url is null
      or (char_length(youtube_url) <= 300 and youtube_url ~ '^https://(www\.)?youtube\.com/[^[:space:]]+$')),
  -- false pauses new event inquiries (the form says so and refuses submissions).
  inquiries_open boolean not null default true,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

comment on table public.site_settings is
  'One row of non-secret public website settings. Read publicly only through public_site_settings().';

insert into public.site_settings (id) values (true);

-- Version, time, editor and the Amharic review are stamped here; clients cannot
-- set them. As for CMS translations, a review counts only when this write
-- confirms it (a new value): changing the Amharic text otherwise clears it.
create function private.stamp_site_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := (select auth.uid());

  if new.location_am is null then
    new.location_am_reviewed_at := null;
    new.location_am_reviewed_by := null;
  elsif new.location_am_reviewed_at is distinct from old.location_am_reviewed_at then
    if new.location_am_reviewed_at is not null then
      new.location_am_reviewed_at := now();
      new.location_am_reviewed_by := (select auth.uid());
    else
      new.location_am_reviewed_by := null;
    end if;
  elsif new.location_am is distinct from old.location_am then
    new.location_am_reviewed_at := null;
    new.location_am_reviewed_by := null;
  else
    new.location_am_reviewed_by := old.location_am_reviewed_by;
  end if;

  return new;
end;
$$;

create trigger site_settings_stamp
  before update on public.site_settings
  for each row execute function private.stamp_site_settings();

-- One audit entry per save that changed something, naming the fields only.
create function private.audit_site_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed text[];
begin
  select coalesce(array_agg(n.key order by n.key), '{}')
  into changed
  from jsonb_each(to_jsonb(new)) as n
  where n.key not in ('id', 'version', 'updated_at', 'updated_by', 'location_am_reviewed_by')
    and (to_jsonb(old) -> n.key) is distinct from n.value;

  if cardinality(changed) > 0 then
    insert into public.audit_logs (actor_id, action, target_type, target_id, details)
    values ((select auth.uid()), 'settings.updated', 'site_settings', 'site',
            jsonb_build_object('fields', to_jsonb(changed)));
  end if;
  return null;
end;
$$;

create trigger site_settings_audit
  after update on public.site_settings
  for each row execute function private.audit_site_settings();

alter table public.site_settings enable row level security;

revoke all on table public.site_settings from anon, authenticated, service_role;

-- Staff with settings.manage read the whole row and edit the public columns.
-- No API role may insert or delete: the single row comes from this migration.
grant select on table public.site_settings to authenticated;
grant update (
  contact_email, contact_phone, whatsapp_phone, telegram_username,
  location_en, location_am, location_am_reviewed_at,
  instagram_url, facebook_url, tiktok_url, youtube_url,
  inquiries_open
) on table public.site_settings to authenticated;

create policy "site_settings: managers read"
  on public.site_settings for select to authenticated
  using ((select private.has_permission('settings.manage')));

create policy "site_settings: managers update"
  on public.site_settings for update to authenticated
  using ((select private.has_permission('settings.manage')))
  with check ((select private.has_permission('settings.manage')));

-- The public website's only read path: the public columns, with the Amharic
-- location only once reviewed. DEFINER so visitors need no table privilege.
create function public.public_site_settings()
returns table (
  contact_email text,
  contact_phone text,
  whatsapp_phone text,
  telegram_username text,
  location_en text,
  location_am text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  youtube_url text,
  inquiries_open boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.contact_email, s.contact_phone, s.whatsapp_phone, s.telegram_username,
         s.location_en,
         case when s.location_am_reviewed_at is not null then s.location_am end,
         s.instagram_url, s.facebook_url, s.tiktok_url, s.youtube_url,
         s.inquiries_open
  from public.site_settings s
  where s.id;
$$;

-- Staff reads for the settings form (RLS: settings.manage), with who saved last.
create function public.get_site_settings()
returns table (
  contact_email text,
  contact_phone text,
  whatsapp_phone text,
  telegram_username text,
  location_en text,
  location_am text,
  location_am_reviewed_at timestamptz,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  youtube_url text,
  inquiries_open boolean,
  version integer,
  updated_at timestamptz,
  updated_by_name text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.contact_email, s.contact_phone, s.whatsapp_phone, s.telegram_username,
         s.location_en, s.location_am, s.location_am_reviewed_at,
         s.instagram_url, s.facebook_url, s.tiktok_url, s.youtube_url,
         s.inquiries_open, s.version, s.updated_at,
         private.staff_display_name(s.updated_by)
  from public.site_settings s
  where s.id;
$$;

revoke all on function public.public_site_settings() from public, anon, authenticated, service_role;
revoke all on function public.get_site_settings() from public, anon, authenticated, service_role;
grant execute on function public.public_site_settings() to anon, authenticated;
grant execute on function public.get_site_settings() to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Audit log reads
-- -----------------------------------------------------------------------------
-- Newest first, keyset-paged (p_before = the last id already shown). A category
-- is the part of the action before the first dot (role, booking, content…).
create function public.list_audit_log(
  p_category text default null,
  p_actor uuid default null,
  p_before bigint default null,
  p_limit integer default 50
)
returns table (
  id bigint,
  occurred_at timestamptz,
  actor_id uuid,
  actor_name text,
  action text,
  target_type text,
  target_id text,
  target_name text,
  details jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.id, a.occurred_at, a.actor_id, private.staff_display_name(a.actor_id),
         a.action, a.target_type, a.target_id,
         case when a.target_type = 'user'
                   and a.target_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then private.staff_display_name(a.target_id::uuid) end,
         a.details
  from public.audit_logs a
  where (p_category is null or (p_category ~ '^[a-z_]+$' and starts_with(a.action, p_category || '.')))
    and (p_actor is null or a.actor_id = p_actor)
    and (p_before is null or a.id < p_before)
  order by a.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 101);
$$;

revoke all on function public.list_audit_log(text, uuid, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.list_audit_log(text, uuid, bigint, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Private helpers stay internal (Postgres grants EXECUTE to PUBLIC by default).
-- -----------------------------------------------------------------------------
revoke execute on function private.stamp_site_settings() from public, anon, authenticated;
revoke execute on function private.audit_site_settings() from public, anon, authenticated;
