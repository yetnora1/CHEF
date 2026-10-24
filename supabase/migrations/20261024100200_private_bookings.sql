-- =============================================================================
-- Chief Harena · Stage 1 · Private operational data: booking inquiries
-- =============================================================================
-- Reference implementation of the private-data pattern:
--   * anon has no privileges at all; nothing here is ever publicly readable
--   * staff access is permission-based; event managers only see and edit
--     inquiries assigned to them, so manipulated ids return nothing
--   * there is deliberately NO insert path for anon. The public inquiry form
--     (Stage 2) will submit through a trusted Next.js server action that
--     validates input, applies abuse controls and inserts with server-only
--     credentials. See docs/ARCHITECTURE.md.
-- Status history, internal notes and attachments arrive in later migrations.
-- =============================================================================

create type public.booking_status as enum (
  'new',
  'in_review',
  'quoted',
  'confirmed',
  'completed',
  'declined',
  'cancelled'
);

create type public.event_type as enum (
  'wedding',
  'corporate',
  'summit',
  'private_dining',
  'culinary_experience',
  'other'
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  -- Short, non-sequential reference that is safe to show to the customer.
  reference text not null
    default ('CH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)))
    constraint bookings_reference_unique unique,
  status public.booking_status not null default 'new',
  event_type public.event_type not null,
  event_date date,
  guest_count integer constraint bookings_guest_count_range check (guest_count between 1 and 10000),
  venue text constraint bookings_venue_length check (char_length(venue) <= 300),
  contact_name text not null constraint bookings_contact_name_length check (char_length(contact_name) between 1 and 160),
  contact_email text not null constraint bookings_contact_email_format check (
    char_length(contact_email) <= 254 and contact_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  ),
  contact_phone text constraint bookings_contact_phone_length check (char_length(contact_phone) <= 40),
  preferred_locale public.locale_code not null default 'en',
  message text constraint bookings_message_length check (char_length(message) <= 5000),
  -- When the customer accepted the privacy notice. Required for every inquiry.
  consent_given_at timestamptz not null,
  assigned_to uuid references auth.users (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index bookings_status_created_idx on public.bookings (status, created_at desc);
create index bookings_assigned_to_idx on public.bookings (assigned_to) where assigned_to is not null;
create index bookings_event_date_idx on public.bookings (event_date);

comment on table public.bookings is
  'Private customer inquiries. Never exposed to anon; staff access is permission- and assignment-scoped.';

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Privileges and Row Level Security
-- -----------------------------------------------------------------------------
alter table public.bookings enable row level security;

revoke all on table public.bookings from anon, authenticated;

grant select, delete on table public.bookings to authenticated;
grant insert (status, event_type, event_date, guest_count, venue, contact_name, contact_email,
              contact_phone, preferred_locale, message, consent_given_at, assigned_to)
  on table public.bookings to authenticated;
grant update (status, event_type, event_date, guest_count, venue, contact_name, contact_email,
              contact_phone, preferred_locale, message, assigned_to, archived_at)
  on table public.bookings to authenticated;

create policy "bookings: read all with permission"
  on public.bookings for select to authenticated
  using ((select private.has_permission('bookings.read_all')));

create policy "bookings: read assigned"
  on public.bookings for select to authenticated
  using (
    assigned_to = (select auth.uid())
    and (select private.has_permission('bookings.read_assigned'))
  );

create policy "bookings: staff create"
  on public.bookings for insert to authenticated
  with check ((select private.has_permission('bookings.write_all')));

create policy "bookings: edit all with permission"
  on public.bookings for update to authenticated
  using ((select private.has_permission('bookings.write_all')))
  with check ((select private.has_permission('bookings.write_all')));

-- WITH CHECK keeps the row assigned to the editor, so an event manager cannot
-- hand an inquiry to someone else or pull in an unassigned one.
create policy "bookings: edit assigned"
  on public.bookings for update to authenticated
  using (
    assigned_to = (select auth.uid())
    and (select private.has_permission('bookings.write_assigned'))
  )
  with check (
    assigned_to = (select auth.uid())
    and (select private.has_permission('bookings.write_assigned'))
  );

create policy "bookings: privacy erasure"
  on public.bookings for delete to authenticated
  using ((select private.has_permission('bookings.delete')));

-- Changing the assignee requires bookings.assign (defence in depth for future
-- roles that hold bookings.write_all without bookings.assign).
create function private.enforce_booking_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if (tg_op = 'INSERT' and new.assigned_to is not null)
     or (tg_op = 'UPDATE' and new.assigned_to is distinct from old.assigned_to) then
    if not private.has_permission('bookings.assign') then
      raise exception 'Not authorized to assign inquiries' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_booking_assignment() from public, anon, authenticated;

create trigger bookings_enforce_assignment
  before insert or update on public.bookings
  for each row execute function private.enforce_booking_assignment();
