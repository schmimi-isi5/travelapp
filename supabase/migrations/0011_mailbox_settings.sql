-- 0011: IMAP access of the trip mailbox, set up in the app by the family owner instead of server variables.
-- The password is stored encrypted by the server (AES-GCM, key from the server secrets), never readable through the API:
-- clients have no access to this table at all, the server routes return only the non-secret fields.
create table if not exists public.mailbox_settings (
  family_id uuid primary key references public.families(id) on delete cascade,
  host text not null check (length(host) between 3 and 253),
  port integer not null check (port between 1 and 65535),
  is_secure boolean not null default true,
  username text not null check (length(username) between 1 and 320),
  password_enc text not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.mailbox_settings enable row level security;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.mailbox_settings from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then revoke all on public.mailbox_settings from authenticated; end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then grant all on public.mailbox_settings to service_role; end if;
end $$;
