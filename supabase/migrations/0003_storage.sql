-- 0003: private storage buckets + storage.objects policies. No-op when the Supabase storage schema is absent.
-- Object path convention: <family_id>/<anything>. Documents bucket: owner/adult only.

create or replace function public.storage_family_id(object_name text) returns uuid
language sql immutable set search_path = public as $$
  select case when split_part(object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then split_part(object_name, '/', 1)::uuid end
$$;

-- Media objects: family member, and the linked media row (if any) must be readable for the caller.
create or replace function public.can_read_media_object(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_active_family_member(public.storage_family_id(object_name))
    and not exists (
      select 1 from public.media_assets m
      where m.storage_path = object_name
        and not (m.uploaded_by = auth.uid()
                 or (m.visibility = 'family' and (m.journal_entry_id is null or public.can_read_journal_entry(m.journal_entry_id)))))
$$;

do $$
declare r record;
begin
  if to_regclass('storage.buckets') is null or to_regclass('storage.objects') is null then
    raise notice '0003_storage: storage schema not found, skipping';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
    ('media', 'media', false, 104857600, array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm','audio/mpeg','audio/mp4','audio/x-m4a','audio/webm','audio/ogg','audio/wav']),
    ('documents', 'documents', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp','image/heic'])
  on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  for r in select polname from pg_policy where polrelid = 'storage.objects'::regclass and polname like 'travelapp\_%' loop
    execute format('drop policy %I on storage.objects', r.polname);
  end loop;

  create policy travelapp_media_read on storage.objects for select to authenticated
    using (bucket_id = 'media' and public.can_read_media_object(name));
  create policy travelapp_media_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'media' and public.is_active_family_member(public.storage_family_id(name)));
  create policy travelapp_media_update on storage.objects for update to authenticated
    using (bucket_id = 'media' and public.is_active_family_member(public.storage_family_id(name))
           and (owner_id = auth.uid()::text or public.is_adult_family_member(public.storage_family_id(name))))
    with check (bucket_id = 'media' and public.is_active_family_member(public.storage_family_id(name)));
  create policy travelapp_media_delete on storage.objects for delete to authenticated
    using (bucket_id = 'media' and public.is_active_family_member(public.storage_family_id(name))
           and (owner_id = auth.uid()::text or public.is_adult_family_member(public.storage_family_id(name))));

  create policy travelapp_documents_all on storage.objects for all to authenticated
    using (bucket_id = 'documents' and public.is_adult_family_member(public.storage_family_id(name)))
    with check (bucket_id = 'documents' and public.is_adult_family_member(public.storage_family_id(name)));
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke execute on function public.storage_family_id(text), public.can_read_media_object(text) from public, anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'grant execute on function public.storage_family_id(text), public.can_read_media_object(text) to authenticated';
  end if;
end $$;
