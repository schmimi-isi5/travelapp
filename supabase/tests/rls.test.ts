/**
 * RLS / privilege tests for supabase/migrations/0001..0003 against in-memory Postgres (PGlite).
 * A minimal Supabase shim (auth schema, roles, storage stub) is created first.
 * See docs/SUPABASE.md for what this does and does not prove.
 */
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const MIGRATIONS = join(__dirname, '..', 'migrations');

const SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

const STORAGE_SHIM = `
create schema storage;
create table storage.buckets(id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text not null, owner_id text);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
`;

type Role = 'owner' | 'adult' | 'member' | 'child';
const ROLES: Role[] = ['owner', 'adult', 'member', 'child'];
type Fam = 'A' | 'B';

let db: PGlite;
const users: Record<Fam, Record<Role, string>> = { A: {} as never, B: {} as never };
const fam: Record<Fam, string> = { A: '', B: '' };
// seeded row ids: ids[family][table]
const ids: Record<Fam, Record<string, string>> = { A: {}, B: {} };
const outsider = randomUUID();

async function run(label: string, sql: string, target: PGlite = db) {
  try {
    await target.exec(sql);
  } catch (e: any) {
    throw new Error(`${label}: ${e.message} (position ${e.position})`);
  }
}

async function admin(sql: string, params: unknown[] = []) {
  return db.query(sql, params);
}

async function ins(f: Fam, table: string, row: Record<string, unknown>): Promise<string> {
  const cols = Object.keys(row);
  const r = await db
    .query<{ id: string }>(
      `insert into public.${table}(${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning id`,
      Object.values(row),
    )
    .catch((e) => {
      throw new Error(`seed ${table}: ${e.message}`);
    });
  ids[f][table] = r.rows[0].id;
  return r.rows[0].id;
}

/** Run a statement as an end user (authenticated role + JWT sub claim), always resetting afterwards. */
async function as(uid: string | null, sql: string, params: unknown[] = [], role = 'authenticated') {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']);
  await db.exec(`set role ${role}`);
  try {
    return await db.query<Record<string, any>>(sql, params);
  } finally {
    await db.exec('reset role');
  }
}

async function expectDenied(p: Promise<unknown>, codes = ['42501', '23514']) {
  let err: any;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  expect(err, 'statement should have been rejected').toBeDefined();
  expect(codes, `unexpected error: ${err?.message}`).toContain(err.code);
}

const count = async (uid: string, sql: string, params: unknown[] = []) => (await as(uid, sql, params)).rows.length;

async function seed(f: Fam) {
  fam[f] = randomUUID();
  for (const r of ROLES) {
    users[f][r] = randomUUID();
    await admin('insert into auth.users(id,email) values($1,$2)', [users[f][r], `${r}.${f}@example.test`.toLowerCase()]);
  }
  const u = users[f];
  await admin('insert into public.families(id,name,owner_user_id) values($1,$2,$3)', [fam[f], `Family ${f}`, u.owner]);
  for (const r of ROLES) {
    await admin('insert into public.family_members(family_id,user_id,role) values($1,$2,$3)', [fam[f], u[r], r]);
    await admin('insert into public.profiles(user_id,display_name) values($1,$2)', [u[r], `${r} ${f}`]);
  }
  const F = fam[f];
  const trip = await ins(f, 'trips', { family_id: F, title: `Trip ${f}` });
  const stop = await ins(f, 'trip_stops', { trip_id: trip, title: 'Windhoek', country: 'Namibia', sequence: 1 });
  const stop2 = await admin('insert into public.trip_stops(trip_id,title,country,sequence) values($1,$2,$3,$4) returning id', [trip, 'Etosha', 'Namibia', 2]);
  await ins(f, 'routes', { trip_id: trip, from_stop_id: stop, to_stop_id: stop2.rows[0].id, distance_km: 400 });
  const stay = await ins(f, 'stays', { trip_id: trip, stop_id: stop, name: 'Lodge', price_minor: 123456, currency: 'EUR' });
  const booking = await ins(f, 'bookings', { trip_id: trip, stop_id: stop, stay_id: stay, kind: 'hotel', title: 'Lodge booking', amount_minor: 123456, currency: 'EUR' });
  await ins(f, 'documents', { family_id: F, booking_id: booking, storage_path: `${F}/invoice.pdf`, original_name: 'invoice.pdf', mime_type: 'application/pdf', classification: 'invoice' });
  await ins(f, 'payments', { family_id: F, stay_id: stay, amount_minor: 5000, currency: 'EUR' });
  await ins(f, 'action_items', { family_id: F, trip_id: trip, title: 'Call lodge', owner_user_id: u.adult });
  await ins(f, 'journal_entries', { trip_id: trip, author_user_id: u.member, title: 'Public day', body: 'hello' });
  ids[f].journal_private = (await admin(`insert into public.journal_entries(trip_id,author_user_id,title,visibility) values($1,$2,'secret','private') returning id`, [trip, u.member])).rows[0].id;
  ids[f].journal_draft = (await admin(`insert into public.journal_entries(trip_id,author_user_id,title,status) values($1,$2,'draft','draft') returning id`, [trip, u.member])).rows[0].id;
  const media = await ins(f, 'media_assets', { family_id: F, trip_id: trip, uploaded_by: u.member, kind: 'photo', storage_path: `${F}/m1.jpg` });
  ids[f].media_private = (await admin(`insert into public.media_assets(family_id,trip_id,uploaded_by,kind,storage_path,visibility) values($1,$2,$3,'photo',$4,'private') returning id`, [F, trip, u.child, `${F}/private.jpg`])).rows[0].id;
  await ins(f, 'voice_transcripts', { media_id: media, provider: 'stub', body: 'text' });
  const species = await ins(f, 'wildlife_species', { family_id: F, common_name_de: `Elefant ${f}`, scientific_name: `Loxodonta ${f}` });
  await ins(f, 'wildlife_sightings', { trip_id: trip, stop_id: stop, species_id: species, recorded_by: u.child, count: 3 });
  await ins(f, 'sighting_favorites', { family_id: F, species_id: species, user_id: u.child });
  await ins(f, 'expenses', { trip_id: trip, category: 'fuel', amount_minor: 4200, currency: 'NAD', entered_by: u.adult });
  await ins(f, 'fx_rates', { family_id: F, from_currency: 'EUR', to_currency: 'NAD', rate: '20.5', as_of: '2026-10-01T00:00:00Z', source: 'manual' });
  await ins(f, 'travel_tips', { stop_id: stop, title: 'Tip', body: 'Fuel up' });
  await ins(f, 'emergency_contacts', { trip_id: trip, name: 'Rescue', phone: '+264' });
  const mut = await ins(f, 'sync_mutations', { family_id: F, user_id: u.adult, device_id: 'dev1', mutation_id: 'm1', entity_type: 'payments', entity_id: randomUUID() });
  await ins(f, 'sync_conflicts', { mutation_id: mut, entity_type: 'payments', entity_id: randomUUID(), local_value: '{"a":1}', remote_value: '{"a":2}' });
  await ins(f, 'invitations', { family_id: F, email: `new.${f}@example.test`, token_hash: (f === 'A' ? 'a' : 'e').repeat(64), expires_at: '2099-01-01T00:00:00Z' });
  ids[f].trip = trip;
  ids[f].stop = stop;
  ids[f].stay = stay;
  ids[f].booking = booking;
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await run('shim', SHIM);
  await run('0001_foundation', readFileSync(join(MIGRATIONS, '0001_foundation.sql'), 'utf8'));
  await run('0002_domain_and_rls', readFileSync(join(MIGRATIONS, '0002_domain_and_rls.sql'), 'utf8'));
  await run('storage shim', STORAGE_SHIM);
  await run('0003_storage', readFileSync(join(MIGRATIONS, '0003_storage.sql'), 'utf8'));
  await run('0004_app_alignment', readFileSync(join(MIGRATIONS, '0004_app_alignment.sql'), 'utf8'));
  await run('0005_documents_ciphertext', readFileSync(join(MIGRATIONS, '0005_documents_ciphertext.sql'), 'utf8'));
  await admin('insert into auth.users(id,email) values($1,$2)', [outsider, 'outsider@example.test']);
  await seed('A');
  await seed('B');
}, 120_000);

afterAll(async () => {
  await db?.close();
});

// Tables with an `id` column holding family data (family_members/profiles handled separately).
const ID_TABLES = [
  'trips', 'trip_stops', 'routes', 'stays', 'bookings', 'documents', 'payments', 'action_items', 'journal_entries',
  'media_assets', 'voice_transcripts', 'wildlife_species', 'wildlife_sightings', 'sighting_favorites', 'expenses',
  'fx_rates', 'travel_tips', 'emergency_contacts', 'sync_mutations', 'sync_conflicts', 'invitations',
];

describe('migrations', () => {
  it('enables RLS on every public table', async () => {
    const r = await admin(`select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
    expect(r.rows).toEqual([]);
  });

  it('uses no floating point columns for money', async () => {
    const r = await admin(`select table_name, column_name, data_type from information_schema.columns
      where table_schema='public' and (column_name like '%amount%' or column_name like '%price%') and data_type <> 'bigint'`);
    expect(r.rows).toEqual([]);
  });

  it('stays/payments/action_items match the data contract', async () => {
    const cols = async (t: string) => (await admin(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [t])).rows.map((x: any) => x.column_name);
    expect(await cols('stays')).toEqual(expect.arrayContaining(['booking_status', 'quote_status', 'booking_ref', 'contact', 'notes']));
    expect(await cols('payments')).toEqual(expect.arrayContaining(['family_id', 'booking_id', 'paid_at', 'source_document_id', 'notes']));
    expect(await cols('action_items')).toEqual(expect.arrayContaining(['family_id', 'booking_id', 'owner_user_id', 'priority', 'status', 'stop_id']));
  });

  it('anon role has no table access', async () => {
    await expectDenied(as(null, 'select * from public.trips', [], 'anon'));
  });
});

describe('cross-family isolation', () => {
  for (const role of ROLES) {
    it(`family B ${role} cannot read, update or delete any family A row`, async () => {
      const uid = users.B[role];
      for (const t of ID_TABLES) {
        const id = ids.A[t];
        expect(id, `seed id for ${t}`).toBeDefined();
        expect(await count(uid, `select 1 from public.${t} where id=$1`, [id]), `read ${t}`).toBe(0);
        const upd = await as(uid, `update public.${t} set id=id where id=$1`, [id]);
        expect(upd.affectedRows, `update ${t}`).toBe(0);
        const del = await as(uid, `delete from public.${t} where id=$1`, [id]);
        expect(del.affectedRows, `delete ${t}`).toBe(0);
      }
      expect(await count(uid, `select 1 from public.family_members where family_id=$1`, [fam.A])).toBe(0);
      expect(await count(uid, `select 1 from public.families where id=$1`, [fam.A])).toBe(0);
      expect(await count(uid, `select 1 from public.profiles where user_id=$1`, [users.A.owner])).toBe(0);
      expect(await count(uid, `select 1 from public.stays_overview where id=$1`, [ids.A.stays])).toBe(0);
      expect(await count(uid, `select 1 from public.bookings_overview where id=$1`, [ids.A.bookings])).toBe(0);
      expect(await count(uid, `select 1 from public.wildlife_species where family_id=$1`, [fam.A])).toBe(0);
    });
  }

  it('all A rows are still intact after the B attempts', async () => {
    for (const t of ID_TABLES) {
      const r = await admin(`select 1 from public.${t} where id=$1`, [ids.A[t]]);
      expect(r.rows.length, t).toBe(1);
    }
  });

  it('family B adult/owner cannot insert into family A (all writable tables)', async () => {
    const adult = users.B.adult;
    const a = ids.A;
    const F = fam.A;
    const stmts: [string, unknown[]][] = [
      [`insert into public.trips(family_id,title) values($1,'x')`, [F]],
      [`insert into public.trip_stops(trip_id,title,country,sequence) values($1,'x','y',9)`, [a.trips]],
      [`insert into public.routes(trip_id,from_stop_id,to_stop_id) values($1,$2,$2)`, [a.trips, a.trip_stops]],
      [`insert into public.stays(trip_id,name) values($1,'x')`, [a.trips]],
      [`insert into public.bookings(trip_id,kind,title) values($1,'car','x')`, [a.trips]],
      [`insert into public.documents(family_id,storage_path,original_name,mime_type) values($1,$1::uuid::text||'/x.pdf','x','application/pdf')`, [F]],
      [`insert into public.payments(family_id,stay_id,amount_minor,currency) values($1,$2,100,'EUR')`, [F, a.stays]],
      [`insert into public.action_items(family_id,trip_id,title) values($1,$2,'x')`, [F, a.trips]],
      [`insert into public.journal_entries(trip_id,author_user_id,body) values($1,$2,'x')`, [a.trips, adult]],
      [`insert into public.media_assets(family_id,uploaded_by,kind,storage_path) values($1,$2,'photo',$1::uuid::text||'/z.jpg')`, [F, adult]],
      [`insert into public.wildlife_species(family_id,common_name_de,scientific_name) values($1,'x','y')`, [F]],
      [`insert into public.wildlife_sightings(trip_id,species_id,recorded_by) values($1,$2,$3)`, [a.trips, a.wildlife_species, adult]],
      [`insert into public.sighting_favorites(family_id,species_id,user_id) values($1,$2,$3)`, [F, a.wildlife_species, adult]],
      [`insert into public.expenses(trip_id,category,amount_minor,currency,entered_by) values($1,'x',1,'EUR',$2)`, [a.trips, adult]],
      [`insert into public.fx_rates(family_id,from_currency,to_currency,rate,as_of,source) values($1,'EUR','USD',1.1,now(),'x')`, [F]],
      [`insert into public.travel_tips(stop_id,title,body) values($1,'x','y')`, [a.trip_stops]],
      [`insert into public.emergency_contacts(trip_id,name,phone) values($1,'x','1')`, [a.trips]],
      [`insert into public.sync_mutations(family_id,user_id,device_id,mutation_id,entity_type,entity_id) values($1,$2,'d','m','trips',gen_random_uuid())`, [F, adult]],
      [`insert into public.invitations(family_id,email,token_hash,expires_at) values($1,'a@b.de',repeat('b',64),now()+interval '1 day')`, [F]],
      [`insert into public.family_members(family_id,user_id,role) values($1,$2,'adult')`, [F, outsider]],
    ];
    for (const [sql, params] of stmts) await expectDenied(as(adult, sql, params));
    await expectDenied(as(users.B.owner, `insert into public.family_members(family_id,user_id,role) values($1,$2,'adult')`, [F, outsider]));
  });

  it('rejects foreign keys that point into another family (even for an adult of the target family)', async () => {
    const adultA = users.A.adult;
    const b = ids.B;
    const F = fam.A;
    await expectDenied(as(adultA, `insert into public.payments(family_id,stay_id,amount_minor,currency) values($1,$2,100,'EUR')`, [F, b.stays]));
    await expectDenied(as(adultA, `insert into public.payments(family_id,booking_id,amount_minor,currency) values($1,$2,100,'EUR')`, [F, b.bookings]));
    await expectDenied(as(adultA, `insert into public.payments(family_id,stay_id,source_document_id,amount_minor,currency) values($1,$2,$3,100,'EUR')`, [F, ids.A.stays, b.documents]));
    await expectDenied(as(adultA, `insert into public.expenses(trip_id,category,amount_minor,currency,entered_by,booking_id) values($1,'x',1,'EUR',$2,$3)`, [ids.A.trips, adultA, b.bookings]));
    await expectDenied(as(adultA, `insert into public.bookings(trip_id,kind,title,stay_id) values($1,'hotel','x',$2)`, [ids.A.trips, b.stays]));
    await expectDenied(as(adultA, `insert into public.stays(trip_id,name,stop_id) values($1,'x',$2)`, [ids.A.trips, b.trip_stops]));
    await expectDenied(as(adultA, `insert into public.routes(trip_id,from_stop_id,to_stop_id) values($1,$2,$3)`, [ids.A.trips, ids.A.trip_stops, b.trip_stops]));
    await expectDenied(as(adultA, `insert into public.action_items(family_id,trip_id,title,owner_user_id) values($1,$2,'x',$3)`, [F, ids.A.trips, users.B.adult]));
    await expectDenied(as(adultA, `insert into public.action_items(family_id,trip_id,title,booking_id) values($1,$2,'x',$3)`, [F, ids.A.trips, b.bookings]));
    await expectDenied(as(users.A.member, `insert into public.wildlife_sightings(trip_id,species_id,recorded_by,media_id) values($1,$2,$3,$4)`, [ids.A.trips, ids.A.wildlife_species, users.A.member, b.media_assets]));
    await expectDenied(as(users.A.member, `insert into public.wildlife_sightings(trip_id,species_id,recorded_by) values($1,$2,$3)`, [ids.A.trips, ids.B.wildlife_species, users.A.member]));
    await expectDenied(as(users.A.member, `insert into public.journal_entries(trip_id,stop_id,author_user_id) values($1,$2,$3)`, [ids.A.trips, b.trip_stops, users.A.member]));
    await expectDenied(as(users.A.member, `insert into public.media_assets(family_id,trip_id,uploaded_by,kind,storage_path) values($1,$2,$3,'photo',$1::uuid::text||'/q.jpg')`, [F, ids.B.trips, users.A.member]));
  });

  it('cannot re-point an existing row to another family via UPDATE', async () => {
    await expectDenied(as(users.A.adult, `update public.payments set stay_id=$1 where id=$2`, [ids.B.stays, ids.A.payments]));
    await expectDenied(as(users.A.adult, `update public.payments set family_id=$1 where id=$2`, [fam.B, ids.A.payments]));
  });
});

describe('role-based reads within a family', () => {
  const FINANCE = ['payments', 'documents', 'expenses', 'fx_rates', 'bookings', 'stays'];

  for (const t of FINANCE) {
    it(`${t}: owner and adult can read; member and child cannot`, async () => {
      const id = ids.A[t];
      expect(await count(users.A.owner, `select 1 from public.${t} where id=$1`, [id])).toBe(1);
      expect(await count(users.A.adult, `select 1 from public.${t} where id=$1`, [id])).toBe(1);
      expect(await count(users.A.member, `select 1 from public.${t} where id=$1`, [id])).toBe(0);
      expect(await count(users.A.child, `select 1 from public.${t} where id=$1`, [id])).toBe(0);
    });
  }

  it('finance and documents cannot be written by member or child', async () => {
    for (const who of [users.A.member, users.A.child]) {
      const F = fam.A;
      await expectDenied(as(who, `insert into public.payments(family_id,stay_id,amount_minor,currency) values($1,$2,1,'EUR')`, [F, ids.A.stays]));
      await expectDenied(as(who, `insert into public.expenses(trip_id,category,amount_minor,currency,entered_by) values($1,'x',1,'EUR',$2)`, [ids.A.trips, who]));
      await expectDenied(as(who, `insert into public.fx_rates(family_id,from_currency,to_currency,rate,as_of,source) values($1,'EUR','USD',1,now(),'x')`, [F]));
      await expectDenied(as(who, `insert into public.documents(family_id,storage_path,original_name,mime_type) values($1,$1::uuid::text||'/y.pdf','y','application/pdf')`, [F]));
      await expectDenied(as(who, `insert into public.bookings(trip_id,kind,title) values($1,'car','x')`, [ids.A.trips]));
      await expectDenied(as(who, `insert into public.stays(trip_id,name) values($1,'x')`, [ids.A.trips]));
      expect((await as(who, `update public.payments set notes='x' where id=$1`, [ids.A.payments])).affectedRows).toBe(0);
      expect((await as(who, `update public.stays set price_minor=1 where id=$1`, [ids.A.stays])).affectedRows).toBe(0);
      expect((await as(who, `delete from public.documents where id=$1`, [ids.A.documents])).affectedRows).toBe(0);
    }
  });

  it('adult can write finance; money is stored as bigint minor units', async () => {
    const r = await as(users.A.adult, `insert into public.payments(family_id,stay_id,amount_minor,currency,verification_status) values($1,$2,2500,'EUR','verified') returning amount_minor, created_by`, [fam.A, ids.A.stays]);
    expect(r.rows[0].amount_minor).toBe(2500);
    expect(r.rows[0].created_by).toBe(users.A.adult);
    await expectDenied(as(users.A.adult, `insert into public.payments(family_id,stay_id,amount_minor,currency) values($1,$2,100,'eur')`, [fam.A, ids.A.stays]), ['23514']);
    await expectDenied(as(users.A.adult, `insert into public.payments(family_id,amount_minor,currency) values($1,100,'EUR')`, [fam.A]), ['23514']);
  });

  it('stays_overview exposes members to stays without price columns; direct table stays hidden', async () => {
    const cols = (await admin(`select column_name from information_schema.columns where table_name='stays_overview'`)).rows.map((x: any) => x.column_name);
    expect(cols).not.toEqual(expect.arrayContaining(['price_minor']));
    for (const c of ['price_minor', 'currency', 'booking_ref', 'contact', 'notes']) expect(cols).not.toContain(c);
    for (const who of [users.A.member, users.A.child]) {
      expect(await count(who, `select 1 from public.stays_overview where id=$1`, [ids.A.stays])).toBe(1);
      expect(await count(who, `select 1 from public.stays`)).toBe(0);
    }
    const bcols = (await admin(`select column_name from information_schema.columns where table_name='bookings_overview'`)).rows.map((x: any) => x.column_name);
    for (const c of ['amount_minor', 'currency', 'reference', 'notes', 'contact']) expect(bcols).not.toContain(c);
  });

  it('every active member (incl. child) reads trips, stops, routes, tips, emergency contacts, sightings, species', async () => {
    for (const role of ROLES) {
      for (const t of ['trips', 'trip_stops', 'routes', 'travel_tips', 'emergency_contacts', 'wildlife_sightings', 'wildlife_species', 'action_items']) {
        expect(await count(users.A[role], `select 1 from public.${t} where id=$1`, [ids.A[t]]), `${role} ${t}`).toBe(1);
      }
    }
  });

  it('only adults write plan data (trips, stops, routes, tips, contacts)', async () => {
    for (const who of [users.A.member, users.A.child]) {
      await expectDenied(as(who, `insert into public.trips(family_id,title) values($1,'x')`, [fam.A]));
      await expectDenied(as(who, `insert into public.trip_stops(trip_id,title,country,sequence) values($1,'x','y',9)`, [ids.A.trips]));
      await expectDenied(as(who, `insert into public.travel_tips(stop_id,title,body) values($1,'x','y')`, [ids.A.trip_stops]));
      await expectDenied(as(who, `insert into public.emergency_contacts(trip_id,name,phone) values($1,'x','1')`, [ids.A.trips]));
      expect((await as(who, `update public.trips set title='hax' where id=$1`, [ids.A.trips])).affectedRows).toBe(0);
    }
    const ok = await as(users.A.adult, `insert into public.travel_tips(stop_id,title,body) values($1,'ok','y') returning id`, [ids.A.trip_stops]);
    expect(ok.rows.length).toBe(1);
  });

  it('action item assignee may update own item; others (member) may not', async () => {
    expect((await as(users.A.member, `update public.action_items set status='done' where id=$1`, [ids.A.action_items])).affectedRows).toBe(0);
    expect((await as(users.A.adult, `update public.action_items set status='done' where id=$1`, [ids.A.action_items])).affectedRows).toBe(1);
    await admin(`update public.action_items set owner_user_id=$1 where id=$2`, [users.A.child, ids.A.action_items]);
    expect((await as(users.A.child, `update public.action_items set status='open' where id=$1`, [ids.A.action_items])).affectedRows).toBe(1);
    await expectDenied(as(users.A.child, `update public.action_items set owner_user_id=$1 where id=$2`, [users.A.member, ids.A.action_items]));
  });
});

describe('journal and media visibility', () => {
  it('private entries and drafts are readable only by their author', async () => {
    const q = (id: string) => `select 1 from public.journal_entries where id=$1`;
    for (const role of ['owner', 'adult', 'child'] as Role[]) {
      expect(await count(users.A[role], q(''), [ids.A.journal_entries])).toBe(1);
      expect(await count(users.A[role], q(''), [ids.A.journal_private])).toBe(0);
      expect(await count(users.A[role], q(''), [ids.A.journal_draft])).toBe(0);
    }
    for (const id of [ids.A.journal_entries, ids.A.journal_private, ids.A.journal_draft]) {
      expect(await count(users.A.member, q(''), [id])).toBe(1);
    }
  });

  it('adult may edit others family-visible entries but not private ones; cannot change author', async () => {
    expect((await as(users.A.adult, `update public.journal_entries set title='edited' where id=$1`, [ids.A.journal_entries])).affectedRows).toBe(1);
    expect((await as(users.A.adult, `update public.journal_entries set title='edited' where id=$1`, [ids.A.journal_private])).affectedRows).toBe(0);
    expect((await as(users.A.adult, `delete from public.journal_entries where id=$1`, [ids.A.journal_private])).affectedRows).toBe(0);
    await expectDenied(as(users.A.member, `update public.journal_entries set author_user_id=$1 where id=$2`, [users.A.adult, ids.A.journal_entries]));
  });

  it('member and child create journal/media/sightings as themselves only', async () => {
    for (const who of [users.A.member, users.A.child]) {
      const j = await as(who, `insert into public.journal_entries(trip_id,author_user_id,title) values($1,$2,'mine') returning id`, [ids.A.trips, who]);
      expect(j.rows.length).toBe(1);
      await expectDenied(as(who, `insert into public.journal_entries(trip_id,author_user_id,title) values($1,$2,'forged')`, [ids.A.trips, users.A.owner]));
      const m = await as(who, `insert into public.media_assets(family_id,trip_id,uploaded_by,kind,storage_path) values($1,$2,$3,'photo',$1::uuid::text||'/'||gen_random_uuid()||'.jpg') returning id`, [fam.A, ids.A.trips, who]);
      expect(m.rows.length).toBe(1);
      await expectDenied(as(who, `insert into public.media_assets(family_id,uploaded_by,kind,storage_path) values($1,$2,'photo',$1::uuid::text||'/f.jpg')`, [fam.A, users.A.adult]));
      const s = await as(who, `insert into public.wildlife_sightings(trip_id,species_id,recorded_by) values($1,$2,$3) returning id`, [ids.A.trips, ids.A.wildlife_species, who]);
      expect(s.rows.length).toBe(1);
      await expectDenied(as(who, `insert into public.wildlife_sightings(trip_id,species_id,recorded_by) values($1,$2,$3)`, [ids.A.trips, ids.A.wildlife_species, users.A.owner]));
      // edit own, not others'
      expect((await as(who, `update public.wildlife_sightings set notes='n' where id=$1`, [s.rows[0].id])).affectedRows).toBe(1);
      expect((await as(who, `update public.journal_entries set title='x' where id=$1`, [j.rows[0].id])).affectedRows).toBe(1);
    }
  });

  it('member cannot edit a child sighting or media; adult can edit family-visible ones', async () => {
    expect((await as(users.A.member, `update public.wildlife_sightings set notes='hax' where id=$1`, [ids.A.wildlife_sightings])).affectedRows).toBe(0);
    expect((await as(users.A.member, `delete from public.wildlife_sightings where id=$1`, [ids.A.wildlife_sightings])).affectedRows).toBe(0);
    expect((await as(users.A.child, `update public.media_assets set caption='hax' where id=$1`, [ids.A.media_assets])).affectedRows).toBe(0);
    expect((await as(users.A.adult, `update public.media_assets set caption='ok' where id=$1`, [ids.A.media_assets])).affectedRows).toBe(1);
    expect((await as(users.A.adult, `update public.wildlife_sightings set notes='ok' where id=$1`, [ids.A.wildlife_sightings])).affectedRows).toBe(1);
  });

  it('private media (and its transcript) is visible only to the uploader', async () => {
    expect(await count(users.A.child, `select 1 from public.media_assets where id=$1`, [ids.A.media_private])).toBe(1);
    for (const who of [users.A.owner, users.A.adult, users.A.member]) {
      expect(await count(who, `select 1 from public.media_assets where id=$1`, [ids.A.media_private])).toBe(0);
    }
    // transcripts follow the media row
    const privMedia = ids.A.media_private;
    await admin(`insert into public.voice_transcripts(media_id,provider,body) values($1,'stub','private words')`, [privMedia]);
    expect(await count(users.A.adult, `select 1 from public.voice_transcripts where media_id=$1`, [privMedia])).toBe(0);
    expect(await count(users.A.child, `select 1 from public.voice_transcripts where media_id=$1`, [privMedia])).toBe(1);
    expect(await count(users.A.adult, `select 1 from public.voice_transcripts where media_id=$1`, [ids.A.media_assets])).toBe(1);
  });

  it('media linked to a private journal entry is not family-visible', async () => {
    const m = await admin(`insert into public.media_assets(family_id,trip_id,journal_entry_id,uploaded_by,kind,storage_path) values($1,$2,$3,$4,'photo',$1::uuid::text||'/linked.jpg') returning id`, [fam.A, ids.A.trips, ids.A.journal_private, users.A.member]);
    expect(await count(users.A.adult, `select 1 from public.media_assets where id=$1`, [m.rows[0].id])).toBe(0);
    expect(await count(users.A.member, `select 1 from public.media_assets where id=$1`, [m.rows[0].id])).toBe(1);
  });

  it('sighting favourites are private to the user', async () => {
    expect(await count(users.A.child, `select 1 from public.sighting_favorites`)).toBe(1);
    for (const who of [users.A.owner, users.A.adult, users.A.member]) expect(await count(who, `select 1 from public.sighting_favorites`)).toBe(0);
    await expectDenied(as(users.A.member, `insert into public.sighting_favorites(family_id,species_id,user_id) values($1,$2,$3)`, [fam.A, ids.A.wildlife_species, users.A.child]));
  });
});

describe('membership and privilege escalation', () => {
  it('nobody can insert themselves into a family or set their own role', async () => {
    await expectDenied(as(outsider, `insert into public.family_members(family_id,user_id,role) values($1,$2,'owner')`, [fam.A, outsider]));
    await expectDenied(as(outsider, `insert into public.family_members(family_id,user_id,role) values($1,$2,'child')`, [fam.A, outsider]));
    for (const role of ['adult', 'member', 'child'] as Role[]) {
      await expectDenied(as(users.A[role], `insert into public.family_members(family_id,user_id,role) values($1,$2,'adult')`, [fam.A, outsider]));
      const r = await as(users.A[role], `update public.family_members set role='owner' where family_id=$1 and user_id=$2`, [fam.A, users.A[role]]);
      expect(r.affectedRows).toBe(0);
      expect((await as(users.A[role], `delete from public.family_members where family_id=$1 and user_id=$2`, [fam.A, users.A.owner])).affectedRows).toBe(0);
    }
    const roles = (await admin(`select user_id, role from public.family_members where family_id=$1`, [fam.A])).rows;
    for (const role of ROLES) expect(roles.find((x: any) => x.user_id === users.A[role])?.role).toBe(role);
  });

  it('families insert is not possible directly; create_family RPC works', async () => {
    await expectDenied(as(outsider, `insert into public.families(name,owner_user_id) values('mine',$1)`, [outsider]));
    const r = await as(outsider, `select public.create_family('Neue Familie') as id`);
    const fid = r.rows[0].id;
    expect((await as(outsider, `select public.family_role($1) as r`, [fid])).rows[0].r).toBe('owner');
    expect(await count(outsider, `select 1 from public.profiles where user_id=$1`, [outsider])).toBe(1);
    await expectDenied(as(null, `select public.create_family('x')`), ['28000']);
    await admin(`delete from public.families where id=$1`, [fid]);
  });

  it('only the owner changes members; owner role itself is untouchable; owner_user_id cannot be changed by clients', async () => {
    await expectDenied(as(users.A.adult, `insert into public.family_members(family_id,user_id,role) values($1,$2,'member')`, [fam.A, outsider]));
    await expectDenied(as(users.A.owner, `insert into public.family_members(family_id,user_id,role) values($1,$2,'owner')`, [fam.A, outsider]));
    expect((await as(users.A.owner, `update public.family_members set role='adult' where family_id=$1 and user_id=$2`, [fam.A, users.A.owner])).affectedRows).toBe(0);
    await as(users.A.owner, `insert into public.family_members(family_id,user_id,role) values($1,$2,'member')`, [fam.A, outsider]);
    expect((await as(users.A.owner, `update public.family_members set role='child' where family_id=$1 and user_id=$2`, [fam.A, outsider])).affectedRows).toBe(1);
    expect((await as(users.A.owner, `delete from public.family_members where family_id=$1 and user_id=$2`, [fam.A, outsider])).affectedRows).toBe(1);

    for (const who of [users.A.adult, users.A.member, users.A.child]) {
      expect((await as(who, `update public.families set owner_user_id=$1 where id=$2`, [who, fam.A])).affectedRows).toBe(0);
      expect((await as(who, `update public.families set name='hax' where id=$1`, [fam.A])).affectedRows).toBe(0);
      await expectDenied(as(who, `delete from public.families where id=$1`, [fam.A]));
    }
    await expectDenied(as(users.A.owner, `update public.families set owner_user_id=$1 where id=$2`, [users.A.adult, fam.A]));
    expect((await as(users.A.owner, `update public.families set name='Family A' where id=$1`, [fam.A])).affectedRows).toBe(1);
    expect((await admin(`select owner_user_id from public.families where id=$1`, [fam.A])).rows[0].owner_user_id).toBe(users.A.owner);
  });

  it('a suspended member loses all access', async () => {
    await admin(`update public.family_members set status='suspended' where family_id=$1 and user_id=$2`, [fam.A, users.A.adult]);
    expect(await count(users.A.adult, `select 1 from public.trips`)).toBe(0);
    expect(await count(users.A.adult, `select 1 from public.payments`)).toBe(0);
    await admin(`update public.family_members set status='active' where family_id=$1 and user_id=$2`, [fam.A, users.A.adult]);
    expect(await count(users.A.adult, `select 1 from public.trips`)).toBe(1);
  });

  it('profiles: readable within family, writable only by self', async () => {
    expect(await count(users.A.child, `select 1 from public.profiles where user_id=$1`, [users.A.owner])).toBe(1);
    expect((await as(users.A.child, `update public.profiles set display_name='x' where user_id=$1`, [users.A.owner])).affectedRows).toBe(0);
    expect((await as(users.A.child, `update public.profiles set display_name='Kind' where user_id=$1`, [users.A.child])).affectedRows).toBe(1);
    await expectDenied(as(users.A.child, `insert into public.profiles(user_id,display_name) values($1,'x')`, [users.A.owner]));
  });
});

describe('invitations', () => {
  it('only owner/adult can see and create invitations; member/child cannot', async () => {
    for (const who of [users.A.member, users.A.child]) {
      expect(await count(who, `select 1 from public.invitations`)).toBe(0);
      await expectDenied(as(who, `insert into public.invitations(family_id,email,token_hash,expires_at) values($1,'x@y.de',repeat('c',64),now()+interval '1 day')`, [fam.A]));
    }
    expect(await count(users.A.adult, `select 1 from public.invitations`)).toBe(1);
    expect(await count(users.A.owner, `select 1 from public.invitations`)).toBe(1);
  });

  it('stores only a sha256 hash, never a raw token; cannot invite as owner', async () => {
    await expectDenied(as(users.A.adult, `insert into public.invitations(family_id,email,token_hash,expires_at) values($1,'x@y.de','RAW-TOKEN-123',now()+interval '1 day')`, [fam.A]), ['23514']);
    await expectDenied(as(users.A.adult, `insert into public.invitations(family_id,email,role,token_hash,expires_at) values($1,'x@y.de','owner',repeat('d',64),now()+interval '1 day')`, [fam.A]), ['23514']);
  });

  it('accept flow: hash lookup, email bound, single use, revoke works, no owner role', async () => {
    const raw = 'super-secret-token-' + randomUUID();
    const hash = (await admin(`select public.hash_invitation_token($1) as h`, [raw])).rows[0].h;
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const inv = await as(users.A.adult, `insert into public.invitations(family_id,email,role,token_hash,expires_at) values($1,'Outsider@example.test','member',$2,now()+interval '1 day') returning id`, [fam.A, hash]);
    await expectDenied(as(users.B.adult, `select public.accept_invitation($1)`, [raw])); // wrong email
    await expectDenied(as(outsider, `select public.accept_invitation('wrong-token')`));
    const ok = await as(outsider, `select public.accept_invitation($1) as fid`, [raw]);
    expect(ok.rows[0].fid).toBe(fam.A);
    expect((await as(outsider, `select public.family_role($1) as r`, [fam.A])).rows[0].r).toBe('member');
    await expectDenied(as(outsider, `select public.accept_invitation($1)`, [raw])); // single use
    await admin(`delete from public.family_members where family_id=$1 and user_id=$2`, [fam.A, outsider]);

    // revoke (adult updates the row) blocks acceptance
    const raw2 = 'tok2-' + randomUUID();
    const h2 = (await admin(`select public.hash_invitation_token($1) as h`, [raw2])).rows[0].h;
    const inv2 = await as(users.A.adult, `insert into public.invitations(family_id,email,token_hash,expires_at) values($1,'outsider@example.test',$2,now()+interval '1 day') returning id`, [fam.A, h2]);
    expect((await as(users.A.adult, `update public.invitations set revoked_at=now() where id=$1`, [inv2.rows[0].id])).affectedRows).toBe(1);
    await expectDenied(as(outsider, `select public.accept_invitation($1)`, [raw2]));
    expect(inv.rows.length).toBe(1);
  });
});

describe('sync idempotency', () => {
  const ins1 = `insert into public.sync_mutations(family_id,user_id,device_id,mutation_id,entity_type,entity_id) values($1,$2,'devX','mutX',$3,gen_random_uuid())`;

  it('unique (family_id, device_id, mutation_id); replay is idempotent with ON CONFLICT DO NOTHING', async () => {
    await as(users.A.member, ins1, [fam.A, users.A.member, 'journal_entries']);
    await expectDenied(as(users.A.member, ins1, [fam.A, users.A.member, 'journal_entries']), ['23505']);
    const replay = await as(users.A.member, ins1 + ' on conflict (family_id,device_id,mutation_id) do nothing', [fam.A, users.A.member, 'journal_entries']);
    expect(replay.affectedRows).toBe(0);
    // same device/mutation ids in another family are independent
    await as(users.B.member, ins1, [fam.B, users.B.member, 'journal_entries']);
  });

  it('finance mutations are adult-only; own queue visible, others hidden from members', async () => {
    await expectDenied(as(users.A.child, ins1.replace("'mutX'", "'mutFin'"), [fam.A, users.A.child, 'payments']));
    await expectDenied(as(users.A.member, ins1.replace("'mutX'", "'mutImp'"), [fam.A, users.A.child, 'journal_entries'])); // user_id must be self
    expect(await count(users.A.member, `select 1 from public.sync_mutations where id=$1`, [ids.A.sync_mutations])).toBe(0);
    expect(await count(users.A.adult, `select 1 from public.sync_mutations where device_id='devX'`)).toBe(1);
    expect(await count(users.A.adult, `select 1 from public.sync_mutations where id=$1`, [ids.A.sync_mutations])).toBe(1);
  });

  it('conflicts on finance entities are visible to adults only and writable by adults only', async () => {
    expect(await count(users.A.adult, `select 1 from public.sync_conflicts where id=$1`, [ids.A.sync_conflicts])).toBe(1);
    for (const who of [users.A.member, users.A.child]) {
      expect(await count(who, `select 1 from public.sync_conflicts`)).toBe(0);
      await expectDenied(as(who, `insert into public.sync_conflicts(mutation_id,entity_type,entity_id) values($1,'payments',gen_random_uuid())`, [ids.A.sync_mutations]));
    }
  });
});

describe('triggers', () => {
  it('bumps version and updated_at on update and ignores client-supplied version', async () => {
    const before = (await admin(`select version, updated_at from public.trips where id=$1`, [ids.A.trips])).rows[0];
    await new Promise((r) => setTimeout(r, 5));
    await as(users.A.adult, `update public.trips set title='Neu' where id=$1`, [ids.A.trips]);
    const mid = (await admin(`select version, updated_at from public.trips where id=$1`, [ids.A.trips])).rows[0];
    expect(Number(mid.version)).toBe(Number(before.version) + 1);
    expect(new Date(mid.updated_at).getTime()).toBeGreaterThan(new Date(before.updated_at).getTime());
    await as(users.A.adult, `update public.trips set title='Neu2', version=999 where id=$1`, [ids.A.trips]);
    const after = (await admin(`select version from public.trips where id=$1`, [ids.A.trips])).rows[0];
    expect(Number(after.version)).toBe(Number(before.version) + 2);
  });

  it('bumps version on payments and journal entries too; created_by is stamped and immutable', async () => {
    await as(users.A.adult, `update public.payments set notes='n' where id=$1`, [ids.A.payments]);
    expect(Number((await admin(`select version from public.payments where id=$1`, [ids.A.payments])).rows[0].version)).toBeGreaterThanOrEqual(2);
    const t = await as(users.A.adult, `insert into public.trips(family_id,title,created_by) values($1,'T2',$2) returning id, created_by`, [fam.A, users.A.owner]);
    expect(t.rows[0].created_by).toBe(users.A.adult);
    await expectDenied(as(users.A.adult, `update public.trips set created_by=$1 where id=$2`, [users.A.owner, t.rows[0].id]));
  });
});

describe('storage (against a stub storage schema, not real Supabase Storage)', () => {
  const putObj = (bucket: string, name: string, owner: string) =>
    admin(`insert into storage.objects(bucket_id,name,owner_id) values($1,$2,$3)`, [bucket, name, owner]);

  it('creates private buckets with size limits and mime allow-lists', async () => {
    const r = await admin(`select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id`);
    expect(r.rows.map((x: any) => x.id)).toEqual(['documents', 'media']);
    expect(r.rows.every((x: any) => x.public === false)).toBe(true);
    expect(Number(r.rows[0].file_size_limit)).toBe(20 * 1024 * 1024);
    expect(Number(r.rows[1].file_size_limit)).toBe(100 * 1024 * 1024);
    expect(r.rows[0].allowed_mime_types).toContain('application/pdf');
  });

  it('documents bucket: owner/adult of the family only', async () => {
    const name = `${fam.A}/passport.pdf`;
    await putObj('documents', name, users.A.adult);
    const up = `insert into storage.objects(bucket_id,name,owner_id) values('documents',$1,$2)`;
    await as(users.A.adult, up, [`${fam.A}/new.pdf`, users.A.adult]);
    await as(users.A.owner, up, [`${fam.A}/new2.pdf`, users.A.owner]);
    for (const who of [users.A.member, users.A.child, users.B.owner, users.B.adult]) {
      expect(await count(who, `select 1 from storage.objects where bucket_id='documents' and name=$1`, [name])).toBe(0);
      await expectDenied(as(who, up, [`${fam.A}/evil.pdf`, who]));
    }
    expect(await count(users.A.adult, `select 1 from storage.objects where bucket_id='documents' and name=$1`, [name])).toBe(1);
    await expectDenied(as(users.A.adult, up, [`${fam.B}/cross.pdf`, users.A.adult]));
    await expectDenied(as(users.A.adult, up, [`not-a-uuid/x.pdf`, users.A.adult]));
    expect((await as(users.A.member, `delete from storage.objects where bucket_id='documents' and name=$1`, [name])).affectedRows).toBe(0);
  });

  it('media bucket: family members upload under their family prefix; private media follows the media row', async () => {
    const up = `insert into storage.objects(bucket_id,name,owner_id) values('media',$1,$2)`;
    await as(users.A.child, up, [`${fam.A}/kid.jpg`, users.A.child]);
    await expectDenied(as(users.A.child, up, [`${fam.B}/kid.jpg`, users.A.child]));
    await expectDenied(as(users.B.member, up, [`${fam.A}/b.jpg`, users.B.member]));
    await putObj('media', `${fam.A}/m1.jpg`, users.A.member); // family-visible media row
    await putObj('media', `${fam.A}/private.jpg`, users.A.child); // private media row of child
    expect(await count(users.A.adult, `select 1 from storage.objects where bucket_id='media' and name=$1`, [`${fam.A}/m1.jpg`])).toBe(1);
    expect(await count(users.A.child, `select 1 from storage.objects where bucket_id='media' and name=$1`, [`${fam.A}/private.jpg`])).toBe(1);
    expect(await count(users.A.adult, `select 1 from storage.objects where bucket_id='media' and name=$1`, [`${fam.A}/private.jpg`])).toBe(0);
    expect(await count(users.B.adult, `select 1 from storage.objects where bucket_id='media' and name=$1`, [`${fam.A}/m1.jpg`])).toBe(0);
    // uploader may delete own object; other member may not; adult may
    expect((await as(users.A.member, `delete from storage.objects where bucket_id='media' and name=$1`, [`${fam.A}/kid.jpg`])).affectedRows).toBe(0);
    expect((await as(users.A.child, `delete from storage.objects where bucket_id='media' and name=$1`, [`${fam.A}/kid.jpg`])).affectedRows).toBe(1);
  });

  it('migration 0003 is a no-op without a storage schema (re-applied on a DB lacking storage)', async () => {
    const bare = new PGlite({ extensions: { pgcrypto } });
    await bare.exec(SHIM);
    await run('0001_foundation', readFileSync(join(MIGRATIONS, '0001_foundation.sql'), 'utf8'), bare);
    await run('0002_domain_and_rls', readFileSync(join(MIGRATIONS, '0002_domain_and_rls.sql'), 'utf8'), bare);
    await run('0003_storage', readFileSync(join(MIGRATIONS, '0003_storage.sql'), 'utf8'), bare);
    await bare.close();
  });
});

describe('migration 0004 (app alignment)', () => {
  it('adds the provenance and planning columns the app writes', async () => {
    const cols = async (t: string) => (await admin(`select column_name from information_schema.columns where table_schema='public' and table_name=$1`, [t])).rows.map((x: any) => x.column_name);
    expect(await cols('stays')).toEqual(expect.arrayContaining(['due_at', 'verified_at', 'source_reference']));
    expect(await cols('bookings')).toEqual(expect.arrayContaining(['starts_at', 'verified_at', 'source_reference']));
    expect(await cols('journal_entries')).toEqual(expect.arrayContaining(['location', 'summary']));
    expect(await cols('trip_stops')).toContain('verified_at');
  });

  it('accepts booking confirmations as document class and still rejects unknown classes', async () => {
    const F = fam.A;
    await admin(`insert into public.documents(family_id,storage_path,original_name,mime_type,classification) values($1,$2,'c.pdf','application/pdf','confirmation')`, [F, `${F}/c.pdf`]);
    await expect(admin(`insert into public.documents(family_id,storage_path,original_name,mime_type,classification) values($1,$2,'x.pdf','application/pdf','bogus')`, [F, `${F}/x.pdf`])).rejects.toThrow();
    await admin(`delete from public.documents where storage_path=$1`, [`${fam.A}/c.pdf`]);
  });

  it('provides a global species catalogue every family member can read but no client can change', async () => {
    for (const role of ROLES) {
      expect(await count(users.A[role], `select 1 from public.wildlife_species where family_id is null`), role).toBeGreaterThanOrEqual(8);
    }
    expect(await count(users.B.owner, `select 1 from public.wildlife_species where family_id is null and common_name_de='Elefant'`)).toBe(1);
    const upd = await as(users.A.owner, `update public.wildlife_species set common_name_de='x' where family_id is null returning id`);
    expect(upd.rows).toHaveLength(0);
    await expectDenied(as(users.A.owner, `insert into public.wildlife_species(family_id,common_name_de,scientific_name) values (null,'Fake','Fake fake')`));
  });

  it('allows a custom family species without scientific name', async () => {
    await admin(`insert into public.wildlife_species(family_id,common_name_de) values ($1,'Erdmännchen')`, [fam.A]);
    await admin(`delete from public.wildlife_species where family_id=$1 and common_name_de='Erdmännchen'`, [fam.A]);
  });

  it('exposes version in the member views without leaking finance columns', async () => {
    const r = await as(users.A.child, `select * from public.stays_overview`);
    expect(r.rows.length).toBeGreaterThan(0);
    expect(Object.keys(r.rows[0])).toEqual(expect.arrayContaining(['version', 'updated_at']));
    expect(Object.keys(r.rows[0])).not.toEqual(expect.arrayContaining(['price_minor']));
    const b = await as(users.A.member, `select * from public.bookings_overview`);
    expect(Object.keys(b.rows[0])).toEqual(expect.arrayContaining(['version']));
    expect(Object.keys(b.rows[0])).not.toEqual(expect.arrayContaining(['amount_minor', 'reference']));
  });

  it('is idempotent when applied twice', async () => {
    await run('0004_again', readFileSync(join(MIGRATIONS, '0004_app_alignment.sql'), 'utf8'));
    expect(await count(users.A.owner, `select 1 from public.wildlife_species where family_id is null and common_name_de='Elefant'`)).toBe(1);
  });
});

describe('delete_family_data (GDPR)', () => {
  it('rejects everyone except the family owner', async () => {
    for (const role of ['adult', 'member', 'child'] as Role[]) await expectDenied(as(users.A[role], `select public.delete_family_data($1)`, [fam.A]), ['42501']);
    await expectDenied(as(users.B.owner, `select public.delete_family_data($1)`, [fam.A]), ['42501']);
    await expectDenied(as(null, `select public.delete_family_data($1)`, [fam.A]), ['42501']);
    await expectDenied(as(null, `select public.delete_family_data($1)`, [fam.A], 'anon'), ['42501']);
    expect((await admin(`select count(*)::int c from public.trips where family_id=$1`, [fam.A])).rows[0].c).toBeGreaterThan(0);
  });

  it('owner erases all family data, returns storage paths, and leaves other families intact', async () => {
    const r = await as(users.A.owner, `select public.delete_family_data($1) as res`, [fam.A]);
    const paths: string[] = r.rows[0].res.storage_paths;
    expect(paths).toEqual(expect.arrayContaining([`${fam.A}/invoice.pdf`, `${fam.A}/m1.jpg`]));
    for (const t of ['families', 'family_members']) {
      const col = t === 'families' ? 'id' : 'family_id';
      expect((await admin(`select count(*)::int c from public.${t} where ${col}=$1`, [fam.A])).rows[0].c).toBe(0);
    }
    for (const t of ID_TABLES) {
      expect((await admin(`select count(*)::int c from public.${t} where id=$1`, [ids.A[t]])).rows[0].c, t).toBe(0);
    }
    expect((await admin(`select count(*)::int c from public.trips where family_id=$1`, [fam.B])).rows[0].c).toBe(1);
    for (const t of ID_TABLES) {
      expect((await admin(`select count(*)::int c from public.${t} where id=$1`, [ids.B[t]])).rows[0].c, t).toBe(1);
    }
  });
});
