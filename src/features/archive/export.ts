import JSZip from 'jszip';
import { canRead } from '@/lib/domain/policy';
import { ENTITY_NAMES, type EntityName, type Role } from '@/lib/domain/schemas';
import { loadBlob } from '@/lib/db/blob-store';
import { getLocalDb } from '@/lib/db/local';

/** RFC-4180 CSV with a UTF-8 BOM-free body; formula-leading cells are neutralized against spreadsheet injection. */
export function toCsv(header: string[], rows: (string | number | boolean | null | undefined)[][]): string {
  const cell = (value: string | number | boolean | null | undefined): string => {
    let s = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(s) && typeof value === 'string') s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

const SKIPPED_FOR_EXPORT: ReadonlySet<EntityName> = new Set(['invitations']);

export interface ExportManifest {
  format: 'namibia-botswana-export';
  format_version: 1;
  exported_at: string;
  exported_by_role: Role;
  contains_demo_data: boolean;
  tables: Record<string, { rows: number; json: string; csv: string }>;
  media: { id: string; path_in_zip: string | null; original_name: string | null; size_bytes: number; status: 'included' | 'missing' | 'encrypted_not_exported' | 'illustration' }[];
  notes: string[];
}

export interface ExportResult {
  zip: Blob;
  manifest: ExportManifest;
  data: Record<string, unknown[]>;
}

function flatten(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  return value as string | number | boolean;
}

/**
 * Builds the portable archive: JSON + CSV per table, available media files and a manifest that names every
 * missing medium. Tables the role may not read are never exported. Encrypted documents stay out of the archive.
 */
export async function buildExport(role: Role): Promise<ExportResult> {
  const db = getLocalDb();
  const zip = new JSZip();
  const manifest: ExportManifest = { format: 'namibia-botswana-export', format_version: 1, exported_at: new Date().toISOString(), exported_by_role: role, contains_demo_data: false, tables: {}, media: [], notes: [] };
  const data: Record<string, unknown[]> = {};

  for (const table of ENTITY_NAMES) {
    if (SKIPPED_FOR_EXPORT.has(table) || !canRead(role, table)) continue;
    const rows = (await db.entity(table).toArray()) as Record<string, unknown>[];
    data[table] = rows;
    if (rows.some((r) => r.is_demo === true)) manifest.contains_demo_data = true;
    const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    zip.file(`data/${table}.json`, JSON.stringify(rows, null, 2));
    zip.file(`data/${table}.csv`, toCsv(columns, rows.map((r) => columns.map((c) => flatten(r[c])))));
    manifest.tables[table] = { rows: rows.length, json: `data/${table}.json`, csv: `data/${table}.csv` };
  }

  const assets = (data.media_assets ?? []) as { id: string; storage_path: string; original_name: string | null; size_bytes: number; visibility: string }[];
  for (const asset of assets) {
    if (asset.storage_path.startsWith('scene:')) {
      manifest.media.push({ id: asset.id, path_in_zip: null, original_name: asset.original_name, size_bytes: 0, status: 'illustration' });
      continue;
    }
    const blob = await loadBlob(db, asset.id);
    if (!blob) {
      manifest.media.push({ id: asset.id, path_in_zip: null, original_name: asset.original_name, size_bytes: asset.size_bytes, status: 'missing' });
      continue;
    }
    const path = `media/${asset.id}-${(asset.original_name ?? 'datei').replace(/[^\w.\-]+/g, '_')}`;
    zip.file(path, blob.blob);
    manifest.media.push({ id: asset.id, path_in_zip: path, original_name: asset.original_name, size_bytes: blob.size, status: 'included' });
  }
  const docs = (data.documents ?? []) as { id: string; access_level: string; original_name: string }[];
  for (const d of docs) {
    if (d.access_level === 'sensitive') {
      manifest.notes.push(`Dokument „${d.original_name}“ ist verschlüsselt und nicht im Export enthalten.`);
      continue;
    }
    const blob = await loadBlob(db, d.id);
    if (blob) zip.file(`documents/${d.id}-${d.original_name.replace(/[^\w.\-]+/g, '_')}`, blob.blob);
    else manifest.notes.push(`Dokument „${d.original_name}“ fehlt auf diesem Gerät.`);
  }
  const missing = manifest.media.filter((m) => m.status === 'missing').length;
  if (missing) manifest.notes.push(`${missing} Medien fehlen auf diesem Gerät und sind nicht enthalten.`);
  if (manifest.contains_demo_data) manifest.notes.push('Enthält Demo-Daten (is_demo = true).');
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  return { zip: await zip.generateAsync({ type: 'blob' }), manifest, data };
}
