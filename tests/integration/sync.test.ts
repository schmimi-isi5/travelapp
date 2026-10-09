import { beforeEach, describe, expect, it } from 'vitest';
import { getLocalDb, getRemoteSimDb } from '@/lib/db/local';
import { create, get, list, remove, update, ValidationError } from '@/lib/db/repo';
import { ForbiddenError } from '@/lib/domain/policy';
import { DemoRemote, simulateOtherDeviceEdit } from '@/lib/offline/remote-demo';
import { setSimulatedOffline } from '@/lib/offline/network';
import { resolveConflict, syncNow } from '@/lib/offline/sync';
import { DEMO_FAMILY_ID, DEMO_TRIP_ID, DEMO_USERS } from '@/lib/db/demo-data';
import { setActor } from '@/lib/db/actor';
import { freshWorld } from './helpers';

const remote = new DemoRemote();

describe('repository', () => {
  beforeEach(() => freshWorld());

  it('validates input and reports field-level issues', async () => {
    await expect(create('stays', { trip_id: DEMO_TRIP_ID, name: '' })).rejects.toBeInstanceOf(ValidationError);
  });
  it('rejects float or negative money', async () => {
    await expect(create('payments', { family_id: DEMO_FAMILY_ID, stay_id: 'demo-stay-etosha', amount_minor: 10.5, currency: 'NAD' })).rejects.toThrow();
    await expect(create('payments', { family_id: DEMO_FAMILY_ID, stay_id: 'demo-stay-etosha', amount_minor: -5, currency: 'NAD' })).rejects.toThrow();
    await expect(create('payments', { family_id: DEMO_FAMILY_ID, stay_id: 'demo-stay-etosha', amount_minor: 500, currency: 'nad' })).rejects.toThrow();
  });
  it('queues one mutation per entity and bumps the local version', async () => {
    const stay = await create('stays', { trip_id: DEMO_TRIP_ID, name: 'Neue Lodge' });
    await update('stays', stay.id, { notes: 'a' });
    await update('stays', stay.id, { notes: 'b' });
    const pending = await getLocalDb().sync_mutations.where('status').equals('pending').toArray();
    expect(pending.filter((m) => m.entity_id === stay.id)).toHaveLength(1);
    expect((await get('stays', stay.id))?.version).toBe(3);
  });
  it('child cannot read or write finance (no hidden API either)', async () => {
    setActor({ userId: DEMO_USERS.childB, role: 'child' });
    await expect(list('payments')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(list('documents')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(get('expenses', 'demo-exp-1')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(create('payments', { family_id: DEMO_FAMILY_ID, stay_id: 'demo-stay-etosha', amount_minor: 1, currency: 'NAD' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(update('stays', 'demo-stay-etosha', { name: 'x' })).rejects.toBeInstanceOf(ForbiddenError);
  });
  it('members may add journal entries but only edit their own', async () => {
    setActor({ userId: DEMO_USERS.memberTeen, role: 'member' });
    const own = await create('journal_entries', { trip_id: DEMO_TRIP_ID, author_user_id: DEMO_USERS.memberTeen, entry_date: '2026-10-21', title: 'Eigener Eintrag' });
    await expect(update('journal_entries', own.id, { title: 'Geändert' })).resolves.toBeTruthy();
    await expect(update('journal_entries', 'demo-journal-1', { title: 'Fremd' })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(create('journal_entries', { trip_id: DEMO_TRIP_ID, author_user_id: DEMO_USERS.ownerA, entry_date: '2026-10-21', title: 'Fremder Autor' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('sync', () => {
  beforeEach(() => freshWorld());

  it('pushes online changes, acknowledges them and bumps the server version', async () => {
    const stay = await create('stays', { trip_id: DEMO_TRIP_ID, name: 'Sync-Lodge' });
    const summary = await syncNow(remote);
    expect(summary.pushed).toBe(1);
    expect((await getRemoteSimDb().entity('stays').get(stay.id))?.version).toBe(1);
    expect(await getLocalDb().sync_mutations.where('status').equals('pending').count()).toBe(0);
  });

  it('offline: keeps working, queues, and syncs after reconnecting without data loss', async () => {
    setSimulatedOffline(true);
    const entry = await create('journal_entries', { trip_id: DEMO_TRIP_ID, author_user_id: DEMO_USERS.ownerA, entry_date: '2026-10-22', title: 'Offline geschrieben', body: 'Text' });
    await update('action_items', 'demo-action-1', { status: 'done' });
    expect((await syncNow(remote)).skipped).toBe('offline');
    expect(await getLocalDb().sync_mutations.where('status').equals('pending').count()).toBe(2);
    expect((await get('journal_entries', entry.id))?.title).toBe('Offline geschrieben');

    setSimulatedOffline(false);
    const summary = await syncNow(remote);
    expect(summary.pushed).toBe(2);
    expect((await getRemoteSimDb().entity('journal_entries').get(entry.id))?.title).toBe('Offline geschrieben');
    expect((await getRemoteSimDb().entity('action_items').get('demo-action-1'))?.status).toBe('done');
    expect((await get('action_items', 'demo-action-1'))?.version).toBe(2);
  });

  it('is idempotent: replaying an applied mutation does not apply it twice', async () => {
    await create('stays', { trip_id: DEMO_TRIP_ID, name: 'Idempotent' });
    const [mutation] = await getLocalDb().sync_mutations.where('status').equals('pending').toArray();
    const first = await remote.apply(mutation!);
    const second = await remote.apply(mutation!);
    expect(first.status).toBe('ok');
    expect(second.status).toBe('duplicate');
  });

  it('creates a visible conflict when two devices change the same booking, never overwriting silently', async () => {
    setSimulatedOffline(true);
    await update('bookings', 'demo-booking-car', { notes: 'Lokale Änderung' });
    await simulateOtherDeviceEdit('bookings', 'demo-booking-car', { notes: 'Änderung Gerät B' });
    setSimulatedOffline(false);
    const summary = await syncNow(remote);
    expect(summary.conflicts).toBe(1);
    const conflicts = await getLocalDb().sync_conflicts.toArray();
    expect(conflicts).toHaveLength(1);
    expect((conflicts[0]!.local_value as { notes: string }).notes).toBe('Lokale Änderung');
    expect((conflicts[0]!.remote_value as { notes: string }).notes).toBe('Änderung Gerät B');
    expect((await getRemoteSimDb().entity('bookings').get('demo-booking-car'))?.notes).toBe('Änderung Gerät B');
    // The pull must not clobber the local, conflicting row either.
    expect((await get('bookings', 'demo-booking-car'))?.notes).toBe('Lokale Änderung');

    await resolveConflict(conflicts[0]!.id, 'keep_local');
    const after = await syncNow(remote);
    expect(after.pushed).toBe(1);
    expect((await getRemoteSimDb().entity('bookings').get('demo-booking-car'))?.notes).toBe('Lokale Änderung');
  });

  it('can resolve a conflict by taking the server version', async () => {
    setSimulatedOffline(true);
    await update('bookings', 'demo-booking-car', { notes: 'Lokal' });
    await simulateOtherDeviceEdit('bookings', 'demo-booking-car', { notes: 'Server' });
    setSimulatedOffline(false);
    await syncNow(remote);
    const [c] = await getLocalDb().sync_conflicts.toArray();
    await resolveConflict(c!.id, 'keep_remote');
    expect((await get('bookings', 'demo-booking-car'))?.notes).toBe('Server');
    expect(await getLocalDb().sync_mutations.where('status').equals('pending').count()).toBe(0);
  });

  it('journals are append-first: a conflicting edit survives as its own entry', async () => {
    setSimulatedOffline(true);
    await update('journal_entries', 'demo-journal-1', { body: 'Lokale Fassung' });
    await simulateOtherDeviceEdit('journal_entries', 'demo-journal-1', { body: 'Andere Fassung' });
    setSimulatedOffline(false);
    await syncNow(remote);
    await syncNow(remote);
    const entries = await list('journal_entries');
    expect(entries.some((e) => e.body === 'Lokale Fassung' && e.title.includes('Version von diesem Gerät'))).toBe(true);
    expect(await getLocalDb().sync_conflicts.count()).toBe(0);
  });

  it('pulls remote changes made on another device', async () => {
    await simulateOtherDeviceEdit('stays', 'demo-stay-etosha', { notes: 'Von Gerät B' });
    const summary = await syncNow(remote);
    expect(summary.pulled).toBeGreaterThan(0);
    expect((await get('stays', 'demo-stay-etosha'))?.notes).toBe('Von Gerät B');
  });

  it('syncs deletions', async () => {
    await remove('action_items', 'demo-action-3');
    await syncNow(remote);
    expect(await getRemoteSimDb().entity('action_items').get('demo-action-3')).toBeUndefined();
  });

  it('marks offline-created payments as pending until acknowledged', async () => {
    setSimulatedOffline(true);
    const p = await create('payments', { family_id: DEMO_FAMILY_ID, stay_id: 'demo-stay-etosha', amount_minor: 1000, currency: 'NAD', sync_state: 'pending' });
    expect((await get('payments', p.id))?.sync_state).toBe('pending');
    setSimulatedOffline(false);
    await syncNow(remote);
    expect((await get('payments', p.id))?.sync_state).toBe('synced');
  });

  it('children do not pull finance tables', async () => {
    setActor({ userId: DEMO_USERS.childB, role: 'child' });
    await getRemoteSimDb().entity('payments').put({ id: 'secret', version: 1, amount_minor: 1 });
    await syncNow(remote);
    expect(await getLocalDb().entity('payments').get('secret')).toBeUndefined();
  });
});
