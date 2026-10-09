import Dexie, { type Table } from 'dexie';
import { ENTITY_NAMES, type SyncConflict, type SyncMutation } from '../domain/schemas';

export interface BlobRecord {
  id: string;
  /** Either the Blob itself or, where the browser cannot persist Blobs, its bytes (see blob-store.ts). */
  blob?: Blob;
  data?: ArrayBuffer;
  name: string;
  type: string;
  size: number;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

/** Tracks the last server version each entity was known to have: the base for optimistic concurrency. */
export interface SyncMetaRecord {
  key: string;
  synced_version: number;
}

export interface AppliedMutationRecord {
  mutation_id: string;
  entity_key: string;
  resulting_version: number;
}

type AnyRow = { id: string; [key: string]: unknown };

export class AppDatabase extends Dexie {
  sync_mutations!: Table<SyncMutation, string>;
  sync_conflicts!: Table<SyncConflict, string>;
  sync_meta!: Table<SyncMetaRecord, string>;
  applied_mutations!: Table<AppliedMutationRecord, string>;
  blobs!: Table<BlobRecord, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name: string) {
    super(name);
    const stores: Record<string, string> = {
      sync_mutations: 'id, mutation_id, status, entity_id, created_at',
      sync_conflicts: 'id, mutation_id, resolved_at',
      sync_meta: 'key',
      applied_mutations: 'mutation_id',
      blobs: 'id',
      meta: 'key',
    };
    for (const entity of ENTITY_NAMES) stores[entity] = 'id, updated_at';
    this.version(1).stores(stores);
  }

  entity(name: string): Table<AnyRow, string> {
    return this.table(name) as Table<AnyRow, string>;
  }
}

export const DEMO_DB_NAME = 'nb-local';
/** Supabase mode keeps one database per user so a shared device never mixes two people's data. */
export const USER_DB_PREFIX = 'nb-sb-';

let localDb: AppDatabase | null = null;
let remoteSim: AppDatabase | null = null;
let localName = DEMO_DB_NAME;

/** The device-local database (source of truth for the UI, always readable offline). */
export function getLocalDb(): AppDatabase {
  localDb ??= new AppDatabase(localName);
  return localDb;
}

/** Switches the active local database (e.g. after sign-in). Closes the previous one. */
export function selectLocalDatabase(name: string): void {
  if (name === localName && localDb) return;
  localDb?.close();
  localDb = null;
  localName = name;
}

export function activeLocalDatabaseName(): string {
  return localName;
}

/** Closes and deletes a local database including its media blobs. */
export async function deleteLocalDatabase(name: string): Promise<void> {
  if (name === localName) {
    localDb?.close();
    localDb = null;
  }
  await Dexie.delete(name);
}

/** Deletes every per-user database except `keep`: other people's data must not linger on a shared device. */
export async function deleteForeignUserDatabases(keep: string | null): Promise<string[]> {
  const factory = (globalThis.indexedDB ?? undefined) as (IDBFactory & { databases?: () => Promise<{ name?: string }[]> }) | undefined;
  if (!factory?.databases) return [];
  const removed: string[] = [];
  for (const db of await factory.databases()) {
    if (db.name?.startsWith(USER_DB_PREFIX) && db.name !== keep) {
      await deleteLocalDatabase(db.name);
      removed.push(db.name);
    }
  }
  return removed;
}

/** Demo-mode stand-in for the server. Separate database so offline/conflict flows are really exercised. */
export function getRemoteSimDb(): AppDatabase {
  remoteSim ??= new AppDatabase('nb-remote-sim');
  return remoteSim;
}

/** Test helper: swap in fresh databases. */
export function resetDatabasesForTests(suffix: string): void {
  localName = `nb-local-${suffix}`;
  localDb = new AppDatabase(localName);
  remoteSim = new AppDatabase(`nb-remote-sim-${suffix}`);
}
