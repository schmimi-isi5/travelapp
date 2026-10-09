-- 0005: sensitive documents (passport, insurance) are encrypted in the browser before upload and arrive as opaque bytes.
-- The documents bucket must therefore accept application/octet-stream. Plain documents keep their real mime type.
-- No-op when the storage schema is absent (e.g. plain Postgres test databases).
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice '0005: storage schema not found, skipping';
    return;
  end if;
  update storage.buckets
     set allowed_mime_types = (select array_agg(distinct m) from unnest(allowed_mime_types || array['application/octet-stream']) as m)
   where id = 'documents';
end $$;
