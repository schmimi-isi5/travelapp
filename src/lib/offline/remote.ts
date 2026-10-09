import type { SyncMutation } from '../domain/schemas';

export type RemoteRow = Record<string, unknown> & { id: string; version: number };

export type ApplyResult =
  | { status: 'ok'; version: number }
  | { status: 'duplicate'; version: number }
  | { status: 'conflict'; remote: RemoteRow | null }
  /** The server refused the change (permissions, validation). Retrying will not help. */
  | { status: 'rejected'; reason: string };

/** Thrown when the session is gone or no longer valid. Changes stay queued; the user must sign in again. */
export class AuthRequiredError extends Error {
  constructor(message = 'Sitzung abgelaufen: bitte erneut anmelden') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

export type StorageBucket = 'media' | 'documents';

/** The server side of sync. Demo mode simulates it in IndexedDB; supabase mode talks to Postgres and Storage. */
export interface RemoteAdapter {
  readonly name: string;
  /** True when sensitive document ciphertext should be removed from the device once uploaded. */
  readonly dropsSensitiveLocalCopies?: boolean;
  /** Applies a mutation idempotently, rejecting it when `base_version` no longer matches the server row. */
  apply(mutation: SyncMutation): Promise<ApplyResult>;
  pull(table: string): Promise<RemoteRow[]>;
  uploadBlob(path: string, blob: Blob, bucket: StorageBucket): Promise<void>;
  /** Short-lived URL for a private object, or null if the adapter has none (demo). */
  signedUrl(path: string, bucket: StorageBucket, ttlSeconds: number): Promise<string | null>;
  /** Raw object download (used for encrypted documents). Null when the object is unavailable. */
  download(path: string, bucket: StorageBucket): Promise<Blob | null>;
}
