-- Test data for scripts/verify-restore.sh (psql variable :uid = an existing auth.users id).
insert into public.families (id, name, owner_user_id) values ('11111111-1111-4111-8111-111111111111', 'Restore-Test-Familie', :'uid');
insert into public.family_members (family_id, user_id, role) values ('11111111-1111-4111-8111-111111111111', :'uid', 'owner');
insert into public.trips (id, family_id, title, start_date, end_date, countries)
  values ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'Namibia Restore-Test', '2027-07-01', '2027-07-21', '{NA,BW}');
insert into public.stays (id, trip_id, name, price_minor, currency)
  values ('33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222', 'Test-Lodge', 123456, 'EUR');
insert into public.payments (id, family_id, stay_id, amount_minor, currency, paid_at)
  values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 50000, 'EUR', now());
insert into public.journal_entries (id, trip_id, author_user_id, title, body)
  values ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222', :'uid', 'Tag 1', 'Elefanten am Wasserloch.');
