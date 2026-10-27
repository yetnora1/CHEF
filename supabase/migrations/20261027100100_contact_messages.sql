-- =============================================================================
-- Chef Harena · Stage 3.7 · Website contact messages
-- =============================================================================
-- The /contact form, for questions that are not an event inquiry. Follows the
-- inquiry pattern (docs/INQUIRIES.md):
--   * public.submit_contact_message(): the ONLY write path, executable only by
--     service_role (the server secret key) from the Next.js server action,
--     after validation, rate limiting and CAPTCHA; idempotent per submission key
--   * service_role has no table privileges on contact_messages
--   * staff with messages.read see the inbox (SECURITY INVOKER reads, so RLS
--     applies); messages.write marks a message handled or new again through an
--     audited SECURITY DEFINER function. Nobody edits a submitted message.
-- Owner and admin receive both permissions; no other role sees messages.
-- =============================================================================

create type public.contact_message_status as enum ('new', 'handled');

create table public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  -- Short, non-sequential reference that is safe to show to the sender.
  reference text not null
    default ('CM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)))
    constraint contact_messages_reference_unique unique,
  status public.contact_message_status not null default 'new',
  contact_name text not null
    constraint contact_messages_contact_name_length check (char_length(contact_name) between 1 and 160),
  -- Same address rule as bookings: nothing that could smuggle parameters into a mailto: link.
  contact_email text not null constraint contact_messages_contact_email_format check (
    char_length(contact_email) <= 254
    and contact_email ~ '^[A-Za-z0-9_''+.-]+@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$'
  ),
  contact_phone text constraint contact_messages_contact_phone_length check (char_length(contact_phone) <= 40),
  subject text constraint contact_messages_subject_length check (char_length(subject) <= 150),
  message text not null
    constraint contact_messages_message_length check (char_length(message) between 1 and 3000),
  preferred_locale public.locale_code not null default 'en',
  -- When the sender accepted the privacy notice. Required for every message.
  consent_given_at timestamptz not null,
  -- Client-generated idempotency key: a retried submission returns the original message.
  submission_key uuid not null constraint contact_messages_submission_key_unique unique,
  submission_fingerprint text not null,
  handled_at timestamptz,
  handled_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contact_messages_status_created_idx on public.contact_messages (status, created_at desc);

comment on table public.contact_messages is
  'Private website contact messages. Never exposed to anon; staff need messages.read.';
comment on column public.contact_messages.status is
  'Changed only through public.set_contact_message_status (audited).';

create trigger contact_messages_set_updated_at
  before update on public.contact_messages
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Role matrix (mirrored by src/lib/permissions/matrix.ts; tested for drift)
-- -----------------------------------------------------------------------------
insert into public.role_permissions (role, permission) values
  ('owner', 'messages.read'),
  ('owner', 'messages.write'),
  ('admin', 'messages.read'),
  ('admin', 'messages.write');

-- -----------------------------------------------------------------------------
-- Public submission path (service_role only)
-- -----------------------------------------------------------------------------
create function public.submit_contact_message(
  p_submission_key uuid,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_subject text,
  p_message text,
  p_preferred_locale public.locale_code,
  p_consent boolean
)
returns table (message_reference text, is_replay boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_contact_email));
  v_phone text := nullif(btrim(p_contact_phone), '');
  v_subject text := nullif(btrim(p_subject), '');
  v_message text := btrim(p_message);
  v_fingerprint text;
  v_existing_reference text;
  v_existing_fingerprint text;
  v_reference text;
begin
  -- The server action validates and normalises first; these guards keep the
  -- function safe on its own. Status and handling are not parameters.
  if p_submission_key is null then
    raise exception 'A submission key is required' using errcode = '22023';
  end if;
  if p_consent is not true then
    raise exception 'Consent is required' using errcode = '22023';
  end if;

  -- A JSON array keeps field positions (and NULLs) distinct.
  v_fingerprint := encode(sha256(convert_to(jsonb_build_array(
    v_email, btrim(p_contact_name), v_phone, v_subject, v_message, p_preferred_locale)::text, 'UTF8')), 'hex');

  insert into public.contact_messages (
    contact_name, contact_email, contact_phone, subject, message, preferred_locale,
    consent_given_at, submission_key, submission_fingerprint
  ) values (
    btrim(p_contact_name), v_email, v_phone, v_subject, v_message, p_preferred_locale,
    now(), p_submission_key, v_fingerprint
  )
  on conflict (submission_key) do nothing
  returning reference into v_reference;

  if v_reference is null then
    -- Idempotent replay: same key + same content returns the original message.
    select m.reference, m.submission_fingerprint into v_existing_reference, v_existing_fingerprint
    from public.contact_messages m where m.submission_key = p_submission_key;
    if v_existing_fingerprint = v_fingerprint then
      return query select v_existing_reference, true;
      return;
    end if;
    raise exception 'Submission key already used' using errcode = '23505';
  end if;

  return query select v_reference, false;
end;
$$;

-- -----------------------------------------------------------------------------
-- Staff functions
-- -----------------------------------------------------------------------------
-- Reads run as the caller (SECURITY INVOKER): without messages.read, RLS
-- returns no rows.
create function public.list_contact_messages(
  p_status public.contact_message_status default null,
  p_search text default null,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  reference text,
  status public.contact_message_status,
  contact_name text,
  contact_email text,
  contact_phone text,
  subject text,
  message text,
  preferred_locale public.locale_code,
  handled_at timestamptz,
  handled_by_name text,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select case
      when nullif(btrim(p_search), '') is null then null
      -- Escape LIKE wildcards so the search term is matched literally.
      else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    end as pattern
  ),
  filtered as (
    select m.*
    from public.contact_messages m, params
    where (p_status is null or m.status = p_status)
      and (params.pattern is null
           or m.reference ilike params.pattern
           or m.contact_name ilike params.pattern
           or m.contact_email ilike params.pattern
           or m.subject ilike params.pattern
           or m.message ilike params.pattern)
  )
  select f.id, f.reference, f.status, f.contact_name, f.contact_email, f.contact_phone, f.subject,
         f.message, f.preferred_locale, f.handled_at, private.staff_display_name(f.handled_by),
         f.created_at, count(*) over ()
  from filtered f
  order by f.created_at desc, f.id
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.contact_message_counts()
returns table (status public.contact_message_status, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select m.status, count(*) from public.contact_messages m group by m.status;
$$;

create function public.set_contact_message_status(
  p_message_id uuid,
  p_status public.contact_message_status
)
returns public.contact_message_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.contact_message_status;
  v_reference text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.has_permission('messages.write') then
    raise exception 'Not authorized to update messages' using errcode = '42501';
  end if;
  if p_status is null then
    raise exception 'A status is required' using errcode = '22023';
  end if;

  select m.status, m.reference into v_current, v_reference
  from public.contact_messages m where m.id = p_message_id
  for update;

  if not found then
    raise exception 'Message not found' using errcode = 'P0002';
  end if;

  if v_current = p_status then
    return p_status;
  end if;

  update public.contact_messages
  set status = p_status,
      handled_at = case when p_status = 'handled' then now() end,
      handled_by = case when p_status = 'handled' then (select auth.uid()) end
  where id = p_message_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'contact_message.status_changed', 'contact_message', v_reference,
          jsonb_build_object('from', v_current, 'to', p_status));

  return p_status;
end;
$$;

-- -----------------------------------------------------------------------------
-- Privileges and Row Level Security
-- -----------------------------------------------------------------------------
alter table public.contact_messages enable row level security;

-- The server secret key cannot read or write messages directly, and staff
-- change them only through set_contact_message_status.
revoke all on table public.contact_messages from anon, authenticated, service_role;
grant select on table public.contact_messages to authenticated;

create policy "contact_messages: read with permission"
  on public.contact_messages for select to authenticated
  using ((select private.has_permission('messages.read')));

revoke all on function
  public.submit_contact_message(uuid, text, text, text, text, text, public.locale_code, boolean),
  public.list_contact_messages(public.contact_message_status, text, integer, integer),
  public.contact_message_counts(),
  public.set_contact_message_status(uuid, public.contact_message_status)
from public, anon, authenticated, service_role;

grant execute on function
  public.submit_contact_message(uuid, text, text, text, text, text, public.locale_code, boolean)
to service_role;

grant execute on function
  public.list_contact_messages(public.contact_message_status, text, integer, integer),
  public.contact_message_counts(),
  public.set_contact_message_status(uuid, public.contact_message_status)
to authenticated;
