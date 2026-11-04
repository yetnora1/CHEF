-- =============================================================================
-- CHEF SIS · Staff usernames, and an audit trail for sign-in details
-- =============================================================================
--   * profiles.username: optional, chosen by the staff member; no "@", which is
--     how the sign-in form tells it from an email address
--   * public.staff_login_email: the only way from a username to an email address.
--     Only the server's secret key may call it, so a browser can never look up
--     an email address or test whether a username exists (ADR 0005)
--   * public.record_account_change: Supabase Auth keeps passwords and email
--     addresses, outside this database, so the app records those changes here
-- =============================================================================

alter table public.profiles
  add column username text
    constraint profiles_username_unique unique
    constraint profiles_username_format check (username ~ '^[a-z0-9][a-z0-9._-]{1,30}[a-z0-9]$');

comment on column public.profiles.username is
  'Optional sign-in name, lower case. Same rule as src/features/account/rules.ts.';

-- The existing policy "profiles: update own" limits this to the staff member's own row.
grant update (username) on table public.profiles to authenticated;

create function private.audit_username_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.username is distinct from old.username then
    insert into public.audit_logs (actor_id, action, target_type, target_id)
    values ((select auth.uid()), 'account.username_changed', 'user', new.id::text);
  end if;
  return null;
end;
$$;

create trigger profiles_username_audit
  after update of username on public.profiles
  for each row execute function private.audit_username_change();

revoke execute on function private.audit_username_change() from public, anon, authenticated, service_role;

-- The signed-in staff member's own username, for their account page.
create function public.get_my_username()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select p.username from public.profiles p where p.id = (select auth.uid());
$$;

revoke all on function public.get_my_username() from public, anon, authenticated, service_role;
grant execute on function public.get_my_username() to authenticated;

-- From a username to the account's email address, for the server's sign-in only.
create function public.staff_login_email(p_username text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username = lower(btrim(p_username));
$$;

revoke all on function public.staff_login_email(text) from public, anon, authenticated, service_role;
grant execute on function public.staff_login_email(text) to service_role;

-- A password or email change, recorded against the signed-in staff member only.
create function public.record_account_change(p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor constant uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_kind not in ('password_changed', 'email_change_requested') then
    raise exception 'Unknown account change' using errcode = '22023';
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id)
  values (actor, 'account.' || p_kind, 'user', actor::text);
end;
$$;

revoke all on function public.record_account_change(text) from public, anon, authenticated, service_role;
grant execute on function public.record_account_change(text) to authenticated;
