-- 0014: what the photo's own metadata says (position, altitude, camera) and how the station was found.
-- Family-private like the rest of media_assets (same RLS). Follower links never read these columns (src/lib/follow/view.ts).
alter table public.media_assets
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists altitude_m double precision,
  add column if not exists camera text,
  add column if not exists stop_source text,
  add column if not exists exif_read_at timestamptz;
alter table public.media_assets drop constraint if exists media_assets_position_check;
alter table public.media_assets add constraint media_assets_position_check
  check ((latitude is null) = (longitude is null) and (latitude is null or (latitude between -90 and 90 and longitude between -180 and 180)));
alter table public.media_assets drop constraint if exists media_assets_stop_source_check;
alter table public.media_assets add constraint media_assets_stop_source_check check (stop_source is null or stop_source in ('manual','gps','date'));
alter table public.media_assets drop constraint if exists media_assets_camera_check;
alter table public.media_assets add constraint media_assets_camera_check check (camera is null or length(camera) <= 120);
create index if not exists media_assets_stop_idx on public.media_assets (stop_id);
