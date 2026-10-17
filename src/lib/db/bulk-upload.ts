import { addMedia, MediaError, validateFile } from './media';

export interface StagedFile {
  key: string;
  file: File;
}

/** The same photo picked twice (same name, size and last change) is one entry. */
export function fileKey(file: File): string {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

export interface StageResult {
  files: StagedFile[];
  /** Picked again although already in the list. */
  duplicates: number;
  /** Not usable (wrong type, empty, too large): never staged, with the reason. */
  rejected: { name: string; reason: string }[];
}

/** Adds picked files to the ones already waiting. Files that cannot be uploaded anyway are refused right away, with the reason. */
export function stageFiles(existing: readonly StagedFile[], picked: readonly File[]): StageResult {
  const files = [...existing];
  const known = new Set(existing.map((f) => f.key));
  const rejected: StageResult['rejected'] = [];
  let duplicates = 0;
  for (const file of picked) {
    const key = fileKey(file);
    if (known.has(key)) {
      duplicates += 1;
      continue;
    }
    try {
      validateFile({ name: file.name, type: file.type, size: file.size });
    } catch (error) {
      rejected.push({ name: file.name, reason: error instanceof MediaError ? error.message : `„${file.name}“ kann nicht hochgeladen werden.` });
      continue;
    }
    known.add(key);
    files.push({ key, file });
  }
  return { files, duplicates, rejected };
}

export interface BatchOptions {
  familyId: string;
  tripId: string;
  stopId?: string | null;
  album?: string | null;
}

export interface BatchResult {
  key: string;
  ok: boolean;
  error?: string;
}

export interface BatchCallbacks {
  onFileStart?: (key: string, position: number, total: number) => void;
  onFileProgress?: (key: string, percent: number) => void;
  onFileDone?: (result: BatchResult) => void;
  /** Stops after the file that is being stored; the rest stays untouched. */
  signal?: AbortSignal;
}

function describeFailure(file: File, error: unknown): string {
  if (error instanceof MediaError) return error.message;
  return `„${file.name}“ konnte nicht gespeichert werden${error instanceof Error ? ` (${error.name}: ${error.message})` : ''}.`;
}

/**
 * Stores the files one after the other (one photo at a time keeps memory low on phones); one failing file does not stop the rest.
 * Files are stored on the device and queued, the sync engine transfers them as soon as there is network.
 */
export async function uploadBatch(files: readonly StagedFile[], options: BatchOptions, callbacks: BatchCallbacks = {}): Promise<{ results: BatchResult[]; wasCancelled: boolean }> {
  const results: BatchResult[] = [];
  for (const [index, { key, file }] of files.entries()) {
    if (callbacks.signal?.aborted) return { results, wasCancelled: true };
    callbacks.onFileStart?.(key, index + 1, files.length);
    let result: BatchResult;
    try {
      await addMedia({ file, familyId: options.familyId, tripId: options.tripId, stopId: options.stopId ?? null, album: options.album?.trim() || null, readExif: true, onProgress: (percent) => callbacks.onFileProgress?.(key, percent) });
      result = { key, ok: true };
    } catch (error) {
      console.error(`Mehrfach-Upload von „${file.name}“ fehlgeschlagen`, error);
      result = { key, ok: false, error: describeFailure(file, error) };
    }
    results.push(result);
    callbacks.onFileDone?.(result);
  }
  return { results, wasCancelled: false };
}
