-- 0008: small profile photo per person (family members see each other's, nobody else).
-- Stored as a tiny JPEG data URL (client downsizes to 160 px, a few KB) directly in the profile row, so it syncs offline-first
-- through the normal mutation queue and needs no storage policy. Existing profiles RLS applies unchanged:
-- readable by the person and by people sharing a family, writable only by the person themself.
alter table public.profiles add column if not exists avatar_data text;
alter table public.profiles drop constraint if exists profiles_avatar_data_check;
alter table public.profiles add constraint profiles_avatar_data_check
  check (avatar_data is null or (avatar_data like 'data:image/jpeg;base64,%' and length(avatar_data) <= 60000));
