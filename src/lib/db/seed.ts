import { ENTITY_NAMES, type EntityName } from '../domain/schemas';
import { buildDemoData } from './demo-data';
import { getLocalDb, getRemoteSimDb } from './local';

const SEEDED_KEY = 'seeded';

export async function isSeeded(): Promise<boolean> {
  return Boolean(await getLocalDb().meta.get(SEEDED_KEY));
}

/** Loads demo data into the local database and the simulated server (both at version 1, no pending mutations). */
export async function seedDemoData(): Promise<void> {
  const local = getLocalDb();
  const remote = getRemoteSimDb();
  const data = buildDemoData();
  for (const table of ENTITY_NAMES) {
    const rows = data[table as EntityName] ?? [];
    await local.entity(table).bulkPut(rows as never[]);
    await remote.entity(table).bulkPut(rows as never[]);
    await local.sync_meta.bulkPut(rows.map((r) => ({ key: `${table}:${String(r.id)}`, synced_version: Number(r.version) })));
  }
  await local.meta.put({ key: SEEDED_KEY, value: new Date().toISOString() });
}

export async function ensureSeeded(): Promise<boolean> {
  if (await isSeeded()) return false;
  await seedDemoData();
  return true;
}

/** Wipes every local table and the simulated server, then reseeds. Used by "reset demo" and the GDPR wipe. */
export async function clearAllLocalData(): Promise<void> {
  const local = getLocalDb();
  const remote = getRemoteSimDb();
  await Promise.all([local.delete(), remote.delete()]);
  await local.open();
  await remote.open();
}

export async function resetDemo(): Promise<void> {
  await clearAllLocalData();
  await seedDemoData();
}
