-- =============================================================================
-- Chief Harena · Stage 3 · Media visibility, staff reads, public reads
-- =============================================================================
--   * An image is public exactly while published content on the website uses
--     it (derived here; there is no separate "public" switch to forget).
--   * Staff reads (cms_list, cms_get, media_list, media_get) run as the caller:
--     RLS decides what each role sees.
--   * Public reads (public_*) return published content only. They filter on
--     status explicitly as well, so they are safe whoever calls them, and they
--     return every published translation; the application applies the
--     documented language fallback (src/lib/localization/translations.ts).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Media visibility (used by RLS on media tables and by Storage policies)
-- -----------------------------------------------------------------------------
create function private.media_asset_is_public(p_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.services s
      where s.image_id = p_asset_id and s.status = 'published'
        and exists (select 1 from public.service_translations t where t.service_id = s.id and t.status = 'published')
    )
    or exists (
      select 1 from public.menu_items i join public.menu_categories c on c.id = i.category_id
      where i.image_id = p_asset_id and i.status = 'published' and c.status = 'published'
        and exists (select 1 from public.menu_item_translations t where t.item_id = i.id and t.status = 'published')
    )
    or exists (
      select 1 from public.gallery_items g where g.asset_id = p_asset_id and g.status = 'published'
    )
    or exists (
      select 1 from public.journal_posts j
      where j.cover_image_id = p_asset_id and j.status = 'published'
        and exists (select 1 from public.journal_post_translations t where t.post_id = j.id and t.status = 'published')
    )
    or exists (
      select 1 from public.page_images pi join public.pages p on p.key = pi.page_key
      where pi.asset_id = p_asset_id and p.status = 'published'
        and exists (select 1 from public.page_translations t where t.page_key = p.key and t.status = 'published')
    );
$$;

-- Storage object names (bucket "media") → media rules.
create function private.media_object_is_public(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.media_assets a
    where a.storage_path = p_name and a.status = 'ready' and private.media_asset_is_public(a.id)
  );
$$;

create function private.media_upload_is_reserved(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.media_assets a where a.pending_path = p_name);
$$;

-- Tracked objects are the current or reserved file of an asset; only untracked
-- objects may be removed from Storage.
create function private.media_object_is_tracked(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.media_assets a where a.storage_path = p_name or a.pending_path = p_name);
$$;

-- Visitors may read the metadata and alt text of public images only. Amharic alt
-- text is public once reviewed; otherwise the English text is used.
grant select (id, status, storage_path, mime_type, width, height, credit) on table public.media_assets to anon;
grant select (asset_id, locale, alt_text, language_reviewed_at) on table public.media_asset_translations to anon;

create policy "media_assets: public read of images in published content"
  on public.media_assets for select to anon, authenticated
  using (status = 'ready' and private.media_asset_is_public(id));

create policy "media_asset_translations: public read"
  on public.media_asset_translations for select to anon, authenticated
  using (
    (locale = 'en' or language_reviewed_at is not null)
    and exists (
      select 1 from public.media_assets a
      where a.id = asset_id and a.status = 'ready' and private.media_asset_is_public(a.id)
    )
  );

-- -----------------------------------------------------------------------------
-- 2. Staff reads
-- -----------------------------------------------------------------------------
-- One row per content entity with its English/Amharic translation state.
-- security_invoker: the caller's RLS applies (staff see everything, everyone
-- else only published rows).
create view public.cms_entries with (security_invoker = true) as
  select 'service'::text as type, s.id::text as id, s.slug, s.status, s.sort_order, s.updated_at, s.version,
         en.title as label_en, am.title as label_am, en.status as en_status, am.status as am_status,
         am.language_reviewed_at is not null as am_reviewed, s.image_id, null::uuid as parent_id
  from public.services s
  left join public.service_translations en on en.service_id = s.id and en.locale = 'en'
  left join public.service_translations am on am.service_id = s.id and am.locale = 'am'
  union all
  select 'menu_category', c.id::text, c.slug, c.status, c.sort_order, c.updated_at, c.version,
         en.name, am.name, en.status, am.status, am.language_reviewed_at is not null, null::uuid, null::uuid
  from public.menu_categories c
  left join public.menu_category_translations en on en.category_id = c.id and en.locale = 'en'
  left join public.menu_category_translations am on am.category_id = c.id and am.locale = 'am'
  union all
  select 'menu_item', i.id::text, null, i.status, i.sort_order, i.updated_at, i.version,
         en.name, am.name, en.status, am.status, am.language_reviewed_at is not null, i.image_id, i.category_id
  from public.menu_items i
  left join public.menu_item_translations en on en.item_id = i.id and en.locale = 'en'
  left join public.menu_item_translations am on am.item_id = i.id and am.locale = 'am'
  union all
  select 'gallery_item', g.id::text, null, g.status, g.sort_order, g.updated_at, g.version,
         en.caption, am.caption, en.status, am.status, am.language_reviewed_at is not null, g.asset_id, null::uuid
  from public.gallery_items g
  left join public.gallery_item_translations en on en.item_id = g.id and en.locale = 'en'
  left join public.gallery_item_translations am on am.item_id = g.id and am.locale = 'am'
  union all
  select 'journal_post', j.id::text, j.slug, j.status, 0, j.updated_at, j.version,
         en.title, am.title, en.status, am.status, am.language_reviewed_at is not null, j.cover_image_id, null::uuid
  from public.journal_posts j
  left join public.journal_post_translations en on en.post_id = j.id and en.locale = 'en'
  left join public.journal_post_translations am on am.post_id = j.id and am.locale = 'am'
  union all
  select 'page', p.key, p.key, p.status, case p.key when 'home' then 0 else 1 end, p.updated_at, p.version,
         en.title, am.title, en.status, am.status, am.language_reviewed_at is not null, null::uuid, null::uuid
  from public.pages p
  left join public.page_translations en on en.page_key = p.key and en.locale = 'en'
  left join public.page_translations am on am.page_key = p.key and am.locale = 'am';

create function public.cms_list(
  p_type text default null,
  p_search text default null,
  p_status public.publication_status default null,
  p_translation text default null,
  p_parent uuid default null,
  p_sort text default 'updated_desc',
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  type text,
  id text,
  slug text,
  status public.publication_status,
  sort_order integer,
  updated_at timestamptz,
  version integer,
  label_en text,
  label_am text,
  en_status public.publication_status,
  am_status public.publication_status,
  am_reviewed boolean,
  image_id uuid,
  parent_id uuid,
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
    select e.*
    from public.cms_entries e, params
    where (p_type is null or e.type = p_type)
      and (params.pattern is null
           or e.label_en ilike params.pattern
           or e.label_am ilike params.pattern
           or e.slug ilike params.pattern)
      and (p_status is null or e.status = p_status)
      and (p_parent is null or e.parent_id = p_parent)
      and (p_translation is null
           or (p_translation = 'missing_am' and e.am_status is null)
           or (p_translation = 'unreviewed_am' and e.am_status is not null and not e.am_reviewed)
           or (p_translation = 'missing_en' and e.en_status is null)
           or (p_translation = 'unpublished'
               and (e.en_status is distinct from 'published' or e.am_status is distinct from 'published')))
  )
  select f.type, f.id, f.slug, f.status, f.sort_order, f.updated_at, f.version, f.label_en, f.label_am,
         f.en_status, f.am_status, f.am_reviewed, f.image_id, f.parent_id, count(*) over ()
  from filtered f
  order by
    case when p_sort = 'title_asc' then lower(coalesce(f.label_en, f.label_am, f.slug, f.id)) end asc,
    case when p_sort = 'order_asc' then f.sort_order end asc,
    f.updated_at desc,
    f.id
  limit least(greatest(coalesce(p_limit, 20), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- An image as staff see it in forms and lists (RLS decides visibility).
create function private.cms_image(p_asset_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id, 'title', a.title, 'status', a.status, 'storage_path', a.storage_path, 'version', a.version,
    'width', a.width, 'height', a.height, 'mime_type', a.mime_type,
    'alt', coalesce((select jsonb_object_agg(t.locale, t.alt_text) from public.media_asset_translations t
                     where t.asset_id = a.id), '{}'::jsonb)
  )
  from public.media_assets a
  where a.id = p_asset_id;
$$;

create function private.cms_translations(p_type text, p_id text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(case p_type
    when 'service' then (select jsonb_object_agg(t.locale, to_jsonb(t)) from public.service_translations t where t.service_id::text = p_id)
    when 'menu_category' then (select jsonb_object_agg(t.locale, to_jsonb(t)) from public.menu_category_translations t where t.category_id::text = p_id)
    when 'menu_item' then (select jsonb_object_agg(t.locale, to_jsonb(t)) from public.menu_item_translations t where t.item_id::text = p_id)
    when 'gallery_item' then (select jsonb_object_agg(t.locale, to_jsonb(t)) from public.gallery_item_translations t where t.item_id::text = p_id)
    when 'journal_post' then (select jsonb_object_agg(t.locale, to_jsonb(t)) from public.journal_post_translations t where t.post_id::text = p_id)
    when 'page' then (select jsonb_object_agg(t.locale, to_jsonb(t)) from public.page_translations t where t.page_key = p_id)
  end, '{}'::jsonb);
$$;

-- One entity with its translations and referenced images, or null when the
-- caller cannot see it (or it does not exist).
create function public.cms_get(p_type text, p_id text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_type = 'page' then
    return (
      select jsonb_build_object(
        'entity', to_jsonb(p),
        'translations', private.cms_translations('page', p.key),
        'images', coalesce((select jsonb_object_agg(pi.slot, private.cms_image(pi.asset_id))
                            from public.page_images pi where pi.page_key = p.key), '{}'::jsonb)
      )
      from public.pages p where p.key = p_id
    );
  end if;

  if p_id is null or p_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  v_id := p_id::uuid;

  return case p_type
    when 'service' then (
      select jsonb_build_object('entity', to_jsonb(s), 'translations', private.cms_translations(p_type, p_id),
                                'image', private.cms_image(s.image_id))
      from public.services s where s.id = v_id)
    when 'menu_category' then (
      select jsonb_build_object('entity', to_jsonb(c), 'translations', private.cms_translations(p_type, p_id))
      from public.menu_categories c where c.id = v_id)
    when 'menu_item' then (
      select jsonb_build_object('entity', to_jsonb(i), 'translations', private.cms_translations(p_type, p_id),
                                'image', private.cms_image(i.image_id))
      from public.menu_items i where i.id = v_id)
    when 'gallery_item' then (
      select jsonb_build_object('entity', to_jsonb(g), 'translations', private.cms_translations(p_type, p_id),
                                'image', private.cms_image(g.asset_id))
      from public.gallery_items g where g.id = v_id)
    when 'journal_post' then (
      select jsonb_build_object('entity', to_jsonb(j), 'translations', private.cms_translations(p_type, p_id),
                                'image', private.cms_image(j.cover_image_id))
      from public.journal_posts j where j.id = v_id)
    else null
  end;
end;
$$;

-- Where an image is used (labels from English, else the slug/identifier).
create function private.media_usages(p_asset_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('type', u.type, 'id', u.id, 'label', u.label, 'status', u.status)
                            order by u.type, u.label), '[]'::jsonb)
  from (
    select 'service' as type, s.id::text as id, coalesce(t.title, s.slug) as label, s.status::text as status
    from public.services s
    left join public.service_translations t on t.service_id = s.id and t.locale = 'en'
    where s.image_id = p_asset_id
    union all
    select 'menu_item', i.id::text, coalesce(t.name, i.id::text), i.status::text
    from public.menu_items i
    left join public.menu_item_translations t on t.item_id = i.id and t.locale = 'en'
    where i.image_id = p_asset_id
    union all
    select 'gallery_item', g.id::text, coalesce(t.caption, g.id::text), g.status::text
    from public.gallery_items g
    left join public.gallery_item_translations t on t.item_id = g.id and t.locale = 'en'
    where g.asset_id = p_asset_id
    union all
    select 'journal_post', j.id::text, coalesce(t.title, j.slug), j.status::text
    from public.journal_posts j
    left join public.journal_post_translations t on t.post_id = j.id and t.locale = 'en'
    where j.cover_image_id = p_asset_id
    union all
    select 'page', p.key, p.key || ' · ' || pi.slot, p.status::text
    from public.page_images pi join public.pages p on p.key = pi.page_key
    where pi.asset_id = p_asset_id
  ) u;
$$;

create function public.media_list(
  p_search text default null,
  p_filter text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  status text,
  storage_path text,
  mime_type text,
  byte_size integer,
  width integer,
  height integer,
  version integer,
  updated_at timestamptz,
  alt_en text,
  alt_am text,
  am_reviewed boolean,
  usage_count integer,
  is_public boolean,
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
      else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
    end as pattern
  ),
  usage as (
    select u.asset_id, count(*)::integer as n
    from (
      select image_id as asset_id from public.services where image_id is not null
      union all select image_id from public.menu_items where image_id is not null
      union all select asset_id from public.gallery_items
      union all select cover_image_id from public.journal_posts where cover_image_id is not null
      union all select asset_id from public.page_images
    ) u
    group by u.asset_id
  ),
  assets as (
    select a.id, a.title, a.status, a.storage_path, a.mime_type, a.byte_size, a.width, a.height, a.version,
           a.updated_at, en.alt_text as alt_en, am.alt_text as alt_am,
           am.language_reviewed_at is not null as am_reviewed, coalesce(u.n, 0) as usage_count,
           a.status = 'ready' and private.media_asset_is_public(a.id) as is_public
    from public.media_assets a
    left join public.media_asset_translations en on en.asset_id = a.id and en.locale = 'en'
    left join public.media_asset_translations am on am.asset_id = a.id and am.locale = 'am'
    left join usage u on u.asset_id = a.id
    cross join params
    where params.pattern is null
       or a.title ilike params.pattern
       or a.credit ilike params.pattern
       or en.alt_text ilike params.pattern
       or am.alt_text ilike params.pattern
  )
  select a.*, count(*) over ()
  from assets a
  where p_filter is null
     or (p_filter = 'ready' and a.status = 'ready')
     or (p_filter = 'unused' and a.usage_count = 0)
     or (p_filter = 'missing_alt' and a.alt_en is null)
     or (p_filter = 'incomplete' and a.status = 'pending')
  order by a.updated_at desc, a.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create function public.media_get(p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'asset', to_jsonb(a),
    'translations', coalesce((select jsonb_object_agg(t.locale, to_jsonb(t))
                              from public.media_asset_translations t where t.asset_id = a.id), '{}'::jsonb),
    'usages', private.media_usages(a.id),
    'is_public', a.status = 'ready' and private.media_asset_is_public(a.id)
  )
  from public.media_assets a
  where a.id = p_id;
$$;

-- Files to clean up: Storage objects no asset tracks (a deletion whose file
-- removal failed, or an abandoned upload) and reservations older than an hour.
create function public.media_cleanup_candidates()
returns table (kind text, asset_id uuid, object_name text, since timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('media.write') then
    raise exception 'Not authorized to manage media' using errcode = '42501';
  end if;

  return query
    select 'untracked_file'::text, null::uuid, o.name, o.created_at
    from storage.objects o
    where o.bucket_id = 'media'
      and o.created_at < now() - interval '1 hour'
      and not private.media_object_is_tracked(o.name)
    union all
    select 'stale_upload'::text, a.id, a.pending_path, a.updated_at
    from public.media_assets a
    where a.pending_path is not null and a.updated_at < now() - interval '1 hour'
    order by 4
    limit 200;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. Public reads (published content only)
-- -----------------------------------------------------------------------------
-- A public image: path, size, credit and alt text (Amharic only once reviewed).
create function private.public_image(p_asset_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'path', a.storage_path, 'width', a.width, 'height', a.height, 'credit', a.credit,
    'alt', coalesce((select jsonb_object_agg(t.locale, t.alt_text) from public.media_asset_translations t
                     where t.asset_id = a.id and (t.locale = 'en' or t.language_reviewed_at is not null)),
                    '{}'::jsonb)
  )
  from public.media_assets a
  where a.id = p_asset_id and a.status = 'ready' and private.media_asset_is_public(a.id);
$$;

create function public.public_page(p_key text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'key', p.key,
    'translations', tr.translations,
    'images', coalesce((select jsonb_object_agg(pi.slot, private.public_image(pi.asset_id))
                        from public.page_images pi
                        where pi.page_key = p.key and private.public_image(pi.asset_id) is not null), '{}'::jsonb)
  )
  from public.pages p
  cross join lateral (
    select jsonb_object_agg(t.locale, jsonb_build_object(
             'title', t.title, 'seo_title', t.seo_title, 'seo_description', t.seo_description,
             'sections', t.sections)) as translations
    from public.page_translations t
    where t.page_key = p.key and t.status = 'published'
  ) tr
  where p.key = p_key and p.status = 'published' and tr.translations is not null;
$$;

create function public.public_services()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', s.slug, 'image', private.public_image(s.image_id), 'translations', tr.translations)
         order by s.sort_order, s.slug), '[]'::jsonb)
  from public.services s
  cross join lateral (
    select jsonb_object_agg(t.locale, jsonb_build_object('title', t.title, 'summary', t.summary)) as translations
    from public.service_translations t
    where t.service_id = s.id and t.status = 'published'
  ) tr
  where s.status = 'published' and tr.translations is not null;
$$;

create function public.public_service(p_slug text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('slug', s.slug, 'image', private.public_image(s.image_id), 'translations', tr.translations)
  from public.services s
  cross join lateral (
    select jsonb_object_agg(t.locale, jsonb_build_object(
             'title', t.title, 'summary', t.summary, 'body', t.body,
             'seo_title', t.seo_title, 'seo_description', t.seo_description)) as translations
    from public.service_translations t
    where t.service_id = s.id and t.status = 'published'
  ) tr
  where s.slug = p_slug and s.status = 'published' and tr.translations is not null;
$$;

create function public.public_menu()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'slug', c.slug, 'translations', ct.translations, 'items', items.items)
         order by c.sort_order, c.slug), '[]'::jsonb)
  from public.menu_categories c
  cross join lateral (
    select jsonb_object_agg(t.locale, jsonb_build_object('name', t.name, 'description', t.description)) as translations
    from public.menu_category_translations t
    where t.category_id = c.id and t.status = 'published'
  ) ct
  cross join lateral (
    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'dietary_tags', to_jsonb(i.dietary_tags), 'image', private.public_image(i.image_id),
             'translations', it.translations)
           order by i.sort_order, i.id) as items
    from public.menu_items i
    cross join lateral (
      select jsonb_object_agg(t.locale, jsonb_build_object('name', t.name, 'description', t.description)) as translations
      from public.menu_item_translations t
      where t.item_id = i.id and t.status = 'published'
    ) it
    where i.category_id = c.id and i.status = 'published' and it.translations is not null
  ) items
  where c.status = 'published' and ct.translations is not null and items.items is not null;
$$;

create function public.public_gallery()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', g.id, 'event_type', g.event_type, 'image', private.public_image(g.asset_id),
           'translations', coalesce(tr.translations, '{}'::jsonb))
         order by g.sort_order, g.id), '[]'::jsonb)
  from public.gallery_items g
  cross join lateral (
    select jsonb_object_agg(t.locale, jsonb_build_object('caption', t.caption)) as translations
    from public.gallery_item_translations t
    where t.item_id = g.id and t.status = 'published'
  ) tr
  where g.status = 'published' and private.public_image(g.asset_id) is not null;
$$;

-- Articles available in a locale: its own translation, or English (fallback).
create function public.public_journal(p_locale public.locale_code, p_limit integer default 12, p_offset integer default 0)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with posts as (
    select j.id, j.slug, j.published_at, j.cover_image_id, tr.translations
    from public.journal_posts j
    cross join lateral (
      select jsonb_object_agg(t.locale, jsonb_build_object('title', t.title, 'excerpt', t.excerpt)) as translations
      from public.journal_post_translations t
      where t.post_id = j.id and t.status = 'published'
    ) tr
    where j.status = 'published' and (tr.translations ? p_locale::text or tr.translations ? 'en')
  )
  select jsonb_build_object(
    'total', (select count(*) from posts),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', p.slug, 'published_at', p.published_at, 'image', private.public_image(p.cover_image_id),
               'translations', p.translations)
             order by p.published_at desc nulls last, p.slug)
      from (select * from posts order by published_at desc nulls last, slug
            limit least(greatest(coalesce(p_limit, 12), 1), 50) offset greatest(coalesce(p_offset, 0), 0)) p
    ), '[]'::jsonb)
  );
$$;

create function public.public_journal_post(p_slug text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', j.slug, 'published_at', j.published_at, 'image', private.public_image(j.cover_image_id),
    'translations', tr.translations)
  from public.journal_posts j
  cross join lateral (
    select jsonb_object_agg(t.locale, jsonb_build_object(
             'title', t.title, 'excerpt', t.excerpt, 'body', t.body,
             'seo_title', t.seo_title, 'seo_description', t.seo_description)) as translations
    from public.journal_post_translations t
    where t.post_id = j.id and t.status = 'published'
  ) tr
  where j.slug = p_slug and j.status = 'published' and tr.translations is not null;
$$;

-- Which public sections have content in each language (navigation shows only
-- sections that exist). Amharic pages may fall back to English content.
create function public.public_navigation()
returns jsonb
language sql
stable
set search_path = ''
as $$
  with locales as (
    select 'en'::text as locale, array['en'] as accepted
    union all select 'am', array['am', 'en']
  )
  select jsonb_object_agg(l.locale, jsonb_build_object(
    'about', exists (
      select 1 from public.pages p join public.page_translations t on t.page_key = p.key
      where p.key = 'about' and p.status = 'published' and t.status = 'published' and t.locale::text = any (l.accepted)),
    'services', exists (
      select 1 from public.services s join public.service_translations t on t.service_id = s.id
      where s.status = 'published' and t.status = 'published' and t.locale::text = any (l.accepted)),
    'menu', exists (
      select 1 from public.menu_items i
      join public.menu_categories c on c.id = i.category_id
      join public.menu_item_translations t on t.item_id = i.id
      join public.menu_category_translations ct on ct.category_id = c.id
      where i.status = 'published' and c.status = 'published' and t.status = 'published' and ct.status = 'published'
        and t.locale::text = any (l.accepted) and ct.locale::text = any (l.accepted)),
    'gallery', exists (
      select 1 from public.gallery_items g join public.media_assets a on a.id = g.asset_id
      where g.status = 'published' and a.status = 'ready'),
    'journal', exists (
      select 1 from public.journal_posts j join public.journal_post_translations t on t.post_id = j.id
      where j.status = 'published' and t.status = 'published' and t.locale::text = any (l.accepted))
  ))
  from locales l;
$$;

-- -----------------------------------------------------------------------------
-- 4. Function privileges
-- -----------------------------------------------------------------------------
-- RLS and Storage policies evaluated for visitors call private helpers, so anon
-- needs USAGE on the schema. `private` is still not exposed by the Data API.
grant usage on schema private to anon;

revoke all on table public.cms_entries from anon, authenticated, service_role;
grant select on table public.cms_entries to authenticated;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.has_permission(public.app_permission) to authenticated;
grant execute on function private.staff_display_name(uuid) to authenticated;
grant execute on function
  private.media_asset_is_public(uuid),
  private.media_object_is_public(text),
  private.public_image(uuid)
to anon, authenticated;
grant execute on function
  private.media_upload_is_reserved(text),
  private.media_object_is_tracked(text),
  private.cms_image(uuid),
  private.cms_translations(text, text),
  private.media_usages(uuid)
to authenticated;

revoke all on function
  public.cms_list(text, text, public.publication_status, text, uuid, text, integer, integer),
  public.cms_get(text, text),
  public.media_list(text, text, integer, integer),
  public.media_get(uuid),
  public.media_cleanup_candidates(),
  public.public_page(text),
  public.public_services(),
  public.public_service(text),
  public.public_menu(),
  public.public_gallery(),
  public.public_journal(public.locale_code, integer, integer),
  public.public_journal_post(text),
  public.public_navigation()
from public, anon, authenticated, service_role;

grant execute on function
  public.cms_list(text, text, public.publication_status, text, uuid, text, integer, integer),
  public.cms_get(text, text),
  public.media_list(text, text, integer, integer),
  public.media_get(uuid),
  public.media_cleanup_candidates()
to authenticated;

grant execute on function
  public.public_page(text),
  public.public_services(),
  public.public_service(text),
  public.public_menu(),
  public.public_gallery(),
  public.public_journal(public.locale_code, integer, integer),
  public.public_journal_post(text),
  public.public_navigation()
to anon, authenticated;
