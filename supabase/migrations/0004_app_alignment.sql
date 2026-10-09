-- 0004: align the database with the app's data model (additive, safe to apply on top of 0001..0003).
--  * columns the app already writes but 0002 did not model (provenance, planned dates, journal extras)
--  * document classification 'confirmation' (booking confirmations)
--  * custom wildlife species without scientific name
--  * global wildlife catalogue (family_id is null; read-only for clients, see species_read policy)
--  * overview views expose version/updated_at so clients can use them for optimistic concurrency

alter table public.trip_stops add column if not exists verified_at timestamptz;

alter table public.stays
  add column if not exists due_at date,
  add column if not exists verified_at timestamptz,
  add column if not exists source_reference text;

alter table public.bookings
  add column if not exists starts_at timestamptz,
  add column if not exists verified_at timestamptz,
  add column if not exists source_reference text;

alter table public.journal_entries
  add column if not exists location jsonb check (location is null or (jsonb_typeof(location) = 'object' and location ? 'latitude' and location ? 'longitude')),
  add column if not exists summary jsonb check (summary is null or jsonb_typeof(summary) = 'object');

alter table public.wildlife_species alter column scientific_name drop not null;

alter table public.documents drop constraint if exists documents_classification_check;
alter table public.documents add constraint documents_classification_check
  check (classification in ('invoice','receipt','voucher','ticket','passport','insurance','visa','confirmation','other'));

-- Global species catalogue (taxonomic names only; no invented facts).
insert into public.wildlife_species (family_id, common_name_de, scientific_name, is_demo)
select null, v.de, v.sci, false
from (values
  ('Elefant', 'Loxodonta africana'), ('Giraffe', 'Giraffa camelopardalis'), ('Löwe', 'Panthera leo'),
  ('Zebra', 'Equus quagga'), ('Springbock', 'Antidorcas marsupialis'), ('Flusspferd', 'Hippopotamus amphibius'),
  ('Büffel', 'Syncerus caffer'), ('Leopard', 'Panthera pardus'), ('Nashorn (Spitzmaulnashorn)', 'Diceros bicornis'),
  ('Gepard', 'Acinonyx jubatus'), ('Oryx', 'Oryx gazella'), ('Kudu', 'Tragelaphus strepsiceros'),
  ('Warzenschwein', 'Phacochoerus africanus'), ('Nilkrokodil', 'Crocodylus niloticus'), ('Tüpfelhyäne', 'Crocuta crocuta')
) as v(de, sci)
where not exists (select 1 from public.wildlife_species s where s.family_id is null and lower(s.scientific_name) = lower(v.sci));

-- Views: append version/updated_at (create or replace may only add columns at the end).
create or replace view public.stays_overview with (security_barrier = true) as
  select s.id, s.trip_id, s.stop_id, s.name, s.address, s.check_in, s.check_out, s.booking_status, s.is_demo, s.source_type,
         s.version, s.updated_at
  from public.stays s
  where public.is_active_family_member(public.trip_family_id(s.trip_id));

create or replace view public.bookings_overview with (security_barrier = true) as
  select b.id, b.trip_id, b.stop_id, b.stay_id, b.kind, b.title, b.booking_status, b.deadline_at, b.provider, b.is_demo,
         b.version, b.updated_at
  from public.bookings b
  where public.is_active_family_member(public.trip_family_id(b.trip_id));
