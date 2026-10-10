import { newId } from './ids';
import { loadBlob, storeBlob } from './blob-store';
import { getLocalDb } from './local';
import { create } from './repo';
import type { DocumentRecord } from '../domain/schemas';
import type { RemoteAdapter } from '../offline/remote';

export const DOCUMENT_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const PBKDF2_ITERATIONS = 250_000;

export class DocumentError extends Error {
  constructor(
    readonly code: 'TYPE_NOT_ALLOWED' | 'TOO_LARGE' | 'EMPTY' | 'WRONG_PASSPHRASE' | 'PASSPHRASE_REQUIRED' | 'NOT_FOUND' | 'INSECURE_CONTEXT',
    message: string,
  ) {
    super(message);
  }
}

export function validateDocument(file: { name: string; type: string; size: number }): void {
  if (file.size === 0) throw new DocumentError('EMPTY', `„${file.name}“ ist leer.`);
  if (!(DOCUMENT_MIMES as readonly string[]).includes(file.type)) throw new DocumentError('TYPE_NOT_ALLOWED', `„${file.name}“: nur PDF, JPEG, PNG oder WebP erlaubt.`);
  if (file.size > DOCUMENT_MAX_BYTES) throw new DocumentError('TOO_LARGE', `„${file.name}“ ist größer als ${DOCUMENT_MAX_BYTES / 1048576} MB.`);
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  // Web Crypto's subtle API is only exposed in secure contexts (HTTPS or localhost).
  if (!globalThis.crypto?.subtle) throw new DocumentError('INSECURE_CONTEXT', 'Verschlüsselung ist nur über HTTPS oder localhost verfügbar. Bitte die App über eine https-Adresse öffnen.');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** AES-GCM with a PBKDF2-derived key. Output layout: salt(16) | iv(12) | ciphertext. */
export async function encryptBytes(data: ArrayBuffer, passphrase: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(passphrase, salt);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  const out = new Uint8Array(SALT_BYTES + IV_BYTES + cipher.length);
  out.set(salt, 0);
  out.set(iv, SALT_BYTES);
  out.set(cipher, SALT_BYTES + IV_BYTES);
  return out;
}

export async function decryptBytes(payload: Uint8Array, passphrase: string): Promise<ArrayBuffer> {
  const salt = payload.slice(0, SALT_BYTES);
  const iv = payload.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const cipher = payload.slice(SALT_BYTES + IV_BYTES);
  const key = await deriveKey(passphrase, salt);
  try {
    return await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  } catch {
    throw new DocumentError('WRONG_PASSPHRASE', 'Passphrase falsch oder Datei beschädigt.');
  }
}

export interface AddDocumentOptions {
  file: File;
  familyId: string;
  classification: DocumentRecord['classification'];
  stayId?: string | null;
  bookingId?: string | null;
  title?: string | null;
  /** Required for sensitive classifications; the file is stored encrypted and never in plaintext. */
  passphrase?: string;
}

export const SENSITIVE_CLASSIFICATIONS: ReadonlySet<DocumentRecord['classification']> = new Set(['passport', 'insurance']);

export async function addDocument(options: AddDocumentOptions): Promise<DocumentRecord> {
  const { file } = options;
  validateDocument(file);
  const sensitive = SENSITIVE_CLASSIFICATIONS.has(options.classification);
  if (sensitive && !options.passphrase) throw new DocumentError('PASSPHRASE_REQUIRED', 'Für Ausweis- und Versicherungsdokumente ist eine Passphrase erforderlich.');
  const id = newId();
  const stored = sensitive ? new Blob([(await encryptBytes(await file.arrayBuffer(), options.passphrase as string)) as BlobPart], { type: 'application/octet-stream' }) : file;
  await storeBlob(getLocalDb(), id, stored, file.name);
  return create('documents', {
    id,
    family_id: options.familyId,
    stay_id: options.stayId ?? null,
    booking_id: options.bookingId ?? null,
    title: options.title ?? file.name,
    storage_path: `${options.familyId}/documents/${id}-${file.name.replace(/[^\w.\-]+/g, '_')}`,
    original_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    classification: options.classification,
    access_level: sensitive ? 'sensitive' : 'adult',
    upload_state: 'queued',
  });
}

/**
 * Returns a Blob for display/download. Sensitive documents need the passphrase every time.
 * Files that are not stored on this device are fetched from the storage backend on demand (online only).
 */
export async function openDocument(doc: DocumentRecord, passphrase?: string, remote?: Pick<RemoteAdapter, 'download'>): Promise<Blob> {
  const record = await loadBlob(getLocalDb(), doc.id);
  let stored: Blob | null | undefined = record?.blob;
  if (!stored && remote) stored = await remote.download(doc.storage_path, 'documents');
  if (!stored) throw new DocumentError('NOT_FOUND', 'Die Datei ist auf diesem Gerät nicht gespeichert und derzeit nicht abrufbar (offline?).');
  if (doc.access_level !== 'sensitive') return stored;
  if (!passphrase) throw new DocumentError('PASSPHRASE_REQUIRED', 'Passphrase erforderlich.');
  const bytes = new Uint8Array(await stored.arrayBuffer());
  return new Blob([await decryptBytes(bytes, passphrase)], { type: doc.mime_type });
}
