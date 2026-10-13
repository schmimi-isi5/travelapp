-- 0012: travel documents for the whole family (boarding passes) and rental contracts.
--  * documents.classification gets 'contract' (rental car contract, booking contract)
--  * documents.access_level gets 'family': readable by every active family member (also children), writable by adults only.
--    'adult' and 'sensitive' stay as they are (adults only). The storage object of a family-level document is readable the same way.
-- No-op for the storage policy when the storage schema is absent.
alter table public.documents drop constraint if exists documents_classification_check;
alter table public.documents add constraint documents_classification_check
  check (classification in ('invoice','receipt','voucher','ticket','passport','insurance','visa','confirmation','correspondence','contract','other'));
alter table public.documents drop constraint if exists documents_access_level_check;
alter table public.documents add constraint documents_access_level_check check (access_level in ('adult','sensitive','family'));

drop policy if exists documents_adults on public.documents;
create policy documents_adults on public.documents for all to authenticated
  using (access_level in ('adult','sensitive','family') and public.is_adult_family_member(family_id))
  with check (access_level in ('adult','sensitive','family') and public.is_adult_family_member(family_id));
drop policy if exists documents_family_read on public.documents;
create policy documents_family_read on public.documents for select to authenticated
  using (access_level = 'family' and public.is_active_family_member(family_id));

create or replace function public.can_read_family_document(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.documents d where d.storage_path = object_name and d.access_level = 'family' and public.is_active_family_member(d.family_id))
$$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then execute 'revoke execute on function public.can_read_family_document(text) from public, anon'; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then execute 'grant execute on function public.can_read_family_document(text) to authenticated'; end if;
  if to_regclass('storage.objects') is null then
    raise notice '0012: storage schema not found, skipping the storage policy';
    return;
  end if;
  execute 'drop policy if exists travelapp_documents_family_read on storage.objects';
  execute $p$create policy travelapp_documents_family_read on storage.objects for select to authenticated
    using (bucket_id = 'documents' and public.can_read_family_document(name))$p$;
end $$;
