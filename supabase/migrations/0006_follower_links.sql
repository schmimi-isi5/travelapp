-- 0006: follower links (read-only access for people who do not travel, via a private link without an account).
--  * opt-in flag per journal entry / photo / sighting; only owner/adult may publish, private rows can never be published
--  * follower_links: token hash only, revocable, optional expiry; created and revoked through RPCs (no direct client writes)
--  * followers never touch the database: the app server reads the published rows with the service role (see docs/SECURITY.md)

alter table public.journal_entries add column if not exists shared_with_followers boolean not null default false;
alter table public.media_assets add column if not exists shared_with_followers boolean not null default false;
alter table public.wildlife_sightings add column if not exists shared_with_followers boolean not null default false;

alter table public.journal_entries drop constraint if exists journal_entries_follower_share_not_private;
alter table public.journal_entries add constraint journal_entries_follower_share_not_private check (not (shared_with_followers and visibility = 'private'));
alter table public.media_assets drop constraint if exists media_assets_follower_share_not_private;
alter table public.media_assets add constraint media_assets_follower_share_not_private check (not (shared_with_followers and visibility = 'private'));

-- Publishing is an adult decision (children's and members' content included). TG_ARGV[0]: 'family' (row has family_id) or 'trip'.
create or replace function public.guard_follower_share() returns trigger language plpgsql security definer set search_path = public as $$
declare fid uuid; r public.member_role;
begin
  if not new.shared_with_followers then return new; end if;
  if tg_op = 'UPDATE' and old.shared_with_followers then return new; end if;
  if auth.uid() is null then return new; end if; -- service/maintenance access
  fid := case tg_argv[0] when 'family' then (to_jsonb(new) ->> 'family_id')::uuid else public.trip_family_id((to_jsonb(new) ->> 'trip_id')::uuid) end;
  r := public.family_role(fid);
  if r is null or r not in ('owner', 'adult') then
    raise exception 'only owner or adult may share with followers' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists journal_entries_follower_share on public.journal_entries;
create trigger journal_entries_follower_share before insert or update on public.journal_entries for each row execute function public.guard_follower_share('trip');
drop trigger if exists media_assets_follower_share on public.media_assets;
create trigger media_assets_follower_share before insert or update on public.media_assets for each row execute function public.guard_follower_share('family');
drop trigger if exists wildlife_sightings_follower_share on public.wildlife_sightings;
create trigger wildlife_sightings_follower_share before insert or update on public.wildlife_sightings for each row execute function public.guard_follower_share('trip');

create table if not exists public.follower_links (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  trip_id uuid not null references public.trips(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 80),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  view_count bigint not null default 0 check (view_count >= 0)
);
create index if not exists follower_links_family_idx on public.follower_links(family_id);
create index if not exists follower_links_trip_idx on public.follower_links(trip_id);

alter table public.follower_links enable row level security;
drop policy if exists follower_links_adults_read on public.follower_links;
create policy follower_links_adults_read on public.follower_links for select to authenticated
  using (public.family_role(family_id) in ('owner', 'adult'));

create or replace function public.create_follower_link(p_trip_id uuid, p_label text, p_token_hash text, p_expires_at timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare fid uuid := public.trip_family_id(p_trip_id); r public.member_role; new_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '28000'; end if;
  r := case when fid is null then null else public.family_role(fid) end;
  if r is null or r not in ('owner', 'adult') then raise exception 'only owner or adult may create follower links' using errcode = '42501'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'expiry must be in the future' using errcode = '22023'; end if;
  insert into public.follower_links(family_id, trip_id, label, token_hash, created_by, expires_at)
    values (fid, p_trip_id, trim(p_label), p_token_hash, auth.uid(), p_expires_at) returning id into new_id;
  return new_id;
end $$;

create or replace function public.revoke_follower_link(p_link_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare fid uuid; r public.member_role;
begin
  select family_id into fid from public.follower_links where id = p_link_id;
  r := case when fid is null then null else public.family_role(fid) end;
  if r is null or r not in ('owner', 'adult') then raise exception 'only owner or adult may revoke follower links' using errcode = '42501'; end if;
  update public.follower_links set revoked_at = coalesce(revoked_at, now()) where id = p_link_id;
end $$;

-- Called by the app server (service role) when a follower opens the page.
create or replace function public.touch_follower_link(p_link_id uuid) returns void
language sql security definer set search_path = public as $$
  update public.follower_links set last_seen_at = now(), view_count = view_count + 1 where id = p_link_id
$$;

do $$
declare fn text;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.follower_links from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.follower_links from authenticated;
    grant select on public.follower_links to authenticated;
  end if;
  foreach fn in array array['public.guard_follower_share()', 'public.create_follower_link(uuid,text,text,timestamptz)', 'public.revoke_follower_link(uuid)', 'public.touch_follower_link(uuid)'] loop
    execute format('revoke execute on function %s from public', fn);
    -- default privileges of the Supabase roles grant EXECUTE on new functions; take it back explicitly
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke execute on function %s from anon', fn); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke execute on function %s from authenticated', fn); end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', fn); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.create_follower_link(uuid,text,text,timestamptz) to authenticated;
    grant execute on function public.revoke_follower_link(uuid) to authenticated;
  end if;
end $$;
