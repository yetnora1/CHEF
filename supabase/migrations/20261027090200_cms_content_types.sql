-- =============================================================================
-- Chief Harena · Stage 3 · Content types: menu, gallery, journal, pages
-- =============================================================================
-- Each type follows the services pattern: a language-neutral row and one
-- translation row per locale, each with its own publication status. Visitors
-- read only published rows, and translations only when their parent is
-- published too. Images are references to media_assets with ON DELETE RESTRICT.
-- Triggers: publish permission, Amharic review, actor stamp, version, audit.
-- =============================================================================

create type public.dietary_tag as enum ('vegetarian', 'vegan', 'fasting', 'spicy');

-- -----------------------------------------------------------------------------
-- 1. Menu: categories and items
-- -----------------------------------------------------------------------------
create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null
    constraint menu_categories_slug_unique unique
    constraint menu_categories_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  status public.publication_status not null default 'draft',
  sort_order integer not null default 0,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.menu_category_translations (
  category_id uuid not null references public.menu_categories (id) on delete cascade,
  locale public.locale_code not null,
  status public.publication_status not null default 'draft',
  name text not null constraint menu_category_translations_name_length check (char_length(btrim(name)) between 1 and 120),
  description text constraint menu_category_translations_description_length check (char_length(description) <= 1000),
  language_reviewed_at timestamptz,
  language_reviewed_by uuid references auth.users (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (category_id, locale)
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  -- A category with items cannot be deleted: move or delete the items first.
  category_id uuid not null references public.menu_categories (id) on delete restrict,
  status public.publication_status not null default 'draft',
  sort_order integer not null default 0,
  image_id uuid references public.media_assets (id) on delete restrict,
  dietary_tags public.dietary_tag[] not null default '{}'
    constraint menu_items_dietary_tags_count check (cardinality(dietary_tags) <= 4),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index menu_items_category_idx on public.menu_items (category_id, sort_order);
create index menu_items_image_idx on public.menu_items (image_id) where image_id is not null;

create table public.menu_item_translations (
  item_id uuid not null references public.menu_items (id) on delete cascade,
  locale public.locale_code not null,
  status public.publication_status not null default 'draft',
  name text not null constraint menu_item_translations_name_length check (char_length(btrim(name)) between 1 and 120),
  description text constraint menu_item_translations_description_length check (char_length(description) <= 1000),
  language_reviewed_at timestamptz,
  language_reviewed_by uuid references auth.users (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (item_id, locale)
);

-- -----------------------------------------------------------------------------
-- 2. Gallery
-- -----------------------------------------------------------------------------
create table public.gallery_items (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.media_assets (id) on delete restrict,
  status public.publication_status not null default 'draft',
  sort_order integer not null default 0,
  -- Optional grouping by the kind of event pictured (same list as inquiries).
  event_type public.event_type,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index gallery_items_asset_idx on public.gallery_items (asset_id);
create index gallery_items_status_sort_idx on public.gallery_items (status, sort_order);

create table public.gallery_item_translations (
  item_id uuid not null references public.gallery_items (id) on delete cascade,
  locale public.locale_code not null,
  status public.publication_status not null default 'draft',
  caption text not null constraint gallery_item_translations_caption_length check (char_length(btrim(caption)) between 1 and 300),
  language_reviewed_at timestamptz,
  language_reviewed_by uuid references auth.users (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (item_id, locale)
);

-- -----------------------------------------------------------------------------
-- 3. Journal
-- -----------------------------------------------------------------------------
create table public.journal_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null
    constraint journal_posts_slug_unique unique
    constraint journal_posts_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  status public.publication_status not null default 'draft',
  -- Set on first publication; the date shown with the article.
  published_at timestamptz,
  cover_image_id uuid references public.media_assets (id) on delete restrict,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create index journal_posts_status_published_idx on public.journal_posts (status, published_at desc);
create index journal_posts_cover_idx on public.journal_posts (cover_image_id) where cover_image_id is not null;

create table public.journal_post_translations (
  post_id uuid not null references public.journal_posts (id) on delete cascade,
  locale public.locale_code not null,
  status public.publication_status not null default 'draft',
  title text not null constraint journal_post_translations_title_length check (char_length(btrim(title)) between 1 and 160),
  excerpt text constraint journal_post_translations_excerpt_length check (char_length(excerpt) <= 500),
  -- Plain text with a small formatting syntax, rendered as escaped text (never HTML).
  body text constraint journal_post_translations_body_length check (char_length(body) <= 50000),
  seo_title text constraint journal_post_translations_seo_title_length check (char_length(seo_title) <= 70),
  seo_description text constraint journal_post_translations_seo_description_length check (char_length(seo_description) <= 170),
  language_reviewed_at timestamptz,
  language_reviewed_by uuid references auth.users (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (post_id, locale)
);

-- -----------------------------------------------------------------------------
-- 4. Pages: a fixed set of pages with structured, per-locale sections
-- -----------------------------------------------------------------------------
-- The section fields of each page are defined and validated in code
-- (src/features/cms/pages.ts); the database stores them as a bounded JSON
-- object. Pages are not created or deleted by staff: new pages need code.
create table public.pages (
  key text primary key constraint pages_key_known check (key in ('home', 'about')),
  status public.publication_status not null default 'draft',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create table public.page_translations (
  page_key text not null references public.pages (key) on delete cascade,
  locale public.locale_code not null,
  status public.publication_status not null default 'draft',
  title text not null constraint page_translations_title_length check (char_length(btrim(title)) between 1 and 160),
  seo_title text constraint page_translations_seo_title_length check (char_length(seo_title) <= 70),
  seo_description text constraint page_translations_seo_description_length check (char_length(seo_description) <= 170),
  sections jsonb not null default '{}'::jsonb
    constraint page_translations_sections_object
    check (jsonb_typeof(sections) = 'object' and octet_length(sections::text) <= 65536),
  language_reviewed_at timestamptz,
  language_reviewed_by uuid references auth.users (id) on delete set null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (page_key, locale)
);

-- Language-neutral image slots of a page (e.g. home: hero, about).
create table public.page_images (
  page_key text not null references public.pages (key) on delete cascade,
  slot text not null constraint page_images_slot_format check (slot ~ '^[a-z][a-z_]{0,39}$'),
  asset_id uuid not null references public.media_assets (id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (page_key, slot)
);

create index page_images_asset_idx on public.page_images (asset_id);

insert into public.pages (key) values ('home'), ('about');

-- Changing an image of a live (or archived) page requires content.publish.
create function private.enforce_page_image_permission()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_page text;
begin
  if tg_op = 'DELETE' then
    v_page := old.page_key;
  else
    v_page := new.page_key;
  end if;

  if (select auth.uid()) is not null
     and exists (select 1 from public.pages p where p.key = v_page and p.status in ('published', 'archived'))
     and not private.has_permission('content.publish') then
    raise exception 'Not authorized to change published content' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_page_image_permission() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 5. Triggers
-- -----------------------------------------------------------------------------
create trigger menu_categories_enforce_publish before insert or update on public.menu_categories
  for each row execute function private.enforce_publish_permission();
create trigger menu_categories_stamp before insert or update on public.menu_categories
  for each row execute function private.stamp_content_row();
create trigger menu_categories_version before update on public.menu_categories
  for each row execute function private.bump_version();
create trigger menu_categories_audit after insert or update or delete on public.menu_categories
  for each row execute function private.audit_content('menu_category', 'id');

create trigger menu_category_translations_enforce_publish before insert or update on public.menu_category_translations
  for each row execute function private.enforce_publish_permission();
create trigger menu_category_translations_review before insert or update on public.menu_category_translations
  for each row execute function private.enforce_language_review('name', 'description');
create trigger menu_category_translations_stamp before insert or update on public.menu_category_translations
  for each row execute function private.stamp_content_row();
create trigger menu_category_translations_version before update on public.menu_category_translations
  for each row execute function private.bump_version();
create trigger menu_category_translations_audit after insert or update or delete on public.menu_category_translations
  for each row execute function private.audit_content('menu_category_translation', 'category_id');

create trigger menu_items_enforce_publish before insert or update on public.menu_items
  for each row execute function private.enforce_publish_permission();
create trigger menu_items_stamp before insert or update on public.menu_items
  for each row execute function private.stamp_content_row();
create trigger menu_items_version before update on public.menu_items
  for each row execute function private.bump_version();
create trigger menu_items_audit after insert or update or delete on public.menu_items
  for each row execute function private.audit_content('menu_item', 'id');

create trigger menu_item_translations_enforce_publish before insert or update on public.menu_item_translations
  for each row execute function private.enforce_publish_permission();
create trigger menu_item_translations_review before insert or update on public.menu_item_translations
  for each row execute function private.enforce_language_review('name', 'description');
create trigger menu_item_translations_stamp before insert or update on public.menu_item_translations
  for each row execute function private.stamp_content_row();
create trigger menu_item_translations_version before update on public.menu_item_translations
  for each row execute function private.bump_version();
create trigger menu_item_translations_audit after insert or update or delete on public.menu_item_translations
  for each row execute function private.audit_content('menu_item_translation', 'item_id');

create trigger gallery_items_enforce_publish before insert or update on public.gallery_items
  for each row execute function private.enforce_publish_permission();
create trigger gallery_items_stamp before insert or update on public.gallery_items
  for each row execute function private.stamp_content_row();
create trigger gallery_items_version before update on public.gallery_items
  for each row execute function private.bump_version();
create trigger gallery_items_audit after insert or update or delete on public.gallery_items
  for each row execute function private.audit_content('gallery_item', 'id');

create trigger gallery_item_translations_enforce_publish before insert or update on public.gallery_item_translations
  for each row execute function private.enforce_publish_permission();
create trigger gallery_item_translations_review before insert or update on public.gallery_item_translations
  for each row execute function private.enforce_language_review('caption');
create trigger gallery_item_translations_stamp before insert or update on public.gallery_item_translations
  for each row execute function private.stamp_content_row();
create trigger gallery_item_translations_version before update on public.gallery_item_translations
  for each row execute function private.bump_version();
create trigger gallery_item_translations_audit after insert or update or delete on public.gallery_item_translations
  for each row execute function private.audit_content('gallery_item_translation', 'item_id');

create trigger journal_posts_enforce_publish before insert or update on public.journal_posts
  for each row execute function private.enforce_publish_permission();
create trigger journal_posts_set_published_at before insert or update on public.journal_posts
  for each row execute function private.set_published_at();
create trigger journal_posts_stamp before insert or update on public.journal_posts
  for each row execute function private.stamp_content_row();
create trigger journal_posts_version before update on public.journal_posts
  for each row execute function private.bump_version();
create trigger journal_posts_audit after insert or update or delete on public.journal_posts
  for each row execute function private.audit_content('journal_post', 'id');

create trigger journal_post_translations_enforce_publish before insert or update on public.journal_post_translations
  for each row execute function private.enforce_publish_permission();
create trigger journal_post_translations_review before insert or update on public.journal_post_translations
  for each row execute function private.enforce_language_review('title', 'excerpt', 'body', 'seo_title', 'seo_description');
create trigger journal_post_translations_stamp before insert or update on public.journal_post_translations
  for each row execute function private.stamp_content_row();
create trigger journal_post_translations_version before update on public.journal_post_translations
  for each row execute function private.bump_version();
create trigger journal_post_translations_audit after insert or update or delete on public.journal_post_translations
  for each row execute function private.audit_content('journal_post_translation', 'post_id');

create trigger pages_enforce_publish before insert or update on public.pages
  for each row execute function private.enforce_publish_permission();
create trigger pages_stamp before insert or update on public.pages
  for each row execute function private.stamp_content_row();
create trigger pages_version before update on public.pages
  for each row execute function private.bump_version();
create trigger pages_audit after insert or update or delete on public.pages
  for each row execute function private.audit_content('page', 'key');

create trigger page_translations_enforce_publish before insert or update on public.page_translations
  for each row execute function private.enforce_publish_permission();
create trigger page_translations_review before insert or update on public.page_translations
  for each row execute function private.enforce_language_review('title', 'seo_title', 'seo_description', 'sections');
create trigger page_translations_stamp before insert or update on public.page_translations
  for each row execute function private.stamp_content_row();
create trigger page_translations_version before update on public.page_translations
  for each row execute function private.bump_version();
create trigger page_translations_audit after insert or update or delete on public.page_translations
  for each row execute function private.audit_content('page_translation', 'page_key');

create trigger page_images_enforce_publish before insert or update or delete on public.page_images
  for each row execute function private.enforce_page_image_permission();
create trigger page_images_stamp before insert or update on public.page_images
  for each row execute function private.stamp_content_row();
create trigger page_images_audit after insert or update or delete on public.page_images
  for each row execute function private.audit_content('page_image', 'page_key');

-- -----------------------------------------------------------------------------
-- 6. Privileges and Row Level Security
-- -----------------------------------------------------------------------------
alter table public.menu_categories enable row level security;
alter table public.menu_category_translations enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_item_translations enable row level security;
alter table public.gallery_items enable row level security;
alter table public.gallery_item_translations enable row level security;
alter table public.journal_posts enable row level security;
alter table public.journal_post_translations enable row level security;
alter table public.pages enable row level security;
alter table public.page_translations enable row level security;
alter table public.page_images enable row level security;

revoke all on table
  public.menu_categories, public.menu_category_translations, public.menu_items, public.menu_item_translations,
  public.gallery_items, public.gallery_item_translations, public.journal_posts, public.journal_post_translations,
  public.pages, public.page_translations, public.page_images
from anon, authenticated, service_role;

-- Visitors: public columns only (no actor ids, versions or review data), so
-- public queries name their columns.
grant select (id, slug, status, sort_order) on table public.menu_categories to anon;
grant select (category_id, locale, status, name, description) on table public.menu_category_translations to anon;
grant select (id, category_id, status, sort_order, image_id, dietary_tags) on table public.menu_items to anon;
grant select (item_id, locale, status, name, description) on table public.menu_item_translations to anon;
grant select (id, asset_id, status, sort_order, event_type) on table public.gallery_items to anon;
grant select (item_id, locale, status, caption) on table public.gallery_item_translations to anon;
grant select (id, slug, status, published_at, cover_image_id) on table public.journal_posts to anon;
grant select (post_id, locale, status, title, excerpt, body, seo_title, seo_description)
  on table public.journal_post_translations to anon;
grant select (key, status) on table public.pages to anon;
grant select (page_key, locale, status, title, seo_title, seo_description, sections) on table public.page_translations to anon;
grant select (page_key, slot, asset_id) on table public.page_images to anon;

-- Staff: all columns readable (RLS decides rows); writable columns listed.
grant select on table
  public.menu_categories, public.menu_category_translations, public.menu_items, public.menu_item_translations,
  public.gallery_items, public.gallery_item_translations, public.journal_posts, public.journal_post_translations,
  public.pages, public.page_translations, public.page_images
to authenticated;

grant insert (slug, status, sort_order), update (slug, status, sort_order), delete
  on table public.menu_categories to authenticated;
grant insert (category_id, locale, status, name, description, language_reviewed_at),
      update (status, name, description, language_reviewed_at), delete
  on table public.menu_category_translations to authenticated;
grant insert (category_id, status, sort_order, image_id, dietary_tags),
      update (category_id, status, sort_order, image_id, dietary_tags), delete
  on table public.menu_items to authenticated;
grant insert (item_id, locale, status, name, description, language_reviewed_at),
      update (status, name, description, language_reviewed_at), delete
  on table public.menu_item_translations to authenticated;
grant insert (asset_id, status, sort_order, event_type), update (asset_id, status, sort_order, event_type), delete
  on table public.gallery_items to authenticated;
grant insert (item_id, locale, status, caption, language_reviewed_at),
      update (status, caption, language_reviewed_at), delete
  on table public.gallery_item_translations to authenticated;
grant insert (slug, status, cover_image_id), update (slug, status, cover_image_id), delete
  on table public.journal_posts to authenticated;
grant insert (post_id, locale, status, title, excerpt, body, seo_title, seo_description, language_reviewed_at),
      update (status, title, excerpt, body, seo_title, seo_description, language_reviewed_at), delete
  on table public.journal_post_translations to authenticated;
-- The set of pages is fixed by migrations: staff only change their status.
grant update (status) on table public.pages to authenticated;
grant insert (page_key, locale, status, title, seo_title, seo_description, sections, language_reviewed_at),
      update (status, title, seo_title, seo_description, sections, language_reviewed_at), delete
  on table public.page_translations to authenticated;
grant insert (page_key, slot, asset_id), update (asset_id), delete on table public.page_images to authenticated;

-- Menu categories
create policy "menu_categories: public read published"
  on public.menu_categories for select to anon, authenticated
  using (status = 'published');
create policy "menu_categories: editors read all"
  on public.menu_categories for select to authenticated
  using ((select private.has_permission('content.read')));
create policy "menu_categories: editors insert"
  on public.menu_categories for insert to authenticated
  with check ((select private.has_permission('content.write')));
create policy "menu_categories: editors update"
  on public.menu_categories for update to authenticated
  using ((select private.has_permission('content.write')))
  with check ((select private.has_permission('content.write')));
create policy "menu_categories: publishers delete unpublished"
  on public.menu_categories for delete to authenticated
  using ((select private.has_permission('content.publish')) and status <> 'published');

create policy "menu_category_translations: public read published"
  on public.menu_category_translations for select to anon, authenticated
  using (
    status = 'published'
    and exists (select 1 from public.menu_categories c where c.id = category_id and c.status = 'published')
  );
create policy "menu_category_translations: editors read all"
  on public.menu_category_translations for select to authenticated
  using ((select private.has_permission('content.read')));
create policy "menu_category_translations: translators insert"
  on public.menu_category_translations for insert to authenticated
  with check ((select private.has_permission('translations.write')));
create policy "menu_category_translations: translators update"
  on public.menu_category_translations for update to authenticated
  using ((select private.has_permission('translations.write')))
  with check ((select private.has_permission('translations.write')));
create policy "menu_category_translations: publishers delete unpublished"
  on public.menu_category_translations for delete to authenticated
  using ((select private.has_permission('content.publish')) and status <> 'published');

-- Menu items: public only when the item and its category are published.
create policy "menu_items: public read published"
  on public.menu_items for select to anon, authenticated
  using (
    status = 'published'
    and exists (select 1 from public.menu_categories c where c.id = category_id and c.status = 'published')
  );
create policy "menu_items: editors read all"
  on public.menu_items for select to authenticated
  using ((select private.has_permission('content.read')));
create policy "menu_items: editors insert"
  on public.menu_items for insert to authenticated
  with check ((select private.has_permission('content.write')));
create policy "menu_items: editors update"
  on public.menu_items for update to authenticated
  using ((select private.has_permission('content.write')))
  with check ((select private.has_permission('content.write')));
create policy "menu_items: publishers delete unpublished"
  on public.menu_items for delete to authenticated
  using ((select private.has_permission('content.publish')) and status <> 'published');

create policy "menu_item_translations: public read published"
  on public.menu_item_translations for select to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1 from public.menu_items i join public.menu_categories c on c.id = i.category_id
      where i.id = item_id and i.status = 'published' and c.status = 'published'
    )
  );
create policy "menu_item_translations: editors read all"
  on public.menu_item_translations for select to authenticated
  using ((select private.has_permission('content.read')));
create policy "menu_item_translations: translators insert"
  on public.menu_item_translations for insert to authenticated
  with check ((select private.has_permission('translations.write')));
create policy "menu_item_translations: translators update"
  on public.menu_item_translations for update to authenticated
  using ((select private.has_permission('translations.write')))
  with check ((select private.has_permission('translations.write')));
create policy "menu_item_translations: publishers delete unpublished"
  on public.menu_item_translations for delete to authenticated
  using ((select private.has_permission('content.publish')) and status <> 'published');

-- Gallery
create policy "gallery_items: public read published"
  on public.gallery_items for select to anon, authenticated
  using (status = 'published');
create policy "gallery_items: editors read all"
  on public.gallery_items for select to authenticated
  using ((select private.has_permission('content.read')));
create policy "gallery_items: editors insert"
  on public.gallery_items for insert to authenticated
  with check ((select private.has_permission('content.write')));
create policy "gallery_items: editors update"
  on public.gallery_items for update to authenticated
  using ((select private.has_permission('content.write')))
  with check ((select private.has_permission('content.write')));
create policy "gallery_items: publishers delete unpublished"
  on public.gallery_items for delete to authenticated
  using ((select private.has_permission('content.publish')) and status <> 'published');

create policy "gallery_item_translations: public read published"
  on public.gallery_item_translations for select to anon, authenticated
  using (
    status = 'published'
    and exists (select 1 from public.gallery_items g where g.id = item_id and g.status = 'published')
  );
create policy "gallery_item_translations: editors read all"
  on public.gallery_item_translations for select to authenticated
  using ((select private.has_permission('content.read')));
create policy "gallery_item_translations: translators insert"
  on public.gallery_item_translations for insert to authenticated
  with check ((select private.has_permission('translations.write')));
create policy "gallery_item_translations: translators update"
  on public.gallery_item_translations for update to authenticated
  using ((select private.has_permission('translations.write')))
  with check ((select private.has_permission('translations.write')));
create policy "gallery_item_translations: publishers delete unpublished"
  on public.gallery_item_translations for delete to authenticated
  using ((select private.has_permission('content.publish')) and status <> 'published');

-- Journal
create policy "journal_posts: public read published"
  on public.journal_posts for select to anon, authenticated
  using (status = 'published');
create policy "journal_posts: editors read all"
  on public.journal_posts for select to authenticated
  using ((select private.has_permission('content.read')));
create policy "journal_posts: editors insert"
  on public.journal_posts for insert to authenticated
  with check ((select private.has_permission('content.write')));
create policy "journal_posts: editors update"
  on public.journal_posts for update to authenticated
  using ((select private.has_permission('content.write')))
  with check ((select private.has_permission('content.write')));
create policy "journal_posts: publishers delete unpublished"
  on public.journal_posts for delete to authenticated
  using ((select private.has_permission('content.publish')) and status <> 'published');

create policy "journal_post_translations: public read published"
  on public.journal_post_translations for select to anon, authenticated
  using (
    status = 'published'
    and exists (select 1 from public.journal_posts p where p.id = post_id and p.status = 'published')
  );
create policy "journal_post_translations: editors read all"
  on public.journal_post_translations for select to authenticated
  using ((select private.has_permission('content.read')));
create policy "journal_post_translations: translators insert"
  on public.journal_post_translations for insert to authenticated
  with check ((select private.has_permission('translations.write')));
create policy "journal_post_translations: translators update"
  on public.journal_post_translations for update to authenticated
  using ((select private.has_permission('translations.write')))
  with check ((select private.has_permission('translations.write')));
create policy "journal_post_translations: publishers delete unpublished"
  on public.journal_post_translations for delete to authenticated
  using ((select private.has_permission('content.publish')) and status <> 'published');

-- Pages
create policy "pages: public read published"
  on public.pages for select to anon, authenticated
  using (status = 'published');
create policy "pages: editors read all"
  on public.pages for select to authenticated
  using ((select private.has_permission('content.read')));
create policy "pages: editors update"
  on public.pages for update to authenticated
  using ((select private.has_permission('content.write')))
  with check ((select private.has_permission('content.write')));

create policy "page_translations: public read published"
  on public.page_translations for select to anon, authenticated
  using (
    status = 'published'
    and exists (select 1 from public.pages p where p.key = page_key and p.status = 'published')
  );
create policy "page_translations: editors read all"
  on public.page_translations for select to authenticated
  using ((select private.has_permission('content.read')));
create policy "page_translations: translators insert"
  on public.page_translations for insert to authenticated
  with check ((select private.has_permission('translations.write')));
create policy "page_translations: translators update"
  on public.page_translations for update to authenticated
  using ((select private.has_permission('translations.write')))
  with check ((select private.has_permission('translations.write')));
create policy "page_translations: publishers delete unpublished"
  on public.page_translations for delete to authenticated
  using ((select private.has_permission('content.publish')) and status <> 'published');

create policy "page_images: public read of published pages"
  on public.page_images for select to anon, authenticated
  using (exists (select 1 from public.pages p where p.key = page_key and p.status = 'published'));
create policy "page_images: editors read all"
  on public.page_images for select to authenticated
  using ((select private.has_permission('content.read')));
create policy "page_images: editors insert"
  on public.page_images for insert to authenticated
  with check ((select private.has_permission('content.write')));
create policy "page_images: editors update"
  on public.page_images for update to authenticated
  using ((select private.has_permission('content.write')))
  with check ((select private.has_permission('content.write')));
create policy "page_images: editors delete"
  on public.page_images for delete to authenticated
  using ((select private.has_permission('content.write')));
