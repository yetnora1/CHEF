-- =============================================================================
-- CHEF SIS · Every photo and video of the website in the media library
-- =============================================================================
-- The website's own photographs and clips ship with the code (src/assets,
-- public/videos), so the library could not show, edit or delete them. Each one
-- now has a media_assets row, and the public site reads those rows:
--
--   * status 'bundled': the file ships with the site; bundled_key names it in
--     src/features/content/bundled-media.ts (a test keeps the two in step)
--   * replacing the file uploads to Storage as usual (status 'ready'); going
--     back to the bundled file removes that upload
--   * deleting sets removed_at and takes it off the site. The bundled file stays
--     in the code, so it can be restored
--   * kind 'video': videos are stored like images, but a browser uploads them
--     directly to Storage (up to 50 MB, more than a server request can carry),
--     and an uploaded video joins the homepage video row at once
-- =============================================================================

alter table public.media_assets
  add column kind text not null default 'image'
    constraint media_assets_kind_valid check (kind in ('image', 'video')),
  add column bundled_key text constraint media_assets_bundled_key_unique unique,
  add column removed_at timestamptz;

alter table public.media_assets
  drop constraint media_assets_status_valid,
  drop constraint media_assets_mime_valid,
  drop constraint media_assets_size_range,
  drop constraint media_assets_storage_path_format,
  drop constraint media_assets_pending_path_format,
  drop constraint media_assets_extension_matches_type;

alter table public.media_assets
  add constraint media_assets_status_valid check (status in ('pending', 'ready', 'bundled')),
  add constraint media_assets_mime_valid
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm')),
  add constraint media_assets_size_range
    check (byte_size between 1 and case when kind = 'video' then 52428800 else 10485760 end),
  add constraint media_assets_storage_path_format
    check (storage_path ~ ('^assets/' || id::text || '/[0-9a-f]{32}\.(jpg|png|webp|mp4|webm)$')),
  add constraint media_assets_pending_path_format
    check (pending_path ~ ('^assets/' || id::text || '/[0-9a-f]{32}\.(jpg|png|webp|mp4|webm)$')),
  add constraint media_assets_extension_matches_type check (
    storage_path is null or mime_type = case substring(storage_path from '\.([a-z0-9]+)$')
      when 'jpg' then 'image/jpeg' when 'png' then 'image/png' when 'webp' then 'image/webp'
      when 'mp4' then 'video/mp4' when 'webm' then 'video/webm' end
  ),
  add constraint media_assets_kind_matches_type
    check (mime_type is null or (kind = 'video') = (mime_type like 'video/%')),
  add constraint media_assets_bundled_complete check (
    status <> 'bundled'
    or (bundled_key is not null and storage_path is null and mime_type is null and byte_size is null
        and width is null and height is null)
  ),
  add constraint media_assets_removed_only_bundled check (removed_at is null or status = 'bundled');

comment on table public.media_assets is
  'Every image and video of the website: uploads in the private Storage bucket "media", and files bundled with the site (status bundled). Uploaded images are public only while published content uses them.';

-- The bucket also takes videos. Images keep their 10 MB limit in the upload route
-- and in media_assets_size_range.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
where id = 'media';

-- -----------------------------------------------------------------------------
-- Lifecycle, as before, with the bundled states added:
--   * a new asset starts as pending, without a file, and is never bundled
--   * kind and bundled_key never change
--   * storage_path changes only by finalising the reserved upload, or by going
--     back to the bundled file
-- -----------------------------------------------------------------------------
create or replace function private.enforce_media_asset_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.storage_path is not null
       or new.bundled_key is not null or new.removed_at is not null then
      raise exception 'A new image starts as a pending upload' using errcode = '22023';
    end if;
    return new;
  end if;

  if new.kind is distinct from old.kind or new.bundled_key is distinct from old.bundled_key then
    raise exception 'The kind of a file and its bundled key cannot change' using errcode = '22023';
  end if;

  if old.status = 'ready' and new.status = 'bundled' then
    return new;
  end if;

  if old.status = 'ready' and new.status <> 'ready' then
    raise exception 'A finished image cannot return to pending' using errcode = '22023';
  end if;

  if new.status <> old.status and new.status <> 'ready' then
    raise exception 'This change of status is not allowed' using errcode = '22023';
  end if;

  if new.storage_path is distinct from old.storage_path then
    if new.storage_path is null or new.storage_path is distinct from old.pending_path
       or new.pending_path is not null then
      raise exception 'The file can only change by completing the reserved upload' using errcode = '22023';
    end if;
    if not exists (
      select 1 from storage.objects o where o.bucket_id = 'media' and o.name = new.storage_path
    ) then
      raise exception 'The uploaded file was not found' using errcode = '22023', hint = 'upload_missing';
    end if;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Audit: deleting, restoring and going back to the bundled file have their own names.
-- -----------------------------------------------------------------------------
create or replace function private.audit_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type constant text := tg_argv[0];
  prefix constant text := case when target_type like 'media%' then 'media' else 'content' end;
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  row_data jsonb := coalesce(new_row, old_row);
  changed text[];
  action text;
  details jsonb := '{}'::jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(array_agg(n.key order by n.key), '{}') into changed
    from jsonb_each(new_row) n
    where n.key not in ('updated_at', 'updated_by', 'version', 'language_reviewed_by')
      and (old_row -> n.key) is distinct from n.value;
    if cardinality(changed) = 0 then
      return null;
    end if;
    details := jsonb_build_object('fields', to_jsonb(changed));
  end if;

  action := case
    when tg_op = 'INSERT' then prefix || '.created'
    when tg_op = 'DELETE' then prefix || '.deleted'
    when target_type = 'media_asset' and (old_row ->> 'removed_at') is null and (new_row ->> 'removed_at') is not null
      then 'media.removed'
    when target_type = 'media_asset' and (old_row ->> 'removed_at') is not null and (new_row ->> 'removed_at') is null
      then 'media.restored'
    when target_type = 'media_asset' and (old_row ->> 'status') = 'ready' and (new_row ->> 'status') = 'bundled'
      then 'media.reverted'
    when target_type = 'media_asset' and (old_row ->> 'status') in ('pending', 'bundled') and (new_row ->> 'status') = 'ready'
      then 'media.uploaded'
    when target_type = 'media_asset' and (old_row ->> 'storage_path') is not null
         and (old_row ->> 'storage_path') is distinct from (new_row ->> 'storage_path')
      then 'media.replaced'
    when (old_row ->> 'status') is distinct from (new_row ->> 'status') then prefix || '.status_changed'
    else prefix || '.updated'
  end;

  if row_data ? 'status' and target_type <> 'media_asset' then
    details := details || jsonb_build_object('status', row_data ->> 'status');
    if tg_op = 'UPDATE' and (old_row ->> 'status') is distinct from (new_row ->> 'status') then
      details := details || jsonb_build_object('from', old_row ->> 'status');
    end if;
  end if;
  if row_data ? 'locale' then
    details := details || jsonb_build_object('locale', row_data ->> 'locale');
  end if;
  if row_data ? 'language_reviewed_at' and tg_op = 'UPDATE'
     and (old_row -> 'language_reviewed_at') is distinct from (new_row -> 'language_reviewed_at') then
    details := details || jsonb_build_object(
      'review', case when (new_row ->> 'language_reviewed_at') is null then 'cleared' else 'confirmed' end);
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), action, target_type, row_data ->> tg_argv[1], details);
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Access: staff may set the kind of a new asset and delete or restore a bundled
-- one. The bundled key is set here only, and a bundled row is never deleted.
-- -----------------------------------------------------------------------------
grant insert (kind), update (removed_at) on table public.media_assets to authenticated;

alter policy "media_assets: media managers delete" on public.media_assets
  using ((select private.has_permission('media.write')) and bundled_key is null);

-- A file of the website itself is public unless deleted: the replacement of a
-- bundled file, and every uploaded video (the homepage video row shows them all).
-- Uploaded images stay private until published content uses them.
create or replace function private.media_asset_is_public(p_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.media_assets a
      where a.id = p_asset_id and a.removed_at is null and (a.bundled_key is not null or a.kind = 'video')
    )
    or exists (
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

-- -----------------------------------------------------------------------------
-- Staff reads
-- -----------------------------------------------------------------------------
drop function public.media_list(text, text, integer, integer);

-- Deleted files appear only under the 'removed' filter. 'ready' is also what the
-- picker in content forms lists, so it holds uploaded images only: bundled files
-- and videos already have their place on the site.
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
  kind text,
  bundled_key text,
  removed_at timestamptz,
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
    select a.id, a.title, a.status, a.kind, a.bundled_key, a.removed_at, a.storage_path, a.mime_type,
           a.byte_size, a.width, a.height, a.version, a.updated_at,
           en.alt_text as alt_en, am.alt_text as alt_am,
           am.language_reviewed_at is not null as am_reviewed, coalesce(u.n, 0) as usage_count,
           (a.status = 'ready' and private.media_asset_is_public(a.id))
             or (a.status = 'bundled' and a.removed_at is null) as is_public
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
  where case when p_filter = 'removed' then a.removed_at is not null
    else a.removed_at is null and (
      p_filter is null
      or (p_filter = 'images' and a.kind = 'image')
      or (p_filter = 'videos' and a.kind = 'video')
      or (p_filter = 'ready' and a.status = 'ready' and a.kind = 'image' and a.bundled_key is null)
      or (p_filter = 'unused' and a.usage_count = 0 and a.kind = 'image' and a.bundled_key is null)
      or (p_filter = 'missing_alt' and a.alt_en is null)
      or (p_filter = 'incomplete' and a.status = 'pending')
    )
  end
  order by a.updated_at desc, a.title, a.id
  limit least(greatest(coalesce(p_limit, 24), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.media_get(p_id uuid)
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
    'is_public', (a.status = 'ready' and private.media_asset_is_public(a.id))
                 or (a.status = 'bundled' and a.removed_at is null)
  )
  from public.media_assets a
  where a.id = p_id;
$$;

revoke all on function public.media_list(text, text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.media_list(text, text, integer, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Public read: the website's own files as they stand. A deleted file says so and
-- nothing else; titles stay with staff; Amharic descriptions only once reviewed.
-- SECURITY DEFINER because visitors cannot read bundled rows, which hold no file.
-- -----------------------------------------------------------------------------
create function public.public_site_media()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'key', a.bundled_key,
      'kind', a.kind,
      'removed', a.removed_at is not null,
      'credit', case when a.removed_at is null then a.credit end,
      'alt', case when a.removed_at is null then coalesce(
        (select jsonb_object_agg(t.locale, t.alt_text) from public.media_asset_translations t
         where t.asset_id = a.id and (t.locale = 'en' or t.language_reviewed_at is not null)),
        '{}'::jsonb) else '{}'::jsonb end,
      'file', case when a.status = 'ready'
        then jsonb_build_object('path', a.storage_path, 'width', a.width, 'height', a.height) end
    )
    order by a.created_at desc, a.id
  ), '[]'::jsonb)
  from public.media_assets a
  where a.status in ('bundled', 'ready') and (a.bundled_key is not null or a.kind = 'video');
$$;

revoke all on function public.public_site_media() from public, anon, authenticated, service_role;
grant execute on function public.public_site_media() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- The bundled files. Keys and English descriptions equal the code's registry
-- (tests/integration/db/site-media.test.ts). No credit here: a sample's author and
-- licence stay with the code while its file is used, and go away when it is replaced.
-- No audit rows: nobody did anything, and 84 entries would bury the real log.
-- -----------------------------------------------------------------------------
alter table public.media_assets disable trigger media_assets_audit;
alter table public.media_asset_translations disable trigger media_asset_translations_audit;

with bundled (bundled_key, kind, title, alt) as (
  values
    ('chef/chicken-platter', 'image', 'Chicken platter', 'Roast chicken drumsticks piled on a steel tray, ringed with orange pepper and topped with a yellow pepper cut into a flower.'),
    ('chef/chef-at-buffet', 'image', 'Chef at the buffet', 'A chef in a white coat and toque points along a line of chafing dishes, beside a tray of roast chicken.'),
    ('chef/sushi-platter', 'image', 'Sushi platter', 'Rows of sushi rolls laid out on a banana leaf.'),
    ('chef/injera-platter', 'image', 'Injera platter', 'A round platter of injera with dark red stews, fresh ayib cheese and green chillies, rolled injera around the edge.'),
    ('chef/banquet-hall', 'image', 'Banquet hall', 'A banquet room with platters of food on a red tablecloth, chafing dishes along the wall and woven mesob baskets at the side.'),
    ('chef/finger-food', 'image', 'Finger food', 'Trays of finger food on cocktail sticks, a platter of halved eggs and a plate of small round bites.'),
    ('chef/salad-platters', 'image', 'Salad platters', 'A row of oval platters of salads on a red cloth, decorated with tomato roses.'),
    ('chef/chef-chafing-line', 'image', 'Chef by the chafing dishes', 'A chef in a white coat beside a long row of steel chafing dishes in a banquet hall.'),
    ('chef/roast-drumsticks', 'image', 'Roast drumsticks', 'A steel tray packed with rows of roasted chicken drumsticks.'),
    ('chef/vegetable-platter', 'image', 'Vegetable platter', 'A large injera platter of split peas, lentils, greens and other vegetable dishes around a fresh salad.'),
    ('chef/evening-buffet', 'image', 'Evening buffet', 'An evening buffet table of carved fruit, salads and meat platters, with a flame burning at the back.'),
    ('chef/beef-risotto', 'image', 'Beef risotto', 'Dark braised beef on risotto with green peas, on a white plate.'),
    ('chef/buffet-hall', 'image', 'Buffet hall', 'A long buffet of chafing dishes down one side of a hall, with a chef walking between the tables.'),
    ('chef/salmon-bowl', 'image', 'Salmon bowl', 'Glazed salmon pieces in a white bowl with ribbons of courgette and carrot, edamame beans and sesame seeds.'),
    ('chef/chef-at-stove', 'image', 'Chef at the stove', 'A chef in a dark coat and white toque cooking at large pots in a restaurant kitchen.'),
    ('chef/topped-toast', 'image', 'Topped toast', 'Thick toast topped with a creamy filling, a dark glaze and fine strips of cucumber and red onion.'),
    ('chef/meat-and-rice', 'image', 'Meat and rice', 'A plate of stewed meat in a dark sauce with two mounds of rice, on lettuce.'),
    ('chef/crumbed-cutlets', 'image', 'Crumbed cutlets', 'A steel tray piled high with golden breadcrumbed cutlets.'),
    ('chef/chef-buffet-trays', 'image', 'Chef with buffet trays', 'A chef in a white coat beside a counter of steel trays filled with stews, rice and meat.'),
    ('chef/fried-potatoes', 'image', 'Fried potatoes', 'A steel tray of golden fried potato slices.'),
    ('sample/culinary-experiences', 'image', 'Coffee ceremony', 'A jebena on a charcoal stove beside a pan of freshly roasted coffee beans.'),
    ('sample/injera', 'image', 'Fresh injera', 'A freshly baked injera lifted from the griddle in a smoky kitchen.'),
    ('sample/wat', 'image', 'Doro wat', 'A bowl of deep red doro wat with a hard-boiled egg, beside injera.'),
    ('sample/fasting', 'image', 'Fasting platter', 'A fasting platter of injera with lentils, split peas, greens, beetroot and potatoes.'),
    ('sample/dish-shiro', 'image', 'Shiro', 'Shiro being spooned onto injera from a small black clay pot.'),
    ('sample/dish-kik-alicha', 'image', 'Kik alicha', 'A golden mound of kik alicha, yellow split peas, on injera beside gomen.'),
    ('sample/dish-gomen', 'image', 'Gomen', 'Dark, silky gomen, cooked collard greens, on injera between lentils and split peas.'),
    ('sample/dish-beyaynetu', 'image', 'Beyaynetu', 'A tray of fasting beyaynetu: many small vegetable stews and salads on injera, with a green chilli.'),
    ('sample/dish-doro-wat', 'image', 'Doro wat on injera', 'A piece of doro wat chicken and a hard-boiled egg in berbere sauce on injera.'),
    ('sample/dish-kitfo', 'image', 'Kitfo', 'A platter of kitfo with ayib cheese, gomen, mitmita and rolled kocho bread on a leaf.'),
    ('sample/dish-tibs', 'image', 'Tibs', 'Tibs: pieces of beef sautéed with onion, tomato and green chilli on a plate, with red chilli powder.'),
    ('sample/dish-shekla-tibs', 'image', 'Shekla tibs', 'Shekla tibs topped with green chilli in a clay pot over glowing embers, with rolls of injera on a tray.'),
    ('sample/dish-zilzil-tibs', 'image', 'Zilzil tibs', 'Strips of zilzil tibs on injera, with gomen and two vegetable stews.'),
    ('sample/dish-gored-gored', 'image', 'Gored gored', 'Cubes of gored gored in red awaze, topped with chopped green chilli, on injera.'),
    ('sample/dish-kurt', 'image', 'Kurt', 'A platter of raw beef with knives for cutting it at the table, rolls of injera and a clay bowl of awaze.'),
    ('sample/dish-ayib-gomen', 'image', 'Ayib and gomen', 'Fresh white ayib cheese beside gomen on injera, with a bowl of red stew.'),
    ('video/platter', 'video', 'Injera platter close-up', 'A close look at a platter of injera topped with stews, vegetables and fresh cheese.'),
    ('video/ceremony', 'video', 'Coffee ceremony', 'A coffee ceremony: freshly roasted beans are shown in the pan above rows of small cups.'),
    ('video/shared', 'video', 'Shared platter', 'A shared injera platter on a table, seen from above.'),
    ('video/serving', 'video', 'Serving stew', 'A stew being spooned onto a platter of injera already topped with other dishes.'),
    ('video/popcorn', 'video', 'Coffee and popcorn', 'Coffee beans roasting beside a tray of popcorn on a floor strewn with petals and fresh grass, seen from above.'),
    ('video/coffee', 'video', 'Roasting coffee', 'Coffee beans roasting in a pan over charcoal, among fresh grass and flowers.')
),
seeded as (
  insert into public.media_assets (bundled_key, kind, status, title)
  select b.bundled_key, b.kind, 'bundled', b.title from bundled b
  returning id, bundled_key
)
insert into public.media_asset_translations (asset_id, locale, alt_text)
select s.id, 'en', b.alt
from seeded s join bundled b on b.bundled_key = s.bundled_key;

alter table public.media_assets enable trigger media_assets_audit;
alter table public.media_asset_translations enable trigger media_asset_translations_audit;
