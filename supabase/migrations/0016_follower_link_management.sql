-- 0016: manage follower links after creation (owner/adult only, RPCs like create/revoke).
--  * reactivate_follower_link: ended or expired link works again (same URL), with a new expiry
--  * rotate_follower_link: replaces the token (new URL, the old one stops working) and reactivates; for links whose URL is not at hand
--  * rename_follower_link, delete_follower_link

create or replace function public.follower_link_family_role(p_link_id uuid) returns public.member_role
language plpgsql stable security definer set search_path = public as $$
declare fid uuid;
begin
  select family_id into fid from public.follower_links where id = p_link_id;
  if fid is null then return null; end if;
  return public.family_role(fid);
end $$;

create or replace function public.reactivate_follower_link(p_link_id uuid, p_expires_at timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.member_role := public.follower_link_family_role(p_link_id);
begin
  if r is null or r not in ('owner', 'adult') then raise exception 'only owner or adult may reactivate follower links' using errcode = '42501'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'expiry must be in the future' using errcode = '22023'; end if;
  update public.follower_links set revoked_at = null, expires_at = p_expires_at where id = p_link_id;
end $$;

create or replace function public.rotate_follower_link(p_link_id uuid, p_token_hash text, p_expires_at timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare r public.member_role := public.follower_link_family_role(p_link_id);
begin
  if r is null or r not in ('owner', 'adult') then raise exception 'only owner or adult may renew follower links' using errcode = '42501'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'expiry must be in the future' using errcode = '22023'; end if;
  update public.follower_links set token_hash = p_token_hash, revoked_at = null, expires_at = p_expires_at, last_seen_at = null, view_count = 0 where id = p_link_id;
end $$;

create or replace function public.rename_follower_link(p_link_id uuid, p_label text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.member_role := public.follower_link_family_role(p_link_id);
begin
  if r is null or r not in ('owner', 'adult') then raise exception 'only owner or adult may rename follower links' using errcode = '42501'; end if;
  update public.follower_links set label = trim(p_label) where id = p_link_id;
end $$;

create or replace function public.delete_follower_link(p_link_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r public.member_role := public.follower_link_family_role(p_link_id);
begin
  if r is null or r not in ('owner', 'adult') then raise exception 'only owner or adult may delete follower links' using errcode = '42501'; end if;
  delete from public.follower_links where id = p_link_id;
end $$;

do $$
declare fn text;
begin
  foreach fn in array array['public.follower_link_family_role(uuid)', 'public.reactivate_follower_link(uuid,timestamptz)', 'public.rotate_follower_link(uuid,text,timestamptz)', 'public.rename_follower_link(uuid,text)', 'public.delete_follower_link(uuid)'] loop
    execute format('revoke execute on function %s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke execute on function %s from anon', fn); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('revoke execute on function %s from authenticated', fn); end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', fn); end if;
  end loop;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.reactivate_follower_link(uuid,timestamptz) to authenticated;
    grant execute on function public.rotate_follower_link(uuid,text,timestamptz) to authenticated;
    grant execute on function public.rename_follower_link(uuid,text) to authenticated;
    grant execute on function public.delete_follower_link(uuid) to authenticated;
  end if;
end $$;
