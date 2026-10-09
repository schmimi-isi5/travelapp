import type { AppDatabase, BlobRecord } from './local';

export interface StoredBlob {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
}

/**
 * Stores a file in IndexedDB. Some browsers (WebKit in private/ephemeral sessions, older Safari) cannot persist Blob
 * objects and abort the transaction; in that case the bytes are stored as an ArrayBuffer instead.
 */
export async function storeBlob(db: AppDatabase, id: string, blob: Blob, name: string): Promise<void> {
  const base = { id, name, type: blob.type, size: blob.size };
  try {
    await db.blobs.put({ ...base, blob });
  } catch {
    await db.blobs.put({ ...base, data: await blob.arrayBuffer() });
  }
}

export function toBlob(record: BlobRecord): Blob {
  return record.blob ?? new Blob([record.data ?? new ArrayBuffer(0)], { type: record.type });
}

export async function loadBlob(db: AppDatabase, id: string): Promise<StoredBlob | undefined> {
  const record = await db.blobs.get(id);
  return record ? { id: record.id, name: record.name, type: record.type, size: record.size, blob: toBlob(record) } : undefined;
}
