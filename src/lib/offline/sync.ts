import { getActor } from '../db/actor';
import { newId, nowIso } from '../db/ids';
import { loadBlob } from '../db/blob-store';
import { getLocalDb } from '../db/local';
import { canRead } from '../domain/policy';
import { ENTITY_NAMES, type SyncConflict, type SyncMutation } from '../domain/schemas';
import { isOnline } from './network';
import { AuthRequiredError, type RemoteAdapter, type RemoteRow } from './remote';

export interface SyncSummary {
  skipped: 'offline' | 'running' | null;
  pushed: number;
  duplicates: number;
  conflicts: number;
  failed: number;
  pulled: number;
  uploaded: number;
  /** Human-readable reasons for failed uploads/mutations, newest run only. */
  errors: string[];
  /** The session is gone: nothing was lost, but the user has to sign in again. */
  authRequired: boolean;
}

const EMPTY: SyncSummary = { skipped: null, pushed: 0, duplicates: 0, conflicts: 0, failed: 0, pulled: 0, uploaded: 0, errors: [], authRequired: false };

let running = false;
const listeners = new Set<() => void>();

export function subscribeSync(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  listeners.forEach((l) => l());
}

async function acknowledge(mutation: SyncMutation, version: number): Promise<void> {
  const db = getLocalDb();
  await db.transaction('rw', [db.entity(mutation.entity_type), db.sync_meta, db.sync_mutations], async () => {
    await db.sync_mutations.put({ ...mutation, status: 'acknowledged', error: null });
    const key = `${mutation.entity_type}:${mutation.entity_id}`;
    if (mutation.operation === 'delete') {
      await db.sync_meta.delete(key);
      return;
    }
    await db.sync_meta.put({ key, synced_version: version });
    const row = await db.entity(mutation.entity_type).get(mutation.entity_id);
    if (row) {
      const patch: Record<string, unknown> = { version };
      if (mutation.entity_type === 'payments') patch.sync_state = 'synced';
      await db.entity(mutation.entity_type).put({ ...row, ...patch });
    }
  });
}

/** Journals are append-first: a conflicting local version becomes its own entry so no text is lost. */
async function resolveJournalByAppending(mutation: SyncMutation): Promise<void> {
  const db = getLocalDb();
  const payload = mutation.payload as Record<string, unknown> | null;
  if (payload && mutation.operation === 'upsert') {
    const copyId = newId();
    const now = nowIso();
    await db.entity('journal_entries').put({
      ...payload,
      id: copyId,
      title: `${String(payload.title ?? 'Eintrag')} (Version von diesem Gerät)`,
      version: 1,
      created_at: now,
      updated_at: now,
    });
    await db.sync_mutations.put({ ...mutation, id: newId(), mutation_id: newId(), entity_id: copyId, base_version: null, payload: { ...payload, id: copyId, title: `${String(payload.title ?? 'Eintrag')} (Version von diesem Gerät)`, version: 1 }, status: 'pending' });
  }
  await db.sync_mutations.put({ ...mutation, status: 'acknowledged', error: 'Als eigener Eintrag angehängt (append-first)' });
}

async function recordConflict(mutation: SyncMutation, remote: RemoteRow | null, reason: string | null = null): Promise<void> {
  const db = getLocalDb();
  const conflict: SyncConflict = {
    id: newId(),
    mutation_id: mutation.mutation_id,
    entity_type: mutation.entity_type,
    entity_id: mutation.entity_id,
    local_value: mutation.payload,
    remote_value: remote,
    created_at: nowIso(),
    resolved_at: null,
    resolution: null,
    reason,
  };
  await db.transaction('rw', [db.sync_conflicts, db.sync_mutations], async () => {
    await db.sync_conflicts.put(conflict);
    await db.sync_mutations.put({ ...mutation, status: 'conflict', error: reason });
  });
}

interface UploadOutcome {
  uploaded: number;
  /** Entity ids whose file could not be uploaded: their row mutation must wait (no row without its object). */
  blocked: Set<string>;
  errors: string[];
}

const FILE_TABLES = [
  { table: 'media_assets', bucket: 'media' },
  { table: 'documents', bucket: 'documents' },
] as const;

/** Uploads queued files one by one. A failure keeps the file queued for the next run and never aborts the others. */
async function flushQueuedFiles(remote: RemoteAdapter): Promise<UploadOutcome> {
  const db = getLocalDb();
  const outcome: UploadOutcome = { uploaded: 0, blocked: new Set(), errors: [] };
  for (const { table, bucket } of FILE_TABLES) {
    const queued = await db.entity(table).filter((r) => r.upload_state === 'queued').toArray();
    for (const asset of queued) {
      const id = String(asset.id);
      try {
        const blob = await loadBlob(db, id);
        if (!blob) throw new Error('Lokale Datei fehlt');
        await remote.uploadBlob(String(asset.storage_path), blob.blob, bucket);
        await db.entity(table).put({ ...asset, upload_state: 'uploaded' });
        const pending = await db.sync_mutations.where('entity_id').equals(id).filter((m) => m.status === 'pending').first();
        if (pending?.payload) await db.sync_mutations.put({ ...pending, payload: { ...pending.payload, upload_state: 'uploaded' } });
        if (table === 'documents' && asset.access_level === 'sensitive' && remote.dropsSensitiveLocalCopies) await db.blobs.delete(id);
        outcome.uploaded += 1;
      } catch (error) {
        if (error instanceof AuthRequiredError) throw error;
        outcome.blocked.add(id);
        outcome.errors.push(`${String(asset.original_name ?? id)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return outcome;
}

async function pushPending(remote: RemoteAdapter, summary: SyncSummary, blocked: ReadonlySet<string>): Promise<void> {
  const db = getLocalDb();
  const pending = (await db.sync_mutations.where('status').equals('pending').sortBy('created_at')) as SyncMutation[];
  // Entities whose parent mutation failed this run: pushing children now would only produce foreign-key errors.
  const failedEntities = new Set<string>(blocked);
  for (const mutation of pending) {
    if (failedEntities.has(mutation.entity_id)) continue;
    try {
      const result = await remote.apply(mutation);
      if (result.status === 'ok') {
        await acknowledge(mutation, result.version);
        summary.pushed += 1;
      } else if (result.status === 'duplicate') {
        await acknowledge(mutation, result.version);
        summary.duplicates += 1;
      } else if (result.status === 'rejected') {
        const current = await remote.pull(mutation.entity_type).then((rows) => rows.find((r) => r.id === mutation.entity_id) ?? null).catch(() => null);
        await recordConflict(mutation, current, result.reason);
        summary.conflicts += 1;
      } else if (mutation.entity_type === 'journal_entries') {
        await resolveJournalByAppending(mutation);
        summary.pushed += 1;
      } else {
        await recordConflict(mutation, result.remote);
        summary.conflicts += 1;
      }
    } catch (error) {
      if (error instanceof AuthRequiredError) throw error;
      summary.failed += 1;
      failedEntities.add(mutation.entity_id);
      const message = error instanceof Error ? error.message : String(error);
      summary.errors.push(message);
      await db.sync_mutations.put({ ...mutation, error: message });
    }
  }
}

async function pullRemote(remote: RemoteAdapter, summary: SyncSummary): Promise<void> {
  const db = getLocalDb();
  const role = getActor().role;
  const open = await db.sync_mutations.filter((m) => m.status === 'pending' || m.status === 'conflict').toArray();
  const locked = new Set(open.map((m) => `${m.entity_type}:${m.entity_id}`));
  for (const table of ENTITY_NAMES) {
    if (!canRead(role, table)) continue;
    const rows = await remote.pull(table);
    const remoteIds = new Set<string>();
    for (const row of rows) {
      remoteIds.add(row.id);
      const key = `${table}:${row.id}`;
      if (locked.has(key)) continue;
      const meta = await db.sync_meta.get(key);
      if (!meta || meta.synced_version < Number(row.version)) {
        const existing = await db.entity(table).get(row.id);
        // The raw invitation token exists only on the device that created it; the server keeps just its hash.
        const merged = table === 'invitations' && existing?.code ? { ...row, code: existing.code } : row;
        await db.entity(table).put(merged);
        await db.sync_meta.put({ key, synced_version: Number(row.version) });
        summary.pulled += 1;
      }
    }
    const synced = await db.sync_meta.where('key').startsWith(`${table}:`).toArray();
    for (const meta of synced) {
      const id = meta.key.slice(table.length + 1);
      if (!remoteIds.has(id) && !locked.has(meta.key)) {
        await db.entity(table).delete(id);
        await db.sync_meta.delete(meta.key);
        summary.pulled += 1;
      }
    }
  }
}

/** Pushes queued uploads and mutations, then pulls remote changes. Safe to call repeatedly (idempotent). */
export async function syncNow(remote: RemoteAdapter): Promise<SyncSummary> {
  if (!isOnline()) return { ...EMPTY, skipped: 'offline' };
  if (running) return { ...EMPTY, skipped: 'running' };
  running = true;
  notify();
  const summary: SyncSummary = { ...EMPTY };
  try {
    try {
      const uploads = await flushQueuedFiles(remote);
      summary.uploaded = uploads.uploaded;
      summary.failed += uploads.errors.length;
      summary.errors.push(...uploads.errors);
      await pushPending(remote, summary, uploads.blocked);
      // Pending and conflicting rows are locked during the pull, so a failed push never loses local changes.
      await pullRemote(remote, summary);
    } catch (error) {
      summary.failed += 1;
      summary.errors.push(error instanceof Error ? error.message : String(error));
      if (error instanceof AuthRequiredError) summary.authRequired = true;
    }
  } finally {
    running = false;
    notify();
  }
  return summary;
}

export function isSyncRunning(): boolean {
  return running;
}

/** Resolves a conflict explicitly; nothing is overwritten without a decision. */
export async function resolveConflict(conflictId: string, resolution: 'keep_local' | 'keep_remote'): Promise<void> {
  const db = getLocalDb();
  const conflict = await db.sync_conflicts.get(conflictId);
  if (!conflict || conflict.resolved_at) return;
  const mutation = await db.sync_mutations.where('mutation_id').equals(conflict.mutation_id).first();
  await db.transaction('rw', [db.sync_conflicts, db.sync_mutations, db.sync_meta, db.entity(conflict.entity_type)], async () => {
    const key = `${conflict.entity_type}:${conflict.entity_id}`;
    const remote = conflict.remote_value as RemoteRow | null;
    if (resolution === 'keep_remote') {
      if (remote) {
        await db.entity(conflict.entity_type).put(remote);
        await db.sync_meta.put({ key, synced_version: Number(remote.version) });
      } else {
        await db.entity(conflict.entity_type).delete(conflict.entity_id);
        await db.sync_meta.delete(key);
      }
      if (mutation) await db.sync_mutations.put({ ...mutation, status: 'acknowledged', error: 'Konflikt: Serverstand übernommen' });
    } else if (mutation) {
      // Re-queue the local change on top of the server version we just saw.
      await db.sync_mutations.put({ ...mutation, mutation_id: newId(), base_version: remote ? Number(remote.version) : null, status: 'pending', error: null });
      if (remote) await db.sync_meta.put({ key, synced_version: Number(remote.version) });
    }
    await db.sync_conflicts.put({ ...conflict, resolved_at: nowIso(), resolution });
  });
  notify();
}
