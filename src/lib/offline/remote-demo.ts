import { loadBlob, storeBlob } from '../db/blob-store';
import { getRemoteSimDb } from '../db/local';
import { nowIso } from '../db/ids';
import type { SyncMutation } from '../domain/schemas';
import type { ApplyResult, RemoteAdapter, RemoteRow } from './remote';

/** IndexedDB-backed server simulation: real version checks, real idempotency, no network. */
export class DemoRemote implements RemoteAdapter {
  readonly name = 'Demo-Server (lokal simuliert)';

  async apply(mutation: SyncMutation): Promise<ApplyResult> {
    const remote = getRemoteSimDb();
    const entityKey = `${mutation.entity_type}:${mutation.entity_id}`;
    return remote.transaction('rw', [remote.entity(mutation.entity_type), remote.applied_mutations], async () => {
      const applied = await remote.applied_mutations.get(mutation.mutation_id);
      if (applied) return { status: 'duplicate', version: applied.resulting_version } as const;

      const current = (await remote.entity(mutation.entity_type).get(mutation.entity_id)) as RemoteRow | undefined;
      const currentVersion = current ? Number(current.version) : null;
      if (currentVersion !== mutation.base_version) {
        return { status: 'conflict', remote: current ?? null } as const;
      }
      if (mutation.operation === 'delete') {
        await remote.entity(mutation.entity_type).delete(mutation.entity_id);
        await remote.applied_mutations.put({ mutation_id: mutation.mutation_id, entity_key: entityKey, resulting_version: (currentVersion ?? 0) + 1 });
        return { status: 'ok', version: (currentVersion ?? 0) + 1 } as const;
      }
      const version = (currentVersion ?? 0) + 1;
      await remote.entity(mutation.entity_type).put({ ...(mutation.payload as Record<string, unknown>), id: mutation.entity_id, version, updated_at: nowIso() });
      await remote.applied_mutations.put({ mutation_id: mutation.mutation_id, entity_key: entityKey, resulting_version: version });
      return { status: 'ok', version } as const;
    });
  }

  async pull(table: string): Promise<RemoteRow[]> {
    return (await getRemoteSimDb().entity(table).toArray()) as RemoteRow[];
  }

  async uploadBlob(path: string, blob: Blob): Promise<void> {
    await storeBlob(getRemoteSimDb(), path, blob, path);
  }

  async signedUrl(): Promise<string | null> {
    return null;
  }

  async download(path: string): Promise<Blob | null> {
    return (await loadBlob(getRemoteSimDb(), path))?.blob ?? null;
  }
}

/** Simulates a second device editing the same record on the server (used for the conflict demo). */
export async function simulateOtherDeviceEdit(table: string, id: string, patch: Record<string, unknown>): Promise<boolean> {
  const remote = getRemoteSimDb();
  const row = (await remote.entity(table).get(id)) as RemoteRow | undefined;
  if (!row) return false;
  await remote.entity(table).put({ ...row, ...patch, version: Number(row.version) + 1, updated_at: nowIso() });
  return true;
}
