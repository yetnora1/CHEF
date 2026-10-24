-- =============================================================================
-- Chief Harena · Stage 2 · Event inquiry workflow
-- =============================================================================
-- Builds on public.bookings (Stage 1). Adds:
--   * inquiry fields, a submission idempotency key and a possible-duplicate link
--   * booking_status_history (trigger-written) and booking_notes (internal)
--   * validated lifecycle transitions
--   * public.submit_inquiry(): the ONLY write path for website inquiries,
--     executable only by service_role (the server secret key) and only from
--     the Next.js server action after validation, rate limiting and CAPTCHA
--   * a Postgres-backed rate limiter shared by every app instance
--   * a notification outbox for optional transactional email
--   * typed admin functions: listing/detail (SECURITY INVOKER, so RLS applies)
--     and status/assignment/notes (SECURITY DEFINER with explicit authorization,
--     audited)
-- service_role loses all direct table access to booking data. A leaked secret
-- key can still create inquiries (submit_inquiry), consume rate-limit counters,
-- and read/complete queued notifications (recipient email and event summary),
-- and it carries full Supabase Auth admin rights: treat it as a top-level secret.
-- Staff (authenticated) can no longer INSERT or UPDATE bookings directly: every
-- write goes through an audited function; erasure (DELETE) is audited by trigger.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Booking columns
-- -----------------------------------------------------------------------------
create type public.contact_method as enum ('email', 'phone', 'messaging_app');

alter table public.bookings
  add column preferred_contact_method public.contact_method not null default 'email',
  add column service_requirements text
    constraint bookings_service_requirements_length check (char_length(service_requirements) <= 2000),
  -- 'website' rows come only from submit_inquiry; staff-created rows default to 'staff'.
  add column source text not null default 'staff'
    constraint bookings_source_valid check (source in ('website', 'staff')),
  -- Client-generated idempotency key: a retried submission returns the original inquiry.
  add column submission_key uuid constraint bookings_submission_key_unique unique,
  add column submission_fingerprint text,
  -- Set when the same email asked about the same event type and date within 7 days.
  -- A hint for staff only: repeat customers are never rejected as duplicates.
  add column possible_duplicate_of uuid references public.bookings (id) on delete set null;

create index bookings_contact_email_lower_idx on public.bookings (lower(contact_email));
create index bookings_created_at_idx on public.bookings (created_at desc);

comment on column public.bookings.status is
  'Changed only through public.change_booking_status (validated transitions, history, audit).';

-- All staff writes go through audited functions (status, assignment, notes;
-- detail edits in a later stage). Revoking the table privilege also removes the
-- Stage 1 column-level INSERT/UPDATE grants, and the matching policies go too.
revoke insert, update on table public.bookings from authenticated;
drop policy "bookings: staff create" on public.bookings;
drop policy "bookings: edit all with permission" on public.bookings;
drop policy "bookings: edit assigned" on public.bookings;

-- Stricter address rule (mirrors the app's validator): no characters that could
-- smuggle parameters into a mailto: link (?, &, =, %, quotes, angle brackets).
alter table public.bookings
  drop constraint bookings_contact_email_format,
  add constraint bookings_contact_email_format check (
    char_length(contact_email) <= 254
    and contact_email ~ '^[A-Za-z0-9_''+.-]+@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$'
  );

-- -----------------------------------------------------------------------------
-- 2. Lifecycle transitions (mirrored by src/features/bookings/status.ts; tested)
-- -----------------------------------------------------------------------------
create function private.is_allowed_booking_transition(
  from_status public.booking_status,
  to_status public.booking_status
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select (from_status::text, to_status::text) in (
    ('new', 'in_review'), ('new', 'contacted'), ('new', 'declined'), ('new', 'cancelled'),
    ('in_review', 'contacted'), ('in_review', 'quoted'), ('in_review', 'declined'), ('in_review', 'cancelled'),
    ('contacted', 'quoted'), ('contacted', 'confirmed'), ('contacted', 'declined'), ('contacted', 'cancelled'),
    ('quoted', 'contacted'), ('quoted', 'confirmed'), ('quoted', 'declined'), ('quoted', 'cancelled'),
    ('confirmed', 'completed'), ('confirmed', 'cancelled'),
    ('declined', 'in_review'), ('cancelled', 'in_review')
  );
$$;

create function private.enforce_booking_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     and not private.is_allowed_booking_transition(old.status, new.status) then
    raise exception 'Invalid booking status transition' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger bookings_enforce_transition
  before update of status on public.bookings
  for each row execute function private.enforce_booking_transition();

-- -----------------------------------------------------------------------------
-- 3. Status history (append-only for API roles; removed only with its booking)
-- -----------------------------------------------------------------------------
create table public.booking_status_history (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings (id) on delete cascade,
  from_status public.booking_status,
  to_status public.booking_status not null,
  -- Staff member who made the change; null for website submissions. No foreign
  -- key, so history survives staff account deletion.
  changed_by uuid,
  note text constraint booking_status_history_note_length check (char_length(note) <= 1000),
  changed_at timestamptz not null default now()
);

create index booking_status_history_booking_idx on public.booking_status_history (booking_id, changed_at);

create function private.record_booking_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.booking_status_history (booking_id, from_status, to_status, changed_by, note)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status end,
      new.status,
      (select auth.uid()),
      nullif(current_setting('chief.booking_status_note', true), '')
    );
  end if;
  return null;
end;
$$;

create trigger bookings_record_status
  after insert or update of status on public.bookings
  for each row execute function private.record_booking_status();

-- Privacy erasure (owner DELETE) is recorded without personal data.
create function private.audit_booking_erasure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'booking.erased', 'booking', old.reference,
          jsonb_build_object('status', old.status, 'source', old.source));
  return null;
end;
$$;

create trigger bookings_audit_erasure
  after delete on public.bookings
  for each row execute function private.audit_booking_erasure();

-- -----------------------------------------------------------------------------
-- 4. Internal notes (staff only; immutable once written)
-- -----------------------------------------------------------------------------
create table public.booking_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  author_id uuid not null,
  body text not null constraint booking_notes_body_length check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index booking_notes_booking_idx on public.booking_notes (booking_id, created_at);

-- -----------------------------------------------------------------------------
-- 5. Private infrastructure: rate limits and notification outbox
--    (private schema: never exposed through the Data API)
-- -----------------------------------------------------------------------------
create table private.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  expires_at timestamptz not null,
  primary key (bucket, window_start)
);

create index rate_limits_expires_idx on private.rate_limits (expires_at);

create type public.notification_kind as enum ('customer_acknowledgement', 'staff_new_inquiry');
create type public.notification_status as enum ('pending', 'sending', 'sent', 'failed');

create table private.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  kind public.notification_kind not null,
  status public.notification_status not null default 'pending',
  attempts integer not null default 0,
  last_error text constraint notification_outbox_error_length check (char_length(last_error) <= 500),
  provider_message_id text,
  locked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  -- One message of each kind per inquiry, however often delivery is retried.
  constraint notification_outbox_once_per_kind unique (booking_id, kind)
);

create index notification_outbox_due_idx on private.notification_outbox (created_at)
  where status in ('pending', 'failed', 'sending');

-- -----------------------------------------------------------------------------
-- 6. Authorization helpers
-- -----------------------------------------------------------------------------
create function private.can_write_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
    where b.id = p_booking_id
      and (
        private.has_permission('bookings.write_all')
        or (b.assigned_to = (select auth.uid()) and private.has_permission('bookings.write_assigned'))
      )
  );
$$;

-- Display name for a staff account (profile name, else the email's local part).
-- Used inside RLS-scoped admin reads; returns nothing for unknown ids.
create function private.staff_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(p.display_name), ''), split_part(u.email, '@', 1))
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user_id;
$$;

-- -----------------------------------------------------------------------------
-- 7. Public submission path (service_role only)
-- -----------------------------------------------------------------------------
create function public.consume_rate_limit(p_bucket text, p_limit integer, p_window_seconds integer)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window_start timestamptz;
  v_window_end timestamptz;
  v_hits integer;
begin
  if p_bucket is null or char_length(p_bucket) not between 1 and 200
     or p_limit is null or p_limit < 1
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit request' using errcode = '22023';
  end if;

  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_window_end := v_window_start + make_interval(secs => p_window_seconds);

  insert into private.rate_limits as r (bucket, window_start, hits, expires_at)
  values (p_bucket, v_window_start, 1, v_window_end)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  -- Bounded opportunistic cleanup of expired windows.
  delete from private.rate_limits
  where ctid in (select ctid from private.rate_limits where expires_at < now() limit 500);

  return query select
    v_hits <= p_limit,
    case when v_hits <= p_limit then 0
         else greatest(1, ceil(extract(epoch from (v_window_end - now())))::integer) end;
end;
$$;

create function public.submit_inquiry(
  p_submission_key uuid,
  p_contact_name text,
  p_contact_email text,
  p_contact_phone text,
  p_preferred_contact_method public.contact_method,
  p_event_type public.event_type,
  p_event_date date,
  p_guest_count integer,
  p_venue text,
  p_service_requirements text,
  p_message text,
  p_preferred_locale public.locale_code,
  p_consent boolean,
  p_notify boolean default false
)
returns table (inquiry_reference text, is_replay boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Africa/Addis_Ababa')::date;
  v_email text := lower(btrim(p_contact_email));
  v_phone text := nullif(btrim(p_contact_phone), '');
  v_fingerprint text;
  v_existing_reference text;
  v_existing_fingerprint text;
  v_duplicate uuid;
  v_id uuid;
  v_reference text;
begin
  -- The server action validates and normalises first; these guards keep the
  -- function safe on its own. Status, assignment and source are not parameters.
  if p_submission_key is null then
    raise exception 'A submission key is required' using errcode = '22023';
  end if;
  if p_consent is not true then
    raise exception 'Consent is required' using errcode = '22023';
  end if;
  if p_event_date is not null and (p_event_date <= v_today or p_event_date > v_today + 1096) then
    raise exception 'Event date out of range' using errcode = '22023';
  end if;
  if p_guest_count is null or p_guest_count not between 1 and 10000 then
    raise exception 'Guest count out of range' using errcode = '22023';
  end if;
  if p_preferred_contact_method <> 'email' and v_phone is null then
    raise exception 'A phone number is required for this contact method' using errcode = '22023';
  end if;

  -- A JSON array keeps field positions (and NULLs) distinct, so shifted
  -- optional fields cannot produce the same fingerprint.
  v_fingerprint := encode(sha256(convert_to(jsonb_build_array(
    v_email, btrim(p_contact_name), v_phone, p_preferred_contact_method, p_event_type,
    p_event_date, p_guest_count, btrim(p_venue), btrim(p_service_requirements),
    btrim(p_message), p_preferred_locale)::text, 'UTF8')), 'hex');

  -- Idempotent replay: same key + same content returns the original inquiry.
  select b.reference, b.submission_fingerprint into v_existing_reference, v_existing_fingerprint
  from public.bookings b where b.submission_key = p_submission_key;

  if found then
    if v_existing_fingerprint = v_fingerprint then
      return query select v_existing_reference, true;
      return;
    end if;
    raise exception 'Submission key already used' using errcode = '23505';
  end if;

  select b.id into v_duplicate
  from public.bookings b
  where lower(b.contact_email) = v_email
    and b.event_type = p_event_type
    and b.event_date is not distinct from p_event_date
    and b.created_at > now() - interval '7 days'
  order by b.created_at desc
  limit 1;

  insert into public.bookings (
    status, source, submission_key, submission_fingerprint, contact_name, contact_email,
    contact_phone, preferred_contact_method, event_type, event_date, guest_count, venue,
    service_requirements, message, preferred_locale, consent_given_at, possible_duplicate_of
  ) values (
    'new', 'website', p_submission_key, v_fingerprint, btrim(p_contact_name), v_email,
    v_phone, p_preferred_contact_method, p_event_type, p_event_date, p_guest_count,
    nullif(btrim(p_venue), ''), nullif(btrim(p_service_requirements), ''), nullif(btrim(p_message), ''),
    p_preferred_locale, now(), v_duplicate
  )
  on conflict (submission_key) do nothing
  returning id, reference into v_id, v_reference;

  if v_id is null then
    -- A concurrent request with the same key committed first.
    select b.reference, b.submission_fingerprint into v_existing_reference, v_existing_fingerprint
    from public.bookings b where b.submission_key = p_submission_key;
    if v_existing_fingerprint = v_fingerprint then
      return query select v_existing_reference, true;
      return;
    end if;
    raise exception 'Submission key already used' using errcode = '23505';
  end if;

  if p_notify then
    insert into private.notification_outbox (booking_id, kind)
    values (v_id, 'customer_acknowledgement'), (v_id, 'staff_new_inquiry')
    on conflict (booking_id, kind) do nothing;
  end if;

  return query select v_reference, false;
end;
$$;

-- Claims due notifications for delivery (row locks + SKIP LOCKED: safe to run
-- concurrently from several instances). Stale 'sending' claims are retried.
-- Returns the minimum needed to send: the customer's address only for their
-- own acknowledgement, and never their name or free-text fields.
create function public.claim_notifications(p_limit integer default 10)
returns table (
  notification_id uuid,
  kind public.notification_kind,
  attempts integer,
  booking_reference text,
  contact_email text,
  preferred_locale public.locale_code,
  event_type public.event_type,
  event_date date,
  guest_count integer
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select o.id
    from private.notification_outbox o
    where o.attempts < 5
      and (o.status in ('pending', 'failed')
           or (o.status = 'sending' and o.locked_at < now() - interval '10 minutes'))
    order by o.created_at
    limit least(greatest(coalesce(p_limit, 10), 1), 50)
    for update skip locked
  ),
  claimed as (
    update private.notification_outbox o
    set status = 'sending', locked_at = now(), attempts = o.attempts + 1
    from due
    where o.id = due.id
    returning o.id, o.kind, o.attempts, o.booking_id
  )
  select c.id, c.kind, c.attempts, b.reference,
         case when c.kind = 'customer_acknowledgement' then b.contact_email end,
         b.preferred_locale, b.event_type, b.event_date, b.guest_count
  from claimed c
  join public.bookings b on b.id = c.booking_id;
$$;

create function public.complete_notification(
  p_notification_id uuid,
  p_succeeded boolean,
  p_provider_message_id text default null,
  p_error text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.notification_outbox
  set status = case when p_succeeded then 'sent'::public.notification_status else 'failed' end,
      sent_at = case when p_succeeded then now() end,
      provider_message_id = left(p_provider_message_id, 200),
      last_error = case when p_succeeded then null else left(p_error, 500) end,
      locked_at = null
  where id = p_notification_id and status = 'sending';
$$;

-- -----------------------------------------------------------------------------
-- 8. Admin functions
-- -----------------------------------------------------------------------------
-- Reads run as the caller (SECURITY INVOKER): RLS on bookings, notes and history
-- decides what each staff member sees; an unauthorized caller gets no rows.

create function public.list_bookings(
  p_search text default null,
  p_statuses public.booking_status[] default null,
  p_event_types public.event_type[] default null,
  p_event_from date default null,
  p_event_to date default null,
  p_assignee uuid default null,
  p_unassigned_only boolean default false,
  p_sort text default 'received_desc',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  reference text,
  status public.booking_status,
  event_type public.event_type,
  event_date date,
  guest_count integer,
  contact_name text,
  contact_email text,
  assigned_to uuid,
  assignee_name text,
  possible_duplicate boolean,
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
    select b.*
    from public.bookings b, params
    where (params.pattern is null
           or b.reference ilike params.pattern
           or b.contact_name ilike params.pattern
           or b.contact_email ilike params.pattern
           or b.venue ilike params.pattern)
      and (p_statuses is null or cardinality(p_statuses) = 0 or b.status = any (p_statuses))
      and (p_event_types is null or cardinality(p_event_types) = 0 or b.event_type = any (p_event_types))
      and (p_event_from is null or b.event_date >= p_event_from)
      and (p_event_to is null or b.event_date <= p_event_to)
      and (p_assignee is null or b.assigned_to = p_assignee)
      and (not coalesce(p_unassigned_only, false) or b.assigned_to is null)
  )
  select f.id, f.reference, f.status, f.event_type, f.event_date, f.guest_count, f.contact_name,
         f.contact_email, f.assigned_to, private.staff_display_name(f.assigned_to),
         f.possible_duplicate_of is not null, f.created_at, count(*) over ()
  from filtered f
  order by
    case when p_sort = 'received_asc' then f.created_at end asc,
    case when p_sort = 'event_date_asc' then f.event_date end asc nulls last,
    case when p_sort = 'event_date_desc' then f.event_date end desc nulls last,
    f.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.booking_inbox_counts()
returns table (status public.booking_status, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.status, count(*) from public.bookings b group by b.status;
$$;

create function public.get_booking_detail(p_reference text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'booking', to_jsonb(b) - 'submission_key' - 'submission_fingerprint',
    'assignee_name', private.staff_display_name(b.assigned_to),
    'possible_duplicate_reference', (select d.reference from public.bookings d where d.id = b.possible_duplicate_of),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'body', n.body, 'author_id', n.author_id,
               'author_name', private.staff_display_name(n.author_id), 'created_at', n.created_at)
             order by n.created_at, n.id)
      from public.booking_notes n where n.booking_id = b.id), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'from_status', h.from_status, 'to_status', h.to_status,
               'changed_by_name', private.staff_display_name(h.changed_by),
               'note', h.note, 'changed_at', h.changed_at)
             order by h.changed_at, h.id)
      from public.booking_status_history h where h.booking_id = b.id), '[]'::jsonb)
  )
  from public.bookings b
  where b.reference = p_reference;
$$;

-- Aggregates only (no personal data), for reporting roles such as analysts.
create function public.booking_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('reports.read') then
    raise exception 'Not authorized to read reports' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'total', (select count(*) from public.bookings),
    'last_30_days', (select count(*) from public.bookings where created_at > now() - interval '30 days'),
    'by_status', coalesce((select jsonb_object_agg(s.status::text, s.total)
                           from (select status, count(*) as total from public.bookings group by status) s), '{}'::jsonb),
    'by_event_type', coalesce((select jsonb_object_agg(t.event_type::text, t.total)
                               from (select event_type, count(*) as total from public.bookings group by event_type) t), '{}'::jsonb)
  );
end;
$$;

-- Staff who can be given inquiries: holders of a booking write permission.
create function public.list_assignable_staff()
returns table (user_id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('bookings.assign') then
    raise exception 'Not authorized to assign inquiries' using errcode = '42501';
  end if;

  return query
    select distinct ur.user_id, private.staff_display_name(ur.user_id)
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where rp.permission in ('bookings.write_assigned', 'bookings.write_all')
    order by 2;
end;
$$;

-- Mutations: SECURITY DEFINER with explicit authorization. Missing and
-- forbidden inquiries raise the same error, so ids cannot be probed.
create function public.change_booking_status(
  p_booking_id uuid,
  p_to_status public.booking_status,
  p_note text default null
)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.booking_status;
  v_reference text;
  v_note text := nullif(btrim(p_note), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'Note is too long' using errcode = '22023';
  end if;

  select b.status, b.reference into v_current, v_reference
  from public.bookings b where b.id = p_booking_id
  for update;

  if not found or not private.can_write_booking(p_booking_id) then
    raise exception 'Inquiry not found' using errcode = 'P0002';
  end if;

  if not private.is_allowed_booking_transition(v_current, p_to_status) then
    raise exception 'Invalid booking status transition' using errcode = '22023';
  end if;

  perform set_config('chief.booking_status_note', coalesce(v_note, ''), true);
  update public.bookings set status = p_to_status where id = p_booking_id;
  perform set_config('chief.booking_status_note', '', true);

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'booking.status_changed', 'booking', v_reference,
          jsonb_build_object('from', v_current, 'to', p_to_status));

  return p_to_status;
end;
$$;

create function public.assign_booking(p_booking_id uuid, p_assignee uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous uuid;
  v_reference text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.has_permission('bookings.assign') then
    raise exception 'Not authorized to assign inquiries' using errcode = '42501';
  end if;

  select b.assigned_to, b.reference into v_previous, v_reference
  from public.bookings b where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Inquiry not found' using errcode = 'P0002';
  end if;

  if p_assignee is not null and not exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = p_assignee
      and rp.permission in ('bookings.write_assigned', 'bookings.write_all')
  ) then
    raise exception 'This staff member cannot be assigned inquiries' using errcode = '22023';
  end if;

  if v_previous is not distinct from p_assignee then
    return;
  end if;

  update public.bookings set assigned_to = p_assignee where id = p_booking_id;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), 'booking.assigned', 'booking', v_reference,
          jsonb_build_object('from', v_previous, 'to', p_assignee));
end;
$$;

create function public.add_booking_note(p_booking_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_body text := btrim(p_body);
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if v_body is null or char_length(v_body) not between 1 and 4000 then
    raise exception 'Note must be between 1 and 4000 characters' using errcode = '22023';
  end if;
  if not private.can_write_booking(p_booking_id) then
    raise exception 'Inquiry not found' using errcode = 'P0002';
  end if;

  insert into public.booking_notes (booking_id, author_id, body)
  values (p_booking_id, (select auth.uid()), v_body)
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Privileges and Row Level Security
-- -----------------------------------------------------------------------------
alter table public.booking_status_history enable row level security;
alter table public.booking_notes enable row level security;
alter table private.rate_limits enable row level security;
alter table private.notification_outbox enable row level security;

revoke all on table public.booking_status_history, public.booking_notes from anon, authenticated, service_role;
revoke all on sequence public.booking_status_history_id_seq from anon, authenticated, service_role;
revoke all on table private.rate_limits, private.notification_outbox from public, anon, authenticated, service_role;

-- The server secret key cannot read or write booking data directly.
revoke all on table public.bookings from service_role;

-- History and notes are readable exactly when their booking is (the subquery is
-- itself subject to the bookings RLS policies). No API role may write them.
grant select on table public.booking_status_history, public.booking_notes to authenticated;

create policy "booking_status_history: visible with booking"
  on public.booking_status_history for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));

create policy "booking_notes: visible with booking"
  on public.booking_notes for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));

-- Function privileges: private helpers are internal; staff functions are for
-- authenticated users; submission and delivery functions are for the server only.
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_permission(public.app_permission) to authenticated;
grant execute on function private.staff_display_name(uuid) to authenticated;

revoke all on function
  public.consume_rate_limit(text, integer, integer),
  public.submit_inquiry(uuid, text, text, text, public.contact_method, public.event_type, date, integer,
                        text, text, text, public.locale_code, boolean, boolean),
  public.claim_notifications(integer),
  public.complete_notification(uuid, boolean, text, text),
  public.list_bookings(text, public.booking_status[], public.event_type[], date, date, uuid, boolean,
                       text, integer, integer),
  public.booking_inbox_counts(),
  public.get_booking_detail(text),
  public.booking_report(),
  public.list_assignable_staff(),
  public.change_booking_status(uuid, public.booking_status, text),
  public.assign_booking(uuid, uuid),
  public.add_booking_note(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.consume_rate_limit(text, integer, integer),
  public.submit_inquiry(uuid, text, text, text, public.contact_method, public.event_type, date, integer,
                        text, text, text, public.locale_code, boolean, boolean),
  public.claim_notifications(integer),
  public.complete_notification(uuid, boolean, text, text)
to service_role;

grant execute on function
  public.list_bookings(text, public.booking_status[], public.event_type[], date, date, uuid, boolean,
                       text, integer, integer),
  public.booking_inbox_counts(),
  public.get_booking_detail(text),
  public.booking_report(),
  public.list_assignable_staff(),
  public.change_booking_status(uuid, public.booking_status, text),
  public.assign_booking(uuid, uuid),
  public.add_booking_note(uuid, text)
to authenticated;
