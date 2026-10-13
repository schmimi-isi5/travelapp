-- 0009: correspondence with accommodations (mails, chats, call notes) is filed at the stay as a document of its own kind,
-- so it never counts as a receipt. Typed notes are stored as small plain-text files, which the documents bucket must accept.
-- RLS is unchanged (documents: owner and adult only). No-op for the bucket when the storage schema is absent.
alter table public.documents drop constraint if exists documents_classification_check;
alter table public.documents add constraint documents_classification_check
  check (classification in ('invoice','receipt','voucher','ticket','passport','insurance','visa','confirmation','correspondence','other'));
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice '0009: storage schema not found, skipping';
    return;
  end if;
  update storage.buckets
     set allowed_mime_types = (select array_agg(distinct m) from unnest(allowed_mime_types || array['text/plain']) as m)
   where id = 'documents';
end $$;
