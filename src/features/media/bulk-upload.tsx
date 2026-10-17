'use client';

import { Check, Film, ImagePlus, Mic, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, Input, Notice, ProgressBar, Select } from '@/components/ui';
import { stageFiles, uploadBatch, type StagedFile } from '@/lib/db/bulk-upload';
import { detectKind } from '@/lib/db/media';
import { formatBytes } from '@/lib/formatting';
import { isOnline } from '@/lib/offline/network';
import type { TripStop } from '@/lib/domain/schemas';
import { makeThumbnail } from './thumbnail';

export interface StagedItem extends StagedFile {
  isSelected: boolean;
  status: 'ready' | 'uploading' | 'failed';
  percent: number;
  error?: string;
}

export interface BatchSummary {
  stored: number;
  failed: number;
  wasCancelled: boolean;
  wasOffline: boolean;
}

/** The pick-then-upload flow of the gallery: pick many files, mark which ones go, upload them together. */
export function useBulkUpload(target: { familyId: string; tripId: string }) {
  const [items, setItems] = useState<StagedItem[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [position, setPosition] = useState<{ current: number; total: number } | null>(null);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addFiles = useCallback((picked: File[]) => {
    setSummary(null);
    setItems((current) => {
      const result = stageFiles(current, picked);
      setNotices([
        ...result.rejected.map((r) => `${r.reason} Die Datei wurde nicht hinzugefügt.`),
        ...(result.duplicates > 0 ? [`${result.duplicates} ${result.duplicates === 1 ? 'Datei war' : 'Dateien waren'} schon in der Auswahl.`] : []),
      ]);
      const known = new Map(current.map((c) => [c.key, c]));
      return result.files.map((f) => known.get(f.key) ?? { ...f, isSelected: true, status: 'ready' as const, percent: 0 });
    });
  }, []);

  const toggle = (key: string) => setItems((c) => c.map((i) => (i.key === key && !isUploading ? { ...i, isSelected: !i.isSelected } : i)));
  const selectAll = (isSelected: boolean) => setItems((c) => c.map((i) => (isUploading ? i : { ...i, isSelected })));
  const clear = () => {
    setItems([]);
    setNotices([]);
  };
  const cancel = () => abortRef.current?.abort();

  async function upload(options: { stopId: string | null; album: string }) {
    const chosen = items.filter((i) => i.isSelected);
    if (chosen.length === 0 || isUploading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsUploading(true);
    setSummary(null);
    setNotices([]);
    const patch = (key: string, change: Partial<StagedItem>) => setItems((c) => c.map((i) => (i.key === key ? { ...i, ...change } : i)));
    const { results, wasCancelled } = await uploadBatch(chosen, { ...target, stopId: options.stopId, album: options.album }, {
      signal: controller.signal,
      onFileStart: (key, current, total) => {
        setPosition({ current, total });
        patch(key, { status: 'uploading', percent: 0, error: undefined });
      },
      onFileProgress: (key, percent) => patch(key, { percent }),
      onFileDone: (result) => {
        // stored files leave the list at once; a failed one stays, selected, with the reason, ready for another try
        if (result.ok) setItems((c) => c.filter((i) => i.key !== result.key));
        else patch(result.key, { status: 'failed', error: result.error, percent: 0 });
      },
    });
    setPosition(null);
    setIsUploading(false);
    abortRef.current = null;
    setSummary({ stored: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, wasCancelled, wasOffline: !isOnline() });
  }

  return { items, notices, isUploading, position, summary, addFiles, toggle, selectAll, clear, cancel, upload };
}

export type BulkUpload = ReturnType<typeof useBulkUpload>;

/** Button plus hidden file input: only picks, nothing is uploaded yet. */
export function BulkUploadPicker({ batch, hasItems }: { batch: BulkUpload; hasItems: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={inputRef} type="file" multiple accept="image/*,video/*,audio/*" className="sr-only" aria-label="Fotos und Videos zum Hochladen auswählen" onChange={(e) => { batch.addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
      <Button onClick={() => inputRef.current?.click()} disabled={batch.isUploading}><ImagePlus size={18} aria-hidden /> {hasItems ? 'Weitere auswählen' : 'Fotos auswählen'}</Button>
    </>
  );
}

function Thumb({ file }: { file: File }) {
  const kind = detectKind(file.type);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (kind !== 'photo') return;
    let isCancelled = false;
    let created: string | null = null;
    void makeThumbnail(file).then((made) => {
      if (isCancelled) {
        if (made) URL.revokeObjectURL(made);
        return;
      }
      created = made;
      setUrl(made);
    });
    return () => {
      isCancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [file, kind]);
  if (url) {
    // a preview made in the browser from a local file: nothing next/image could optimize
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="size-full object-cover" />;
  }
  return <div className="grid size-full place-items-center bg-sand-50 text-slate" aria-hidden>{kind === 'video' ? <Film size={28} /> : kind === 'audio' ? <Mic size={28} /> : <ImagePlus size={28} />}</div>;
}

function itemNoun(items: readonly StagedItem[], count: number): string {
  const allPhotos = items.every((i) => detectKind(i.file.type) === 'photo');
  return allPhotos ? (count === 1 ? 'Foto' : 'Fotos') : count === 1 ? 'Datei' : 'Dateien';
}

/** The marked files before they go: thumbnails with check marks, album and station for the whole batch, one button. */
export function BulkUploadPanel({ batch, stops, albums }: { batch: BulkUpload; stops: readonly TripStop[]; albums: readonly string[] }) {
  const { items, notices, isUploading, position, summary } = batch;
  const [album, setAlbum] = useState('');
  const [stopId, setStopId] = useState('');
  const selected = items.filter((i) => i.isSelected);
  const failed = items.filter((i) => i.status === 'failed');
  const overall = position ? ((position.current - 1) / position.total) * 100 + (items.find((i) => i.status === 'uploading')?.percent ?? 0) / position.total : null;

  return (
    <div className="mb-4 space-y-3">
      {notices.map((n) => <Notice key={n} tone="warn">{n}</Notice>)}
      {summary && (
        <Notice tone={summary.failed > 0 ? 'warn' : 'info'}>
          <span role="status" data-testid="bulk-summary">
            {summary.stored} {summary.stored === 1 ? 'Datei' : 'Dateien'} hochgeladen{summary.failed > 0 ? `, ${summary.failed} nicht (Grund steht am jeweiligen Bild, mit „erneut versuchen“ geht es weiter)` : ''}
            {summary.wasCancelled ? '. Der Rest wurde nicht hochgeladen und bleibt in der Auswahl' : ''}.
            {summary.wasOffline && summary.stored > 0 ? ' Du bist offline: Die Dateien liegen auf dem Gerät und werden automatisch übertragen, sobald wieder Netz da ist.' : ''}
          </span>
        </Notice>
      )}
      {items.length > 0 && (
        <Card data-testid="bulk-panel" aria-label="Auswahl zum Hochladen" role="region">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold">Auswahl zum Hochladen</h2>
              <p className="text-sm text-slate" data-testid="bulk-count">{selected.length} von {items.length} ausgewählt{failed.length > 0 ? ` · ${failed.length} fehlgeschlagen` : ''}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={isUploading || selected.length === items.length} onClick={() => batch.selectAll(true)}>Alle auswählen</Button>
              <Button size="sm" variant="secondary" disabled={isUploading || selected.length === 0} onClick={() => batch.selectAll(false)}>Keine auswählen</Button>
              <Button size="sm" variant="ghost" disabled={isUploading} onClick={batch.clear}><X size={14} aria-hidden /> Auswahl verwerfen</Button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              Album für alle (optional)
              <Input className="mt-1 font-normal" list="gallery-albums" value={album} onChange={(e) => setAlbum(e.target.value)} placeholder="z. B. Etosha" disabled={isUploading} />
              <datalist id="gallery-albums">{albums.map((a) => <option key={a} value={a} />)}</datalist>
            </label>
            <label className="block text-sm font-semibold">
              Station für alle (optional)
              <Select className="mt-1 font-normal" value={stopId} onChange={(e) => setStopId(e.target.value)} disabled={isUploading}>
                <option value="">Keine Station</option>
                {stops.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </Select>
            </label>
          </div>


          <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6" aria-label="Ausgewählte Dateien">
            {items.map((item) => (
              <li key={item.key} className="relative" data-testid="bulk-item" data-selected={item.isSelected} data-status={item.status}>
                <label className="block cursor-pointer">
                  <input type="checkbox" className="peer sr-only" checked={item.isSelected} disabled={isUploading} onChange={() => batch.toggle(item.key)} aria-label={`Auswählen: ${item.file.name}`} />
                  <span className={`relative block aspect-square overflow-hidden rounded-md border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-gold-700 peer-focus-visible:ring-offset-2 ${item.status === 'failed' ? 'border-danger' : item.isSelected ? 'border-deep' : 'border-line opacity-60'}`}>
                    <Thumb file={item.file} />
                    <span className={`absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full border-2 ${item.isSelected ? 'border-white bg-deep text-white shadow' : 'border-white bg-black/30 text-transparent'}`} aria-hidden><Check size={14} /></span>
                    {item.status === 'uploading' && <span className="absolute inset-x-0 bottom-0 h-1.5 bg-white/60"><span className="block h-full bg-deep" style={{ width: `${item.percent}%` }} /></span>}
                  </span>
                  <span className="mt-1 block truncate text-xs text-slate" title={item.file.name}>{item.file.name}</span>
                  <span className="block text-xs text-muted">{formatBytes(item.file.size)}</span>
                </label>
                {item.status === 'uploading' && <Badge tone="info" className="mt-1">Wird hochgeladen</Badge>}
                {item.status === 'failed' && <p role="alert" className="mt-1 text-xs text-danger" data-testid="bulk-error">{item.error}</p>}
              </li>
            ))}
          </ul>

          <div className="sticky bottom-20 z-20 -mx-5 -mb-5 mt-4 space-y-2 rounded-b-lg border-t border-line bg-white/95 px-5 py-3 backdrop-blur lg:bottom-0" data-testid="bulk-actions">
            {isUploading && overall !== null && position && (
              <div className="space-y-1">
                <ProgressBar value={overall} label="Upload-Fortschritt" />
                <p className="text-sm text-slate" data-testid="bulk-position">Datei {position.current} von {position.total}</p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button disabled={isUploading || selected.length === 0} onClick={() => void batch.upload({ stopId: stopId || null, album })}>
                {isUploading ? 'Wird hochgeladen …' : failed.length > 0 && failed.length === selected.length ? 'Fehlgeschlagene erneut versuchen' : `${selected.length} ${itemNoun(selected, selected.length)} hochladen`}
              </Button>
              {isUploading && <Button variant="secondary" onClick={batch.cancel}>Abbrechen</Button>}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
