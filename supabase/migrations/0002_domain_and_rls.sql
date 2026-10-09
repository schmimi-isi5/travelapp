-- 0002: align foundation with docs/DATA_CONTRACT.md, create remaining domain tables, helpers, triggers, RLS.
-- Role model: owner > adult > member > child. Finance + documents: owner/adult only.
-- Client writes to families/family_members membership go through RPCs (create_family, accept_invitation) or the owner.

-- ---------------------------------------------------------------------------
-- 1. Foundation alignment (additive / rename only)
-- ---------------------------------------------------------------------------
alter table public.families
  add column if not exists is_demo boolean not null default false,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version bigint not null default 1;

alter table public.family_members
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version bigint not null default 1;
alter table public.family_members add constraint family_members_status_check check (status in ('active','suspended','removed'));

alter table public.trips
  add column if not exists source_type text not null default 'user_entered',
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version bigint not null default 1;

alter table public.trip_stops
  add column if not exists summary text,
  add column if not exists source_reference text,
  add column if not exists highlights jsonb not null default '[]',
  add column if not exists is_demo boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='stays' and column_name='status') then
    alter table public.stays rename column status to booking_status;
  end if;
end $$;
alter table public.stays
  add column if not exists quote_status text not null default 'unknown',
  add column if not exists booking_ref text,
  add column if not exists contact text,
  add column if not exists notes text,
  add column if not exists is_demo boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now();
alter table public.stays add constraint stays_quote_status_check check (quote_status in ('unknown','quoted','confirmed'));
alter table public.stays add constraint stays_price_currency_check check (price_minor is null or currency is not null);
alter table public.stays add constraint stays_currency_format check (currency is null or currency ~ '^[A-Z]{3}$');

-- source_type vocabulary (PRODUCT_SPEC "Pflicht-Feldstatus")
alter table public.trips add constraint trips_source_type_check check (source_type in ('imported_document','user_verified','user_entered','editorial','ai_generated','demo'));
alter table public.trip_stops add constraint trip_stops_source_type_check check (source_type in ('imported_document','user_verified','user_entered','editorial','ai_generated','demo'));
alter table public.stays add constraint stays_source_type_check check (source_type in ('imported_document','user_verified','user_entered','editorial','ai_generated','demo'));

-- ---------------------------------------------------------------------------
-- 2. New tables (order respects FKs)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 100),
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role public.member_role not null default 'member' check (role <> 'owner'),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'), -- sha256 hex; raw token is never stored
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index invitations_open_email_uq on public.invitations(family_id, lower(email)) where accepted_at is null and revoked_at is null;

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_stop_id uuid not null references public.trip_stops(id) on delete cascade,
  to_stop_id uuid not null references public.trip_stops(id) on delete cascade,
  distance_km numeric(9,1) check (distance_km >= 0),
  duration_minutes integer check (duration_minutes >= 0),
  duration_source text not null default 'unknown' check (duration_source in ('unknown','estimate','imported_document','user_entered','routing_provider')),
  source_type text not null default 'user_entered' check (source_type in ('imported_document','user_verified','user_entered','editorial','ai_generated','demo')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  stop_id uuid references public.trip_stops(id) on delete set null,
  stay_id uuid references public.stays(id) on delete set null,
  kind text not null check (kind in ('hotel','flight','car','activity','park','other')),
  title text not null,
  booking_status public.booking_status not null default 'unknown',
  deadline_at timestamptz,
  reminder_at timestamptz,
  amount_minor bigint,
  currency char(3) check (currency ~ '^[A-Z]{3}$'),
  reference text,
  provider text,
  contact text,
  notes text,
  source_type text not null default 'user_entered' check (source_type in ('imported_document','user_verified','user_entered','editorial','ai_generated','demo')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  check (amount_minor is null or currency is not null)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  stay_id uuid references public.stays(id) on delete set null,
  title text,
  storage_path text not null,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint check (size_bytes >= 0),
  classification text not null default 'other' check (classification in ('invoice','receipt','voucher','ticket','passport','insurance','visa','other')),
  access_level text not null default 'adult' check (access_level in ('adult','sensitive')),
  source_type text not null default 'user_entered' check (source_type in ('imported_document','user_verified','user_entered','editorial','ai_generated','demo')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  check (storage_path like family_id::text || '/%')
);

-- payments: contract columns
alter table public.payments
  add column if not exists family_id uuid references public.families(id) on delete cascade,
  add column if not exists booking_id uuid references public.bookings(id),
  add column if not exists source_document_id uuid references public.documents(id) on delete set null,
  add column if not exists notes text,
  add column if not exists source_type text not null default 'user_entered',
  add column if not exists is_demo boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version bigint not null default 1;
update public.payments p set family_id = t.family_id from public.stays s join public.trips t on t.id = s.trip_id where s.id = p.stay_id and p.family_id is null;
alter table public.payments alter column family_id set not null;
alter table public.payments alter column stay_id drop not null;
alter table public.payments add constraint payments_target_check check (stay_id is not null or booking_id is not null);
alter table public.payments add constraint payments_currency_format check (currency ~ '^[A-Z]{3}$');
alter table public.payments add constraint payments_source_type_check check (source_type in ('imported_document','user_verified','user_entered','editorial','ai_generated','demo'));

-- action_items
alter table public.action_items
  add column if not exists family_id uuid references public.families(id) on delete cascade,
  add column if not exists stop_id uuid references public.trip_stops(id) on delete set null,
  add column if not exists booking_id uuid references public.bookings(id) on delete set null,
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists priority text not null default 'normal',
  add column if not exists is_demo boolean not null default false,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists version bigint not null default 1;
update public.action_items a set family_id = t.family_id from public.trips t where t.id = a.trip_id and a.family_id is null;
alter table public.action_items alter column family_id set not null;
alter table public.action_items add constraint action_items_priority_check check (priority in ('low','normal','high'));

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  stop_id uuid references public.trip_stops(id) on delete set null,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null default current_date,
  title text,
  body text not null default '',
  visibility text not null default 'family' check (visibility in ('family','private')),
  status text not null default 'published' check (status in ('draft','published')),
  source_type text not null default 'user_entered' check (source_type in ('imported_document','user_verified','user_entered','editorial','ai_generated','demo')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  trip_id uuid references public.trips(id) on delete set null,
  stop_id uuid references public.trip_stops(id) on delete set null,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('photo','video','audio','other')),
  storage_path text not null,
  original_name text,
  captured_at timestamptz,
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  caption text,
  album text,
  is_favorite boolean not null default false,
  visibility text not null default 'family' check (visibility in ('family','private')),
  source_type text not null default 'user_entered' check (source_type in ('imported_document','user_verified','user_entered','editorial','ai_generated','demo')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  check (storage_path like family_id::text || '/%')
);

create table public.voice_transcripts (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.media_assets(id) on delete cascade,
  provider text not null,
  body text not null default '',
  language text,
  status text not null default 'pending' check (status in ('pending','done','failed')),
  source_type text not null default 'ai_generated' check (source_type in ('imported_document','user_verified','user_entered','editorial','ai_generated','demo')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

-- family_id null = global catalogue (read-only for clients); non-null = family-specific custom species
create table public.wildlife_species (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.families(id) on delete cascade,
  common_name_de text not null,
  scientific_name text not null,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);
create unique index wildlife_species_scope_name_uq on public.wildlife_species(coalesce(family_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(scientific_name));

create table public.wildlife_sightings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  stop_id uuid references public.trip_stops(id) on delete set null,
  species_id uuid not null references public.wildlife_species(id),
  seen_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id) on delete cascade,
  count integer check (count > 0),
  notes text,
  media_id uuid references public.media_assets(id) on delete set null,
  source_type text not null default 'user_entered' check (source_type in ('imported_document','user_verified','user_entered','editorial','ai_generated','demo')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table public.sighting_favorites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  species_id uuid not null references public.wildlife_species(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (species_id, user_id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  category text not null,
  description text,
  amount_minor bigint not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  spent_at timestamptz not null default now(),
  booking_id uuid references public.bookings(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  entered_by uuid not null references auth.users(id) on delete cascade,
  source_type text not null default 'user_entered' check (source_type in ('imported_document','user_verified','user_entered','editorial','ai_generated','demo')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table public.fx_rates (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  from_currency char(3) not null check (from_currency ~ '^[A-Z]{3}$'),
  to_currency char(3) not null check (to_currency ~ '^[A-Z]{3}$'),
  rate numeric(24,10) not null check (rate > 0),
  as_of timestamptz not null,
  source text not null,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  check (from_currency <> to_currency)
);

create table public.travel_tips (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid not null references public.trip_stops(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null default 'general',
  source_type text not null default 'editorial' check (source_type in ('imported_document','user_verified','user_entered','editorial','ai_generated','demo')),
  source_reference text,
  verified_at timestamptz,
  warning_level text not null default 'info' check (warning_level in ('info','caution','warning','critical')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table public.emergency_contacts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  phone text not null,
  type text not null default 'other',
  notes text,
  available_offline boolean not null default true,
  source_type text not null default 'user_entered' check (source_type in ('imported_document','user_verified','user_entered','editorial','ai_generated','demo')),
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table public.sync_mutations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (length(device_id) between 1 and 200),
  mutation_id text not null check (length(mutation_id) between 1 and 200),
  entity_type text not null,
  entity_id uuid not null,
  base_version bigint,
  payload jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending','applied','conflict','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  unique (family_id, device_id, mutation_id)
);

create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  mutation_id uuid not null references public.sync_mutations(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  local_value jsonb,
  remote_value jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Indexes (FK / filter columns)
-- ---------------------------------------------------------------------------
create index on public.family_members(user_id);
create index on public.trip_stops(trip_id);
create index on public.stays(stop_id);
create index on public.invitations(family_id);
create index on public.routes(trip_id);
create index on public.routes(from_stop_id);
create index on public.routes(to_stop_id);
create index on public.bookings(trip_id);
create index on public.bookings(stop_id);
create index on public.bookings(stay_id);
create index on public.bookings(booking_status, deadline_at);
create index on public.documents(family_id);
create index on public.documents(booking_id);
create index on public.documents(stay_id);
create index on public.payments(family_id);
create index on public.payments(stay_id);
create index on public.payments(booking_id);
create index on public.payments(source_document_id);
create index on public.action_items(family_id);
create index on public.action_items(owner_user_id);
create index on public.action_items(stay_id);
create index on public.action_items(booking_id);
create index on public.action_items(stop_id);
create index on public.journal_entries(trip_id, entry_date);
create index on public.journal_entries(author_user_id);
create index on public.journal_entries(stop_id);
create index on public.media_assets(family_id, captured_at);
create index on public.media_assets(trip_id);
create index on public.media_assets(stop_id);
create index on public.media_assets(journal_entry_id);
create index on public.media_assets(uploaded_by);
create index on public.media_assets(storage_path);
create index on public.voice_transcripts(media_id);
create index on public.wildlife_species(family_id);
create index on public.wildlife_sightings(trip_id, seen_at);
create index on public.wildlife_sightings(stop_id);
create index on public.wildlife_sightings(species_id);
create index on public.wildlife_sightings(recorded_by);
create index on public.wildlife_sightings(media_id);
create index on public.sighting_favorites(family_id);
create index on public.sighting_favorites(user_id);
create index on public.expenses(trip_id, spent_at);
create index on public.expenses(booking_id);
create index on public.expenses(payment_id);
create index on public.fx_rates(family_id, from_currency, to_currency, as_of);
create index on public.travel_tips(stop_id);
create index on public.emergency_contacts(trip_id);
create index on public.sync_mutations(family_id, status);
create index on public.sync_mutations(user_id);
create index on public.sync_conflicts(mutation_id);

-- ---------------------------------------------------------------------------
-- 4. Helper functions (security definer, pinned search_path)
-- ---------------------------------------------------------------------------
create or replace function public.family_role(fid uuid) returns public.member_role
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.families where id = fid and owner_user_id = auth.uid()) then 'owner'::public.member_role
    else (select role from public.family_members where family_id = fid and user_id = auth.uid() and status = 'active')
  end
$$;

-- Family that owns a referenced row; null when the row does not exist.
create or replace function public.ref_family_id(kind text, rid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select case kind
    when 'trips' then (select family_id from public.trips where id = rid)
    when 'trip_stops' then (select t.family_id from public.trip_stops s join public.trips t on t.id = s.trip_id where s.id = rid)
    when 'stays' then (select t.family_id from public.stays s join public.trips t on t.id = s.trip_id where s.id = rid)
    when 'bookings' then (select t.family_id from public.bookings b join public.trips t on t.id = b.trip_id where b.id = rid)
    when 'journal_entries' then (select t.family_id from public.journal_entries j join public.trips t on t.id = j.trip_id where j.id = rid)
    when 'documents' then (select family_id from public.documents where id = rid)
    when 'payments' then (select family_id from public.payments where id = rid)
    when 'media_assets' then (select family_id from public.media_assets where id = rid)
    when 'wildlife_species' then (select family_id from public.wildlife_species where id = rid)
  end
$$;
create or replace function public.trip_family_id(tid uuid) returns uuid language sql stable security definer set search_path = public as $$ select public.ref_family_id('trips', tid) $$;
create or replace function public.stop_family_id(sid uuid) returns uuid language sql stable security definer set search_path = public as $$ select public.ref_family_id('trip_stops', sid) $$;
create or replace function public.media_family_id(mid uuid) returns uuid language sql stable security definer set search_path = public as $$ select public.ref_family_id('media_assets', mid) $$;
create or replace function public.media_uploader(mid uuid) returns uuid language sql stable security definer set search_path = public as $$ select uploaded_by from public.media_assets where id = mid $$;

create or replace function public.shares_family_with(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.family_members a join public.family_members b on a.family_id = b.family_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = uid and b.status = 'active')
$$;

create or replace function public.can_read_journal_entry(jid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.journal_entries j
    where j.id = jid
      and public.is_active_family_member(public.trip_family_id(j.trip_id))
      and (j.author_user_id = auth.uid() or (j.visibility = 'family' and j.status = 'published')))
$$;

-- Entity types whose sync payloads may carry finance data: adults only.
create or replace function public.is_restricted_entity(entity_type text) returns boolean
language sql immutable set search_path = public as $$
  select entity_type in ('payments','documents','expenses','fx_rates','bookings','stays','invoices')
$$;

create or replace function public.hash_invitation_token(token text) returns text
language sql immutable set search_path = public as $$
  select encode(sha256(convert_to(token, 'UTF8')), 'hex')
$$;

-- ---------------------------------------------------------------------------
-- 5. Trigger functions
-- ---------------------------------------------------------------------------
create or replace function public.bump_version() returns trigger language plpgsql set search_path = public as $$
begin
  new.version := old.version + 1;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.stamp_created_by() returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then new.created_by := auth.uid(); end if;
  return new;
end $$;

-- TG_ARGV: column names that must not change after insert.
create or replace function public.lock_columns() returns trigger language plpgsql set search_path = public as $$
declare c text;
begin
  foreach c in array tg_argv loop
    -- a change to NULL is allowed: it is the FK action "on delete set null" (e.g. a deleted user's created_by)
    if (to_jsonb(new) ->> c) is not null and (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
      raise exception 'column %.% is immutable', tg_table_name, c using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

-- Rejects rows that reference entities of another family (cross-tenant foreign keys).
create or replace function public.check_family_refs() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v jsonb := to_jsonb(new);
  fam uuid;
  r record;
  changed boolean := false;
begin
  -- On UPDATE only re-validate when a reference column changed (keeps FK "set null"/cascade actions working).
  if tg_op = 'UPDATE' then
    for r in select * from jsonb_each(v) loop
      if r.key in ('family_id','trip_id','stop_id','from_stop_id','to_stop_id','stay_id','booking_id','payment_id','source_document_id','journal_entry_id','media_id','species_id')
         and r.value is distinct from (to_jsonb(old) -> r.key) and r.value <> 'null'::jsonb then
        changed := true;
      end if;
    end loop;
    if not changed then return new; end if;
  end if;
  if v->>'family_id' is not null then fam := (v->>'family_id')::uuid;
  elsif v->>'trip_id' is not null then fam := public.ref_family_id('trips', (v->>'trip_id')::uuid);
  elsif v->>'stop_id' is not null then fam := public.ref_family_id('trip_stops', (v->>'stop_id')::uuid);
  elsif v->>'media_id' is not null then fam := public.ref_family_id('media_assets', (v->>'media_id')::uuid);
  end if;
  if fam is null then
    raise exception 'cannot resolve family for %', tg_table_name using errcode = '23514';
  end if;
  for r in select * from (values
    ('trip_id','trips'),('stop_id','trip_stops'),('from_stop_id','trip_stops'),('to_stop_id','trip_stops'),
    ('stay_id','stays'),('booking_id','bookings'),('payment_id','payments'),('source_document_id','documents'),
    ('journal_entry_id','journal_entries'),('media_id','media_assets')) as x(col, kind)
  loop
    if v->>r.col is not null and public.ref_family_id(r.kind, (v->>r.col)::uuid) is distinct from fam then
      raise exception 'cross-family or unknown reference: %.% = %', tg_table_name, r.col, v->>r.col using errcode = '23514';
    end if;
  end loop;
  -- species may be global (family null) or belong to the same family
  if v->>'species_id' is not null then
    perform 1 from public.wildlife_species s where s.id = (v->>'species_id')::uuid and (s.family_id is null or s.family_id = fam);
    if not found then
      raise exception 'cross-family or unknown species reference: %', v->>'species_id' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create or replace function public.check_assignee_in_family() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.owner_user_id is not distinct from old.owner_user_id then return new; end if;
  if new.owner_user_id is not null
     and not exists (select 1 from public.family_members where family_id = new.family_id and user_id = new.owner_user_id and status = 'active')
     and not exists (select 1 from public.families where id = new.family_id and owner_user_id = new.owner_user_id) then
    raise exception 'assignee % is not an active member of family %', new.owner_user_id, new.family_id using errcode = '23514';
  end if;
  return new;
end $$;

-- families.owner_user_id is immutable for clients (ownership transfer is a service-role operation).
create or replace function public.guard_family_owner() returns trigger language plpgsql set search_path = public as $$
begin
  if new.owner_user_id is distinct from old.owner_user_id and auth.uid() is not null then
    raise exception 'owner_user_id cannot be changed by clients' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger families_guard_owner before update on public.families for each row execute function public.guard_family_owner();
create trigger action_items_assignee before insert or update on public.action_items for each row execute function public.check_assignee_in_family();

do $$
declare t text;
begin
  -- version + updated_at bump
  foreach t in array array['families','family_members','profiles','trips','trip_stops','routes','stays','bookings','documents','payments',
    'action_items','journal_entries','media_assets','voice_transcripts','wildlife_species','wildlife_sightings','expenses','fx_rates',
    'travel_tips','emergency_contacts','sync_mutations'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.bump_version()', t || '_bump', t);
  end loop;
  -- created_by stamping (not forgeable by authenticated users)
  foreach t in array array['trips','trip_stops','routes','stays','bookings','documents','payments','action_items','journal_entries',
    'media_assets','voice_transcripts','wildlife_species','wildlife_sightings','expenses','fx_rates','travel_tips','emergency_contacts','invitations'] loop
    execute format('create trigger %I before insert on public.%I for each row execute function public.stamp_created_by()', t || '_stamp', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.lock_columns(%L)', t || '_lock_created_by', t, 'created_by');
  end loop;
  -- cross-family reference checks
  foreach t in array array['trip_stops','routes','stays','bookings','documents','payments','action_items','journal_entries','media_assets',
    'voice_transcripts','wildlife_sightings','sighting_favorites','expenses','travel_tips','emergency_contacts'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.check_family_refs()', t || '_family_refs', t);
  end loop;
end $$;

create trigger journal_entries_lock_author before update on public.journal_entries for each row execute function public.lock_columns('author_user_id','trip_id');
create trigger media_assets_lock_owner before update on public.media_assets for each row execute function public.lock_columns('uploaded_by','family_id');
create trigger wildlife_sightings_lock_owner before update on public.wildlife_sightings for each row execute function public.lock_columns('recorded_by','trip_id');
create trigger expenses_lock_owner before update on public.expenses for each row execute function public.lock_columns('entered_by','trip_id');
create trigger payments_lock_family before update on public.payments for each row execute function public.lock_columns('family_id');
create trigger documents_lock_family before update on public.documents for each row execute function public.lock_columns('family_id');
create trigger action_items_lock_family before update on public.action_items for each row execute function public.lock_columns('family_id','trip_id');
create trigger family_members_lock_keys before update on public.family_members for each row execute function public.lock_columns('family_id','user_id');
create trigger invitations_lock_keys before update on public.invitations for each row execute function public.lock_columns('family_id','token_hash');
create trigger sync_mutations_lock_keys before update on public.sync_mutations for each row execute function public.lock_columns('family_id','user_id','device_id','mutation_id','entity_type','entity_id','payload');
create trigger fx_rates_lock_family before update on public.fx_rates for each row execute function public.lock_columns('family_id');
create trigger wildlife_species_lock_family before update on public.wildlife_species for each row execute function public.lock_columns('family_id');
create trigger trips_lock_family before update on public.trips for each row execute function public.lock_columns('family_id');
create trigger trip_stops_lock_trip before update on public.trip_stops for each row execute function public.lock_columns('trip_id');
create trigger stays_lock_trip before update on public.stays for each row execute function public.lock_columns('trip_id');

-- ---------------------------------------------------------------------------
-- 6. Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.routes enable row level security;
alter table public.bookings enable row level security;
alter table public.documents enable row level security;
alter table public.journal_entries enable row level security;
alter table public.media_assets enable row level security;
alter table public.voice_transcripts enable row level security;
alter table public.wildlife_species enable row level security;
alter table public.wildlife_sightings enable row level security;
alter table public.sighting_favorites enable row level security;
alter table public.expenses enable row level security;
alter table public.fx_rates enable row level security;
alter table public.travel_tips enable row level security;
alter table public.emergency_contacts enable row level security;
alter table public.sync_mutations enable row level security;
alter table public.sync_conflicts enable row level security;

-- replace foundation policies with helper-based ones
drop policy if exists trip_stops_dummy on public.trip_stops;
drop policy if exists stops_read on public.trip_stops;
drop policy if exists stops_write on public.trip_stops;
drop policy if exists stays_read on public.stays;
drop policy if exists stays_write on public.stays;
drop policy if exists payments_adults on public.payments;
drop policy if exists action_read on public.action_items;
drop policy if exists action_write on public.action_items;

-- families / family_members
create policy families_update_owner on public.families for update to authenticated
  using (public.family_role(id) = 'owner') with check (public.family_role(id) = 'owner');
create policy members_insert_owner on public.family_members for insert to authenticated
  with check (public.family_role(family_id) = 'owner' and role <> 'owner');
create policy members_update_owner on public.family_members for update to authenticated
  using (public.family_role(family_id) = 'owner' and role <> 'owner')
  with check (public.family_role(family_id) = 'owner' and role <> 'owner');
create policy members_delete_owner on public.family_members for delete to authenticated
  using (public.family_role(family_id) = 'owner' and role <> 'owner');

-- profiles
create policy profiles_read on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.shares_family_with(user_id));
create policy profiles_insert_self on public.profiles for insert to authenticated with check (user_id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- invitations: owner/adult only
create policy invitations_adults on public.invitations for all to authenticated
  using (public.is_adult_family_member(family_id)) with check (public.is_adult_family_member(family_id));

-- trip structure: members read, adults write
create policy stops_read on public.trip_stops for select to authenticated using (public.is_active_family_member(public.trip_family_id(trip_id)));
create policy stops_write on public.trip_stops for all to authenticated
  using (public.is_adult_family_member(public.trip_family_id(trip_id))) with check (public.is_adult_family_member(public.trip_family_id(trip_id)));
create policy routes_read on public.routes for select to authenticated using (public.is_active_family_member(public.trip_family_id(trip_id)));
create policy routes_write on public.routes for all to authenticated
  using (public.is_adult_family_member(public.trip_family_id(trip_id))) with check (public.is_adult_family_member(public.trip_family_id(trip_id)));
create policy tips_read on public.travel_tips for select to authenticated using (public.is_active_family_member(public.stop_family_id(stop_id)));
create policy tips_write on public.travel_tips for all to authenticated
  using (public.is_adult_family_member(public.stop_family_id(stop_id))) with check (public.is_adult_family_member(public.stop_family_id(stop_id)));
create policy emergency_read on public.emergency_contacts for select to authenticated using (public.is_active_family_member(public.trip_family_id(trip_id)));
create policy emergency_write on public.emergency_contacts for all to authenticated
  using (public.is_adult_family_member(public.trip_family_id(trip_id))) with check (public.is_adult_family_member(public.trip_family_id(trip_id)));

-- finance + documents: owner/adult only (members and children get nothing)
create policy stays_adults on public.stays for all to authenticated
  using (public.is_adult_family_member(public.trip_family_id(trip_id))) with check (public.is_adult_family_member(public.trip_family_id(trip_id)));
create policy bookings_adults on public.bookings for all to authenticated
  using (public.is_adult_family_member(public.trip_family_id(trip_id))) with check (public.is_adult_family_member(public.trip_family_id(trip_id)));
create policy payments_adults on public.payments for all to authenticated
  using (public.is_adult_family_member(family_id)) with check (public.is_adult_family_member(family_id));
create policy documents_adults on public.documents for all to authenticated
  using (access_level in ('adult','sensitive') and public.is_adult_family_member(family_id))
  with check (access_level in ('adult','sensitive') and public.is_adult_family_member(family_id));
create policy expenses_adults on public.expenses for all to authenticated
  using (public.is_adult_family_member(public.trip_family_id(trip_id))) with check (public.is_adult_family_member(public.trip_family_id(trip_id)));
create policy fx_rates_adults on public.fx_rates for all to authenticated
  using (public.is_adult_family_member(family_id)) with check (public.is_adult_family_member(family_id));

-- action items: members read; adults write; assignee may update own item
create policy action_read on public.action_items for select to authenticated using (public.is_active_family_member(family_id));
create policy action_write on public.action_items for all to authenticated
  using (public.is_adult_family_member(family_id)) with check (public.is_adult_family_member(family_id));
create policy action_assignee_update on public.action_items for update to authenticated
  using (owner_user_id = auth.uid() and public.is_active_family_member(family_id))
  with check (owner_user_id = auth.uid() and public.is_active_family_member(family_id));

-- journal: author-owned; private/draft readable by author only
create policy journal_read on public.journal_entries for select to authenticated
  using (public.is_active_family_member(public.trip_family_id(trip_id))
         and (author_user_id = auth.uid() or (visibility = 'family' and status = 'published')));
create policy journal_insert on public.journal_entries for insert to authenticated
  with check (public.is_active_family_member(public.trip_family_id(trip_id)) and author_user_id = auth.uid());
create policy journal_update on public.journal_entries for update to authenticated
  using (public.is_active_family_member(public.trip_family_id(trip_id))
         and (author_user_id = auth.uid() or (public.is_adult_family_member(public.trip_family_id(trip_id)) and visibility = 'family' and status = 'published')))
  with check (public.is_active_family_member(public.trip_family_id(trip_id))
         and (author_user_id = auth.uid() or (public.is_adult_family_member(public.trip_family_id(trip_id)) and visibility = 'family' and status = 'published')));
create policy journal_delete on public.journal_entries for delete to authenticated
  using (public.is_active_family_member(public.trip_family_id(trip_id))
         and (author_user_id = auth.uid() or (public.is_adult_family_member(public.trip_family_id(trip_id)) and visibility = 'family' and status = 'published')));

-- media
create policy media_read on public.media_assets for select to authenticated
  using (public.is_active_family_member(family_id)
         and (uploaded_by = auth.uid()
              or (visibility = 'family' and (journal_entry_id is null or public.can_read_journal_entry(journal_entry_id)))));
create policy media_insert on public.media_assets for insert to authenticated
  with check (public.is_active_family_member(family_id) and uploaded_by = auth.uid());
create policy media_update on public.media_assets for update to authenticated
  using (public.is_active_family_member(family_id) and (uploaded_by = auth.uid() or (public.is_adult_family_member(family_id) and visibility = 'family')))
  with check (public.is_active_family_member(family_id) and (uploaded_by = auth.uid() or (public.is_adult_family_member(family_id) and visibility = 'family')));
create policy media_delete on public.media_assets for delete to authenticated
  using (public.is_active_family_member(family_id) and (uploaded_by = auth.uid() or (public.is_adult_family_member(family_id) and visibility = 'family')));

-- voice transcripts follow media visibility (subselect is filtered by media RLS)
create policy transcripts_read on public.voice_transcripts for select to authenticated
  using (exists (select 1 from public.media_assets m where m.id = media_id));
create policy transcripts_insert on public.voice_transcripts for insert to authenticated
  with check (public.is_active_family_member(public.media_family_id(media_id))
         and (public.media_uploader(media_id) = auth.uid() or public.is_adult_family_member(public.media_family_id(media_id))));
create policy transcripts_update on public.voice_transcripts for update to authenticated
  using (exists (select 1 from public.media_assets m where m.id = media_id)
         and (public.media_uploader(media_id) = auth.uid() or public.is_adult_family_member(public.media_family_id(media_id))))
  with check (public.media_uploader(media_id) = auth.uid() or public.is_adult_family_member(public.media_family_id(media_id)));
create policy transcripts_delete on public.voice_transcripts for delete to authenticated
  using (exists (select 1 from public.media_assets m where m.id = media_id)
         and (public.media_uploader(media_id) = auth.uid() or public.is_adult_family_member(public.media_family_id(media_id))));

-- wildlife
create policy species_read on public.wildlife_species for select to authenticated
  using (family_id is null or public.is_active_family_member(family_id));
create policy species_insert on public.wildlife_species for insert to authenticated
  with check (family_id is not null and public.is_active_family_member(family_id));
create policy species_update on public.wildlife_species for update to authenticated
  using (family_id is not null and public.is_active_family_member(family_id) and (created_by = auth.uid() or public.is_adult_family_member(family_id)))
  with check (family_id is not null and public.is_active_family_member(family_id) and (created_by = auth.uid() or public.is_adult_family_member(family_id)));
create policy species_delete on public.wildlife_species for delete to authenticated
  using (family_id is not null and public.is_active_family_member(family_id) and (created_by = auth.uid() or public.is_adult_family_member(family_id)));

create policy sightings_read on public.wildlife_sightings for select to authenticated using (public.is_active_family_member(public.trip_family_id(trip_id)));
create policy sightings_insert on public.wildlife_sightings for insert to authenticated
  with check (public.is_active_family_member(public.trip_family_id(trip_id)) and recorded_by = auth.uid());
create policy sightings_update on public.wildlife_sightings for update to authenticated
  using (public.is_active_family_member(public.trip_family_id(trip_id)) and (recorded_by = auth.uid() or public.is_adult_family_member(public.trip_family_id(trip_id))))
  with check (public.is_active_family_member(public.trip_family_id(trip_id)) and (recorded_by = auth.uid() or public.is_adult_family_member(public.trip_family_id(trip_id))));
create policy sightings_delete on public.wildlife_sightings for delete to authenticated
  using (public.is_active_family_member(public.trip_family_id(trip_id)) and (recorded_by = auth.uid() or public.is_adult_family_member(public.trip_family_id(trip_id))));

create policy sighting_favorites_own on public.sighting_favorites for all to authenticated
  using (user_id = auth.uid() and public.is_active_family_member(family_id))
  with check (user_id = auth.uid() and public.is_active_family_member(family_id));

-- sync: own queue (adults see all of the family); finance entity payloads adults only
create policy sync_mutations_read on public.sync_mutations for select to authenticated
  using (public.is_active_family_member(family_id) and (user_id = auth.uid() or public.is_adult_family_member(family_id)));
create policy sync_mutations_insert on public.sync_mutations for insert to authenticated
  with check (public.is_active_family_member(family_id) and user_id = auth.uid()
              and (not public.is_restricted_entity(entity_type) or public.is_adult_family_member(family_id)));
create policy sync_mutations_update on public.sync_mutations for update to authenticated
  using (public.is_active_family_member(family_id) and (user_id = auth.uid() or public.is_adult_family_member(family_id)))
  with check (public.is_active_family_member(family_id) and (user_id = auth.uid() or public.is_adult_family_member(family_id)));

create policy sync_conflicts_read on public.sync_conflicts for select to authenticated
  using (exists (select 1 from public.sync_mutations m
                 where m.id = sync_conflicts.mutation_id and public.is_active_family_member(m.family_id)
                   and (public.is_adult_family_member(m.family_id)
                        or (m.user_id = auth.uid() and not public.is_restricted_entity(sync_conflicts.entity_type)))));
create policy sync_conflicts_adults_write on public.sync_conflicts for all to authenticated
  using (exists (select 1 from public.sync_mutations m where m.id = sync_conflicts.mutation_id and public.is_adult_family_member(m.family_id)))
  with check (exists (select 1 from public.sync_mutations m where m.id = sync_conflicts.mutation_id and public.is_adult_family_member(m.family_id)));

-- ---------------------------------------------------------------------------
-- 7. Overview views without finance columns (members and children)
-- ---------------------------------------------------------------------------
create view public.stays_overview with (security_barrier = true) as
  select s.id, s.trip_id, s.stop_id, s.name, s.address, s.check_in, s.check_out, s.booking_status, s.is_demo, s.source_type
  from public.stays s
  where public.is_active_family_member(public.trip_family_id(s.trip_id));

create view public.bookings_overview with (security_barrier = true) as
  select b.id, b.trip_id, b.stop_id, b.stay_id, b.kind, b.title, b.booking_status, b.deadline_at, b.provider, b.is_demo
  from public.bookings b
  where public.is_active_family_member(public.trip_family_id(b.trip_id));

-- ---------------------------------------------------------------------------
-- 8. RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_family(family_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); fid uuid;
begin
  if uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  if family_name is null or length(trim(family_name)) = 0 then raise exception 'family name required' using errcode = '22023'; end if;
  insert into public.families(name, owner_user_id) values (trim(family_name), uid) returning id into fid;
  insert into public.family_members(family_id, user_id, role, status) values (fid, uid, 'owner', 'active');
  insert into public.profiles(user_id, display_name)
    select uid, coalesce(nullif(split_part(u.email, '@', 1), ''), 'user') from auth.users u where u.id = uid
    on conflict (user_id) do nothing;
  return fid;
end $$;

create or replace function public.accept_invitation(raw_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); inv public.invitations; mail text;
begin
  if uid is null then raise exception 'authentication required' using errcode = '28000'; end if;
  select email into mail from auth.users where id = uid;
  select * into inv from public.invitations
    where token_hash = public.hash_invitation_token(raw_token)
      and accepted_at is null and revoked_at is null and expires_at > now()
    for update;
  if not found or lower(inv.email) is distinct from lower(mail) then
    raise exception 'invalid or expired invitation' using errcode = '42501';
  end if;
  insert into public.family_members(family_id, user_id, role, status) values (inv.family_id, uid, inv.role, 'active')
    on conflict (family_id, user_id) do nothing;
  update public.invitations set accepted_at = now(), accepted_by = uid where id = inv.id;
  insert into public.profiles(user_id, display_name) values (uid, coalesce(nullif(split_part(mail, '@', 1), ''), 'user'))
    on conflict (user_id) do nothing;
  return inv.family_id;
end $$;

-- GDPR erasure. Returns storage paths: callers MUST delete these objects via the Storage API
-- (direct SQL deletes on storage.objects are not supported by Supabase and would orphan files).
create or replace function public.delete_family_data(fid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare paths jsonb;
begin
  if auth.uid() is null or not exists (select 1 from public.families where id = fid and owner_user_id = auth.uid()) then
    raise exception 'only the family owner may delete family data' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(p), '[]') into paths from (
    select storage_path as p from public.documents where family_id = fid
    union all select storage_path from public.media_assets where family_id = fid) x;
  delete from public.families where id = fid; -- cascades to all family-scoped tables
  return jsonb_build_object('family_id', fid, 'storage_paths', paths);
end $$;

-- ---------------------------------------------------------------------------
-- 9. Privileges (Supabase roles; skipped where roles do not exist)
-- ---------------------------------------------------------------------------
do $$
declare fn record;
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on all tables in schema public from authenticated;
    grant select, insert, update, delete on all tables in schema public to authenticated;
    -- membership/family rows are written only through RPCs / owner policies
    revoke insert, delete on public.families from authenticated;
  end if;
  for fn in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public', fn.sig);
    if exists (select 1 from pg_roles where rolname = 'anon') then execute format('revoke execute on function %s from anon', fn.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then execute format('grant execute on function %s to authenticated', fn.sig); end if;
    if exists (select 1 from pg_roles where rolname = 'service_role') then execute format('grant execute on function %s to service_role', fn.sig); end if;
  end loop;
end $$;
