-- =============================================================================
-- Chief Harena · Stage 3 · Supabase Storage for media
-- =============================================================================
-- One PRIVATE bucket, "media". Nothing in it is public by default:
--   * staff (content.read or media.write) read every file (admin previews)
--   * visitors read a file only while published content uses its asset
--     (private.media_object_is_public, the same rule the database applies)
--   * uploads (media.write) are accepted only at a path the server reserved
--     on the asset row first (assets/<asset id>/<random>.<ext>)
--   * no overwrites (no UPDATE policy); removal only of files no asset tracks
--     any more (after a deletion or replacement), so referenced files stay
-- The website serves public images through /media/... (anon key, these
-- policies apply), and the admin through an authenticated route. The server
-- secret key is never used for Storage.
--
-- Hosted Supabase: storage.objects belongs to supabase_storage_admin; creating
-- policies on it as `postgres` relies on the platform's policy grants
-- (supautils). Verify on the project after `db push` (docs/MEDIA.md).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "chief_media: staff read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'media'
    and ((select private.has_permission('content.read')) or (select private.has_permission('media.write')))
  );

create policy "chief_media: public read of images used by published content"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'media' and private.media_object_is_public(name));

create policy "chief_media: staff upload to reserved paths"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'media'
    and (select private.has_permission('media.write'))
    and private.media_upload_is_reserved(name)
  );

create policy "chief_media: staff remove untracked files"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'media'
    and (select private.has_permission('media.write'))
    and not private.media_object_is_tracked(name)
  );
