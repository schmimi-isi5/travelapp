-- 0015: photos are shown to follower links by default; a photo is held back only when somebody hides it (opt-out).
-- A photo reaches followers when it is a family photo (never private), not hidden, and its station has been reached.
-- Journal entries and sightings stay opt-in (shared_with_followers). The old media_assets.shared_with_followers flag is no longer read.
alter table public.media_assets add column if not exists hidden_from_followers boolean not null default false;
