-- 0007: central library of destination photographs (public reference imagery, NOT family media).
--  * destination_images: one row per image role and place, with source, licence evidence and review state
--  * public bucket `destination-media` for the optimised WebP variants (content-addressed paths, immutable)
--  * readable by signed-in users (approved rows only); written exclusively by the import pipeline (service role)
-- Family photos stay in the private `media` bucket and in `media_assets`; nothing here references them.

create table if not exists public.destination_images (
  id uuid primary key default gen_random_uuid(),
  place_key text not null check (place_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  place_label text not null,
  country text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  radius_km integer not null default 30 check (radius_km between 1 and 500),
  role text not null check (role in ('hero', 'card', 'gallery')),
  -- storage paths inside the bucket: {desktop?, tablet?, mobile?, card?, thumb?}
  variants jsonb not null check (jsonb_typeof(variants) = 'object'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  alt_text text not null check (length(trim(alt_text)) > 0),
  source_provider text not null,
  source_id text not null,
  source_url text not null,
  photographer text,
  license_type text not null,
  license_url text,
  attribution_text text not null,
  attribution_required boolean not null default true,
  license_checked_at timestamptz not null default now(),
  license_verified boolean not null default false,
  -- true only when the file carries coordinates within radius_km of the place; otherwise it is a "regional motif"
  location_verified boolean not null default false,
  location_basis text not null default 'none',
  score numeric(6, 2),
  review_note text,
  content_hash text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  -- no publication without a verified licence
  check (not approved or license_verified),
  unique (place_key, role, content_hash)
);

create index if not exists destination_images_place_idx on public.destination_images (place_key, role) where approved;

alter table public.destination_images enable row level security;
drop policy if exists destination_images_read on public.destination_images;
create policy destination_images_read on public.destination_images for select to authenticated using (approved);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.destination_images from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.destination_images from authenticated;
    grant select on public.destination_images to authenticated;
  end if;
end $$;

-- Public bucket for the library variants: reference photos only, small WebP files, written by the service role.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice '0007_destination_images: storage schema not found, bucket skipped';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('destination-media', 'destination-media', true, 3145728, array['image/webp'])
    on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
end $$;
