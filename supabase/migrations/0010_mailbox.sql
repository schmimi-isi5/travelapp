-- 0010: mailbox of the trip (reise@...): mails with providers are fetched by the server (IMAP, read only), filed as
-- documents of kind 'correspondence' and evaluated for suggestions (payments, due dates, booking references).
-- Both tables are written by the server only (service role). Adults of the family may read them; nobody writes through the API.
-- Suggestions are never booked automatically: an adult confirms each one in the app.
create table if not exists public.mail_ingest (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  message_id text not null,
  imap_uid bigint,
  from_address text not null,
  subject text not null,
  received_at timestamptz,
  document_id uuid references public.documents(id) on delete set null,
  stay_id uuid references public.stays(id) on delete set null,
  booking_id uuid references public.bookings(id) on delete set null,
  match_reason text,
  summary text,
  suggestions jsonb not null default '[]'::jsonb check (jsonb_typeof(suggestions) = 'array'),
  extracted_by text not null default 'rules',
  created_at timestamptz not null default now(),
  unique (family_id, message_id)
);
create index if not exists mail_ingest_family_received_idx on public.mail_ingest (family_id, received_at desc);
create index if not exists mail_ingest_stay_idx on public.mail_ingest (stay_id);
create index if not exists mail_ingest_booking_idx on public.mail_ingest (booking_id);
create index if not exists mail_ingest_document_idx on public.mail_ingest (document_id);

create table if not exists public.mail_sync_state (
  family_id uuid primary key references public.families(id) on delete cascade,
  uid_validity bigint,
  last_uid bigint not null default 0,
  last_run_at timestamptz,
  last_error text,
  fetched_total integer not null default 0
);

alter table public.mail_ingest enable row level security;
alter table public.mail_sync_state enable row level security;
drop policy if exists mail_ingest_read on public.mail_ingest;
create policy mail_ingest_read on public.mail_ingest for select to authenticated using (public.is_adult_family_member(family_id));
drop policy if exists mail_sync_state_read on public.mail_sync_state;
create policy mail_sync_state_read on public.mail_sync_state for select to authenticated using (public.is_adult_family_member(family_id));
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then revoke all on public.mail_ingest, public.mail_sync_state from anon; end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on public.mail_ingest, public.mail_sync_state from authenticated;
    grant select on public.mail_ingest, public.mail_sync_state to authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'service_role') then grant all on public.mail_ingest, public.mail_sync_state to service_role; end if;
end $$;
