import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildExport } from '@/features/archive/export';
import { setActor } from '@/lib/db/actor';
import { addDocument, openDocument } from '@/lib/db/documents';
import { getLocalDb, resetDatabasesForTests, selectLocalDatabase, activeLocalDatabaseName } from '@/lib/db/local';
import { addMedia, resolveMediaUrl } from '@/lib/db/media';
import { create, get, list, update } from '@/lib/db/repo';
import { computeStayFinancials } from '@/lib/domain/money';
import type { Role } from '@/lib/domain/schemas';
import { setSimulatedOffline } from '@/lib/offline/network';
import type { RemoteAdapter } from '@/lib/offline/remote';
import { resolveConflict, syncNow } from '@/lib/offline/sync';
import { admin, backendAvailable, createFamilyWithRoles, createUser, deleteCreatedUsers, remoteFor, signIn, uniq, type TestMember } from './harness';

const available = await backendAvailable();
const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

type Fam = Awaited<ReturnType<typeof createFamilyWithRoles>>;

/** One browser profile: its own IndexedDB, acting as one signed-in user. */
class Device {
  readonly dbName = `dev-${uniq()}`;
  remote: RemoteAdapter;
  constructor(
    readonly user: TestMember,
    private readonly fam: Fam,
  ) {
    this.remote = remoteFor(user, fam.family.id, user.role);
    resetDatabasesForTests(this.dbName);
    this.dbName = `nb-local-${this.dbName}`;
  }
  on(): this {
    selectLocalDatabase(this.dbName);
    setActor({ userId: this.user.id, role: this.user.role as Role });
    setSimulatedOffline(false);
    return this;
  }
  offline(): this {
    setSimulatedOffline(true);
    return this;
  }
  online(): this {
    setSimulatedOffline(false);
    return this;
  }
  sync() {
    this.on();
    return syncNow(this.remote);
  }
  get familyId() {
    return this.fam.family.id;
  }
  get tripId() {
    return this.fam.family.tripId;
  }
}

describe.skipIf(!available)('offline sync against real Supabase', () => {
  let fam: Fam;
  beforeAll(async () => {
    fam = await createFamilyWithRoles();
  });
  afterAll(deleteCreatedUsers);

  it('queues a journal entry offline, pushes it once online, and other devices receive it', async () => {
    const phone = new Device(fam.member, fam).on();
    expect((await phone.sync()).failed).toBe(0);
    phone.offline();
    const entry = await create('journal_entries', { trip_id: phone.tripId, author_user_id: fam.member.id, entry_date: '2026-10-16', title: 'Offline geschrieben', body: 'Kein Netz an der Düne.' });
    await update('journal_entries', entry.id, { body: 'Kein Netz an der Düne. Später ergänzt.' });
    expect((await syncNow(phone.remote)).skipped).toBe('offline');
    expect(await getLocalDb().sync_mutations.where('status').equals('pending').count()).toBe(1);

    phone.online();
    const summary = await syncNow(phone.remote);
    expect(summary).toMatchObject({ pushed: 1, failed: 0, conflicts: 0 });
    const { data } = await admin.from('journal_entries').select('title, body, version, author_user_id, created_by').eq('id', entry.id).single();
    expect(data).toMatchObject({ title: 'Offline geschrieben', body: 'Kein Netz an der Düne. Später ergänzt.', version: 1, author_user_id: fam.member.id, created_by: fam.member.id });
    expect((await get('journal_entries', entry.id))?.version).toBe(1);

    const tablet = new Device(fam.adult, fam).on();
    await tablet.sync();
    expect((await list('journal_entries')).map((e) => e.title)).toContain('Offline geschrieben');
    // the audit log holds no business content
    const { data: log } = await admin.from('sync_mutations').select('payload, status').eq('entity_id', entry.id);
    expect(log).toEqual([{ payload: { operation: 'upsert' }, status: 'applied' }]);
  });

  it('shows a conflict instead of overwriting when two people change the same booking offline', async () => {
    const owner = new Device(fam.owner, fam).on();
    const booking = await create('bookings', { trip_id: owner.tripId, kind: 'car', title: 'Mietwagen 4x4', notes: 'ursprünglich' });
    await owner.sync();
    const adult = new Device(fam.adult, fam);
    await adult.sync();

    owner.on().offline();
    await update('bookings', booking.id, { notes: 'Änderung Owner' });
    adult.on().offline();
    await update('bookings', booking.id, { notes: 'Änderung Erwachsene' });

    adult.online();
    expect((await syncNow(adult.remote)).pushed).toBe(1);
    owner.on().online();
    const lost = await syncNow(owner.remote);
    expect(lost.conflicts).toBe(1);
    const { data: server } = await admin.from('bookings').select('notes, version').eq('id', booking.id).single();
    expect(server).toMatchObject({ notes: 'Änderung Erwachsene', version: 2 });
    expect((await get('bookings', booking.id))?.notes).toBe('Änderung Owner'); // local copy untouched until a decision
    const [conflict] = await getLocalDb().sync_conflicts.toArray();
    expect((conflict!.remote_value as { notes: string }).notes).toBe('Änderung Erwachsene');
    expect((conflict!.local_value as { notes: string }).notes).toBe('Änderung Owner');

    await resolveConflict(conflict!.id, 'keep_local');
    expect((await syncNow(owner.remote)).pushed).toBe(1);
    expect((await admin.from('bookings').select('notes, version').eq('id', booking.id).single()).data).toMatchObject({ notes: 'Änderung Owner', version: 3 });
  });

  it('keeps both versions of a journal entry edited on two devices (append-first)', async () => {
    const one = new Device(fam.member, fam).on();
    const entry = await create('journal_entries', { trip_id: one.tripId, author_user_id: fam.member.id, entry_date: '2026-10-17', title: 'Zwei Geräte', body: 'Start' });
    await one.sync();
    const two = new Device(fam.member, fam);
    await two.sync();
    one.on().offline();
    await update('journal_entries', entry.id, { body: 'Version vom Handy' });
    two.on().offline();
    await update('journal_entries', entry.id, { body: 'Version vom Tablet' });
    one.on().online();
    await syncNow(one.remote);
    two.on().online();
    await syncNow(two.remote);
    await syncNow(two.remote);
    const { data } = await admin.from('journal_entries').select('title, body').eq('author_user_id', fam.member.id).like('title', 'Zwei Geräte%');
    expect(data!.map((r) => r.body).sort()).toEqual(['Version vom Handy', 'Version vom Tablet']);
    expect(await getLocalDb().sync_conflicts.count()).toBe(0);
  });

  it('is resumable: a sync interrupted halfway finishes later without duplicates', async () => {
    const dev = new Device(fam.owner, fam).on();
    await dev.sync();
    const ids: string[] = [];
    for (const title of ['Aufgabe 1', 'Aufgabe 2', 'Aufgabe 3']) ids.push((await create('action_items', { family_id: dev.familyId, trip_id: dev.tripId, title })).id);
    let calls = 0;
    const flaky: RemoteAdapter = new Proxy(dev.remote, {
      get(target, prop, receiver) {
        if (prop === 'apply') return async (m: Parameters<RemoteAdapter['apply']>[0]) => {
          calls += 1;
          if (calls === 2) throw new Error('Netzwerkfehler: Verbindung unterbrochen');
          return target.apply(m);
        };
        return Reflect.get(target, prop, receiver);
      },
    });
    const first = await syncNow(flaky);
    expect(first.failed).toBe(1);
    expect(first.pushed).toBe(2);
    expect(await getLocalDb().sync_mutations.where('status').equals('pending').count()).toBe(1);
    const second = await syncNow(dev.remote);
    expect(second.pushed).toBe(1);
    const { data } = await admin.from('action_items').select('id').in('id', ids);
    expect(data).toHaveLength(3);
  });

  it('survives an expired session: changes stay queued and go through after signing in again', async () => {
    const user = await createUser('sessiontest');
    const { joinFamily } = await import('./harness');
    await joinFamily(fam.family, user, 'adult');
    const member = { ...user, role: 'adult' as Role };
    const dev = new Device(member, fam).on();
    await dev.sync();
    const title = `Nach Sitzungsende ${uniq()}`;
    await create('action_items', { family_id: dev.familyId, trip_id: dev.tripId, title });
    await user.client.auth.signOut(); // revokes the tokens server side
    const failed = await syncNow(dev.remote);
    expect(failed.authRequired).toBe(true);
    expect(failed.conflicts).toBe(0); // a lost session is not a permission decision
    expect(await getLocalDb().sync_mutations.where('status').equals('pending').count()).toBe(1);
    expect(await getLocalDb().sync_conflicts.count()).toBe(0);

    const again = await signIn(user.email);
    dev.remote = remoteFor({ ...again, role: 'adult' }, fam.family.id, 'adult');
    const retry = await syncNow(dev.remote);
    expect(retry.failed).toBe(0);
    const { data } = await admin.from('action_items').select('title').eq('title', title);
    expect(data).toHaveLength(1);
  });

  it('computes payment status from synced, verified payments and hides finance from children', async () => {
    const owner = new Device(fam.owner, fam).on();
    const stay = await create('stays', { trip_id: owner.tripId, name: 'Lodge Okavango', quote_status: 'confirmed', price_minor: 1_000_000, currency: 'BWP', booking_status: 'confirmed' });
    await create('payments', { family_id: owner.familyId, stay_id: stay.id, amount_minor: 400_000, currency: 'BWP', verification_status: 'verified' });
    await create('payments', { family_id: owner.familyId, stay_id: stay.id, amount_minor: 100_000, currency: 'BWP', verification_status: 'unverified' });
    expect((await owner.sync()).failed).toBe(0);

    const adult = new Device(fam.adult, fam).on();
    await adult.sync();
    const synced = (await list('stays')).find((s) => s.id === stay.id)!;
    const fin = computeStayFinancials(synced, (await list('payments')).filter((p) => p.stay_id === stay.id));
    expect(fin).toMatchObject({ state: 'partial', verifiedMinor: 400_000, unverifiedMinor: 100_000, remainingMinor: 600_000, currency: 'BWP' });
    expect((await admin.from('payments').select('amount_minor, currency').eq('stay_id', stay.id)).data).toHaveLength(2);

    const child = new Device(fam.child, fam).on();
    await child.sync();
    const childStay = (await getLocalDb().entity('stays').toArray()).find((s) => s.id === stay.id);
    expect(childStay).toBeDefined();
    expect(childStay!.price_minor).toBeNull();
    expect(await getLocalDb().entity('payments').count()).toBe(0);
  });

  it('rejects, and shows as rejected, a write the role is not allowed to make', async () => {
    const owner = new Device(fam.owner, fam).on();
    const stay = await create('stays', { trip_id: owner.tripId, name: 'Nur Erwachsene' });
    await owner.sync();
    const member = new Device(fam.member, fam).on();
    await member.sync();
    const row = (await getLocalDb().entity('stays').get(stay.id))!;
    const result = await member.remote.apply({ id: crypto.randomUUID(), mutation_id: crypto.randomUUID(), device_id: 'x', entity_type: 'stays', entity_id: stay.id, operation: 'upsert', base_version: Number(row.version), payload: { ...row, name: 'Gehackt' }, status: 'pending', error: null, created_at: new Date().toISOString() });
    expect(result.status).toBe('rejected');
    expect((await admin.from('stays').select('name').eq('id', stay.id).single()).data).toEqual({ name: 'Nur Erwachsene' });
  });

  it('uploads queued photos and voice memos after reconnecting; other devices view them through signed URLs', async () => {
    const phone = new Device(fam.member, fam).on();
    await phone.sync();
    phone.offline();
    const photo = await addMedia({ file: new File([PNG], 'foto.png', { type: 'image/png' }), familyId: phone.familyId, tripId: phone.tripId, caption: 'Düne 45' });
    const memo = await addMedia({ file: new File([new Uint8Array(4096)], 'memo.webm', { type: 'audio/webm' }), familyId: phone.familyId, tripId: phone.tripId });
    expect([photo.upload_state, memo.upload_state]).toEqual(['queued', 'queued']);
    phone.online();
    const summary = await syncNow(phone.remote);
    expect(summary).toMatchObject({ uploaded: 2, failed: 0 });
    expect((await admin.from('media_assets').select('id').in('id', [photo.id, memo.id])).data).toHaveLength(2);

    const tablet = new Device(fam.owner, fam).on();
    await tablet.sync();
    const remoteAsset = (await list('media_assets')).find((m) => m.id === photo.id)!;
    expect(await getLocalDb().blobs.get(photo.id)).toBeUndefined();
    const url = await resolveMediaUrl(remoteAsset, tablet.remote);
    expect(url).toMatch(/\/storage\/v1\/object\/sign\/media\//);
    expect(new Uint8Array(await (await fetch(url!)).arrayBuffer())).toEqual(PNG);
    // a failed upload keeps the row back: no database row without its file
    phone.on();
    await getLocalDb().blobs.clear();
    phone.offline();
    const lost = await addMedia({ file: new File([PNG], 'verloren.png', { type: 'image/png' }), familyId: phone.familyId, tripId: phone.tripId });
    await getLocalDb().blobs.delete(lost.id);
    phone.online();
    const failedRun = await syncNow(phone.remote);
    expect(failedRun.failed).toBe(1);
    expect((await admin.from('media_assets').select('id').eq('id', lost.id)).data).toEqual([]);
  });

  it('stores identity documents encrypted: the server never sees plaintext and only the passphrase opens them', async () => {
    const owner = new Device(fam.owner, fam).on();
    await owner.sync();
    const secret = new TextEncoder().encode('%PDF-1.4 Reisepass Max Mustermann');
    const doc = await addDocument({ file: new File([secret], 'pass.pdf', { type: 'application/pdf' }), familyId: owner.familyId, classification: 'passport', passphrase: 'tresor-passphrase-42' });
    expect((await syncNow(owner.remote)).failed).toBe(0);
    expect(await getLocalDb().blobs.get(doc.id)).toBeUndefined(); // ciphertext is not kept on the device after upload
    const stored = await admin.storage.from('documents').download(doc.storage_path);
    const bytes = new Uint8Array(await stored.data!.arrayBuffer());
    expect(Buffer.from(bytes).includes(Buffer.from('Reisepass'))).toBe(false);

    const adult = new Device(fam.adult, fam).on();
    await adult.sync();
    const synced = (await list('documents')).find((d) => d.id === doc.id)!;
    await expect(openDocument(synced, 'falsch', adult.remote)).rejects.toMatchObject({ code: 'WRONG_PASSPHRASE' });
    expect(new Uint8Array(await (await openDocument(synced, 'tresor-passphrase-42', adult.remote)).arrayBuffer())).toEqual(secret);

    const child = new Device(fam.child, fam).on();
    await child.sync();
    expect(await getLocalDb().entity('documents').count()).toBe(0);
  });

  it('exports synced data with a complete manifest and leaves finance out for children', async () => {
    const owner = new Device(fam.owner, fam).on();
    await owner.sync();
    const result = await buildExport('owner');
    const zip = await JSZip.loadAsync(result.zip);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.tables.journal_entries.rows).toBeGreaterThan(0);
    expect(manifest.tables.payments.rows).toBeGreaterThan(0);
    expect(manifest.contains_demo_data).toBe(false);
    for (const [table, info] of Object.entries(manifest.tables) as [string, { rows: number; json: string }][]) {
      expect(JSON.parse(await zip.file(info.json)!.async('string')), table).toHaveLength(info.rows);
    }
    const child = new Device(fam.child, fam).on();
    await child.sync();
    const childExport = await buildExport('child');
    expect(Object.keys(childExport.manifest.tables)).not.toContain('payments');
    expect(Object.keys(childExport.manifest.tables)).not.toContain('documents');
    expect(activeLocalDatabaseName()).toBeTruthy();
  });
});

describe.skipIf(available)('offline sync against real Supabase', () => {
  it('is not_configured: no local Supabase stack reachable (run scripts/stack.sh up)', () => {
    expect(available).toBe(false);
  });
});
