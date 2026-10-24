-- =============================================================================
-- Chief Harena · Stage 1 · Localized public content: services
-- =============================================================================
-- Reference implementation of the bilingual content pattern that pages, journal
-- posts and menus will follow in later stages:
--   * a stable, language-neutral entity row (slug, publication status, ordering)
--   * one translation row per locale, each with its own publication status, so an
--     Amharic draft can be prepared while the English version is live
--   * a missing or unpublished translation is simply absent from public reads;
--     the application applies the documented fallback policy and marks fallback
--     content with its real language (docs/LOCALIZATION.md)
-- =============================================================================

create type public.publication_status as enum ('draft', 'published', 'archived');

-- Records the acting user on content rows. Values supplied by clients are ignored.
create function private.stamp_content_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$$;

-- Publishing, unpublishing, and editing anything that is currently live require
-- content.publish. Contexts without an end-user identity (migrations, seed,
-- service role) are trusted server code; anon has no write privileges at all.
create function private.enforce_publish_permission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if (tg_op = 'INSERT' and new.status <> 'draft')
     or (tg_op = 'UPDATE' and (new.status is distinct from old.status or old.status = 'published')) then
    if not private.has_permission('content.publish') then
      raise exception 'Not authorized to change published content' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create function private.set_published_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function private.stamp_content_row(), private.enforce_publish_permission(),
  private.set_published_at() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- services
-- -----------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null
    constraint services_slug_unique unique
    constraint services_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  status public.publication_status not null default 'draft',
  sort_order integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index services_status_sort_idx on public.services (status, sort_order);
create index services_updated_by_idx on public.services (updated_by);

comment on column public.services.slug is
  'Stable ASCII slug shared by every locale (e.g. /en/services/weddings and /am/services/weddings).';

create trigger services_enforce_publish
  before insert or update on public.services
  for each row execute function private.enforce_publish_permission();

create trigger services_set_published_at
  before insert or update on public.services
  for each row execute function private.set_published_at();

create trigger services_stamp
  before insert or update on public.services
  for each row execute function private.stamp_content_row();

-- -----------------------------------------------------------------------------
-- service_translations
-- -----------------------------------------------------------------------------
create table public.service_translations (
  service_id uuid not null references public.services (id) on delete cascade,
  locale public.locale_code not null,
  status public.publication_status not null default 'draft',
  title text not null constraint service_translations_title_length check (char_length(title) between 1 and 160),
  summary text constraint service_translations_summary_length check (char_length(summary) <= 500),
  body text constraint service_translations_body_length check (char_length(body) <= 20000),
  seo_title text constraint service_translations_seo_title_length check (char_length(seo_title) <= 70),
  seo_description text constraint service_translations_seo_description_length check (char_length(seo_description) <= 170),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (service_id, locale)
);

create index service_translations_locale_status_idx on public.service_translations (locale, status);
create index service_translations_updated_by_idx on public.service_translations (updated_by);

create trigger service_translations_enforce_publish
  before insert or update on public.service_translations
  for each row execute function private.enforce_publish_permission();

create trigger service_translations_stamp
  before insert or update on public.service_translations
  for each row execute function private.stamp_content_row();

-- -----------------------------------------------------------------------------
-- Privileges and Row Level Security
-- -----------------------------------------------------------------------------
alter table public.services enable row level security;
alter table public.service_translations enable row level security;

revoke all on table public.services, public.service_translations from anon, authenticated;

-- Visitors get only the columns a public page needs: no audit columns
-- (updated_by would expose staff account ids). Public queries must therefore
-- name their columns instead of using select=*.
grant select (id, slug, status, sort_order, published_at) on table public.services to anon;
grant select (service_id, locale, status, title, summary, body, seo_title, seo_description)
  on table public.service_translations to anon;
-- Accounts are staff-only (public sign-up is disabled); editors need the audit columns.
grant select on table public.services, public.service_translations to authenticated;
grant insert (slug, status, sort_order), update (slug, status, sort_order), delete
  on table public.services to authenticated;
grant insert (service_id, locale, status, title, summary, body, seo_title, seo_description),
      update (status, title, summary, body, seo_title, seo_description),
      delete
  on table public.service_translations to authenticated;

-- Public visitors see published services only.
create policy "services: public read published"
  on public.services for select to anon, authenticated
  using (status = 'published');

create policy "services: editors read all"
  on public.services for select to authenticated
  using ((select private.has_permission('content.read')));

create policy "services: editors insert"
  on public.services for insert to authenticated
  with check ((select private.has_permission('content.write')));

create policy "services: editors update"
  on public.services for update to authenticated
  using ((select private.has_permission('content.write')))
  with check ((select private.has_permission('content.write')));

-- Published services must be unpublished before they can be deleted.
create policy "services: publishers delete unpublished"
  on public.services for delete to authenticated
  using ((select private.has_permission('content.publish')) and status <> 'published');

-- Public visitors see a translation only when both it and its service are published.
create policy "service_translations: public read published"
  on public.service_translations for select to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.services s
      where s.id = service_id and s.status = 'published'
    )
  );

create policy "service_translations: editors read all"
  on public.service_translations for select to authenticated
  using ((select private.has_permission('content.read')));

create policy "service_translations: translators insert"
  on public.service_translations for insert to authenticated
  with check ((select private.has_permission('translations.write')));

create policy "service_translations: translators update"
  on public.service_translations for update to authenticated
  using ((select private.has_permission('translations.write')))
  with check ((select private.has_permission('translations.write')));

-- Same rule as services: a live translation must be unpublished before deletion.
create policy "service_translations: publishers delete unpublished"
  on public.service_translations for delete to authenticated
  using ((select private.has_permission('content.publish')) and status <> 'published');
