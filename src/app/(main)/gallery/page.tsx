'use client';

import { Download, Film, Heart, Image as ImageIcon, Mic, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Chip, ConfirmationDialog, Dialog, EmptyState, Field, Input, Notice, PageHeader, ProgressBar, Select, Toolbar } from '@/components/ui';
import { BulkUploadPanel, BulkUploadPicker, useBulkUpload } from '@/features/media/bulk-upload';
import { FollowerShareToggle } from '@/features/follow/share-toggle';
import { canSeeMedia } from '@/features/journal/visibility';
import { MediaBody } from '@/features/media/media-tile';
import { loadBlob } from '@/lib/db/blob-store';
import { scanExistingPhotos } from '@/lib/db/photo-metadata';
import { describeDistance, mapLink, stopSourceLabel } from '@/lib/domain/photo-location';
import { haversineKm } from '@/lib/domain/geo';
import { addMedia, MediaError } from '@/lib/db/media';
import { getLocalDb } from '@/lib/db/local';
import { useTable } from '@/lib/db/hooks';
import { remove, update } from '@/lib/db/repo';
import { downloadBlob } from '@/lib/download';
import { canEditOwnedRow } from '@/lib/domain/policy';
import type { MediaAsset } from '@/lib/domain/schemas';
import { formatDateTime } from '@/lib/formatting';
import { clearSharedInbox, readSharedFiles } from '@/lib/share-inbox';

export default function GalleryPage() {
  const { familyId, tripId, currentUser, role, remote } = useApp();
  const media = useTable('media_assets').rows;
  const stops = useTable('trip_stops').rows;
  const [album, setAlbum] = useState('all');
  const [kind, setKind] = useState('all');
  const [stopFilter, setStopFilter] = useState('all');
  const [scan, setScan] = useState<{ done: number; total: number } | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [onlyFav, setOnlyFav] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MediaAsset | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [shareNotice, setShareNotice] = useState<string | null>(null);
  const bulk = useBulkUpload({ familyId, tripId });
  const me = currentUser?.id ?? '';

  const visible = media.filter((m) => canSeeMedia(m, me));
  const albums = [...new Set(visible.map((m) => m.album).filter((a): a is string => Boolean(a)))];
  const filtered = visible
    .filter((m) => (album === 'all' ? true : m.album === album))
    .filter((m) => (kind === 'all' ? true : m.kind === kind))
    .filter((m) => (stopFilter === 'all' ? true : stopFilter === 'none' ? !m.stop_id : m.stop_id === stopFilter))
    .filter((m) => (onlyFav ? m.is_favorite : true))
    .sort((a, b) => (b.captured_at ?? b.created_at).localeCompare(a.captured_at ?? a.created_at));
  const sortedStops = [...stops].sort((a, b) => a.sequence - b.sequence);
  // photos stored before their metadata could be read (only those this person may edit)
  const pendingScan = media.filter((m) => m.kind === 'photo' && m.exif_read_at === null && /jpe?g/i.test(m.mime_type) && currentUser && canEditOwnedRow(role, m.uploaded_by, currentUser.id)).length;
  const index = filtered.findIndex((m) => m.id === openId);
  // a photo stays open when a change (e.g. its station) makes it leave the current filter
  const current = index >= 0 ? filtered[index] : visible.find((m) => m.id === openId);

  async function uploadFiles(files: File[]) {
    const problems: string[] = [];
    for (const [i, file] of files.entries()) {
      try {
        await addMedia({ file, familyId, tripId, onProgress: (p) => setProgress(((i + p / 100) / files.length) * 100) });
      } catch (e) {
        console.error(`Galerie-Upload von „${file.name}“ fehlgeschlagen`, e);
        problems.push(e instanceof MediaError ? e.message : `„${file.name}“ konnte nicht gespeichert werden${e instanceof Error ? ` (${e.name}: ${e.message})` : ''}.`);
      }
    }
    setErrors(problems);
    setProgress(null);
  }

  // Files shared from another app (Android "Teilen mit …") wait in the inbox until this page imports them.
  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get('shared');
    if (flag === 'unavailable') setShareNotice('Teilen funktioniert erst, wenn die App einmal vollständig geöffnet war. Bitte öffne sie kurz und teile die Fotos dann noch einmal.');
    else if (flag === 'error') setShareNotice('Die geteilten Dateien konnten nicht übernommen werden.');
    let isCancelled = false;
    void readSharedFiles().then(async (files) => {
      if (isCancelled || files.length === 0) return;
      await uploadFiles(files);
      await clearSharedInbox();
      setShareNotice(`${files.length} geteilte ${files.length === 1 ? 'Datei' : 'Dateien'} in die Galerie übernommen.`);
    });
    return () => {
      isCancelled = true;
    };
    // runs once per visit; uploadFiles only reads current ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function readExisting() {
    setScanNote(null);
    setScan({ done: 0, total: pendingScan });
    const result = await scanExistingPhotos(remote, (done, total) => setScan({ done, total }));
    setScan(null);
    const parts = [
      `${result.checked} ${result.checked === 1 ? 'Foto' : 'Fotos'} geprüft`,
      `${result.withLocation} mit Aufnahmeort`,
      `${result.assigned} einer Station zugeordnet`,
      result.withoutMetadata > 0 ? `${result.withoutMetadata} ohne Ort und Datum in der Datei (beim Hochladen verkleinert oder vom Handy entfernt, das lässt sich nicht nachholen)` : null,
      result.failed > 0 ? `${result.failed} konnten gerade nicht gelesen werden (kein Netz?), ein nächster Versuch holt sie nach` : null,
    ].filter(Boolean);
    setScanNote(`${parts.join(', ')}.`);
  }

  async function download(asset: MediaAsset) {
    const record = await loadBlob(getLocalDb(), asset.id);
    if (record) downloadBlob(record.blob, asset.original_name ?? 'medium');
    else setErrors(['Diese Illustration/Datei hat keine herunterladbare Originaldatei auf diesem Gerät.']);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Galerie" subtitle="Fotos, Videos und Sprachmemos. Nichts wird öffentlich geteilt." actions={<><BulkUploadPicker batch={bulk} hasItems={bulk.items.length > 0} />{pendingScan > 0 && <Button variant="secondary" disabled={scan !== null} onClick={() => void readExisting()}>Vorhandene Fotos auswerten ({pendingScan})</Button>}</>} />
      <BulkUploadPanel batch={bulk} stops={[...stops].sort((a, b) => a.sequence - b.sequence)} albums={albums} />
      {scan && <div className="mb-4"><ProgressBar value={scan.total ? (scan.done / scan.total) * 100 : 0} label={`Fotos auswerten: ${scan.done} von ${scan.total}`} /></div>}
      {scanNote && <div className="mb-4"><Notice tone="info"><span role="status" data-testid="scan-note">{scanNote}</span></Notice></div>}
      {shareNotice && <div className="mb-4"><Notice tone="info"><span role="status" data-testid="share-notice">{shareNotice}</span></Notice></div>}
      {progress !== null && <div className="mb-4"><ProgressBar value={progress} label="Upload-Fortschritt" /></div>}
      {errors.length > 0 && <div className="mb-4 space-y-2">{errors.map((e) => <Notice key={e} tone="danger">{e}</Notice>)}</div>}
      <p className="mb-3 text-sm"><Link href="/archive" className="font-semibold text-deep underline">Erinnerungen durchsuchen und exportieren</Link></p>
      <Toolbar>
        <Chip active={album === 'all'} onClick={() => setAlbum('all')}>Alle Alben</Chip>
        {albums.map((a) => <Chip key={a} active={album === a} onClick={() => setAlbum(a)}>{a}</Chip>)}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        {(['all', 'photo', 'video', 'audio'] as const).map((k) => <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'Alle Arten' : k === 'photo' ? 'Fotos' : k === 'video' ? 'Videos' : 'Audio'}</Chip>)}
        <Chip active={onlyFav} onClick={() => setOnlyFav(!onlyFav)}><Heart size={14} aria-hidden /> Favoriten</Chip>
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        <Select aria-label="Nach Station filtern" value={stopFilter} onChange={(e) => setStopFilter(e.target.value)} className="min-h-10 w-auto py-1.5 text-sm">
          <option value="all">Alle Stationen</option>
          {sortedStops.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          <option value="none">Ohne Station</option>
        </Select>
      </Toolbar>
      {filtered.length === 0 ? (
        <EmptyState icon={<ImageIcon />} title="Keine Medien" text="Lade Fotos, Videos oder Audio hoch. Sie bleiben privat und werden mit Rechten der Familie geteilt." />
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4" aria-label="Medien">
          {filtered.map((m) => (
            <li key={m.id} className="relative aspect-square overflow-hidden rounded-lg border border-line bg-white" data-testid="media-tile">
              <button type="button" onClick={() => setOpenId(m.id)} className="block h-full w-full" aria-label={`Öffnen: ${m.caption || m.original_name || m.kind}`}>
                <MediaBody asset={m} />
              </button>
              <div className="pointer-events-none absolute left-2 top-2 flex gap-1">
                {m.kind === 'video' && <Badge><Film size={12} aria-hidden /> Video</Badge>}
                {m.kind === 'audio' && <Badge><Mic size={12} aria-hidden /> Audio</Badge>}
                {m.upload_state === 'queued' && <Badge tone="warn">Wartet auf Upload</Badge>}
              </div>
              <button type="button" aria-pressed={m.is_favorite} aria-label={m.is_favorite ? 'Favorit entfernen' : 'Als Favorit markieren'} onClick={() => void update('media_assets', m.id, { is_favorite: !m.is_favorite })} className="absolute right-2 top-2 grid size-10 place-items-center rounded-full bg-white/90"><Heart size={18} aria-hidden className={m.is_favorite ? 'fill-clay text-clay' : 'text-slate'} /></button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={Boolean(current)} onClose={() => setOpenId(null)} title={current?.caption || current?.original_name || 'Medium'} wide>
        {current && (
          <div className="space-y-4">
            <div className="max-h-[55vh] overflow-hidden rounded-lg bg-black/5"><div className="aspect-[4/3] max-h-[55vh] w-full"><MediaBody asset={current} controls /></div></div>
            <p className="text-sm text-slate">{formatDateTime(current.captured_at)} · {stops.find((s) => s.id === current.stop_id)?.title ?? 'Keine Station'} · {current.album ?? 'Kein Album'}</p>
            {current.latitude != null && current.longitude != null && (
              <p className="text-sm text-slate" data-testid="photo-location">
                Aufnahmeort:{' '}
                <a href={mapLink(current.latitude, current.longitude)} target="_blank" rel="noopener noreferrer" className="font-semibold text-deep underline">{current.latitude.toFixed(4)}, {current.longitude.toFixed(4)}</a>
                {(() => {
                  const near = stops.filter((s): s is typeof s & { latitude: number; longitude: number } => s.latitude !== null && s.longitude !== null).map((s) => ({ s, km: haversineKm({ latitude: current.latitude!, longitude: current.longitude! }, s) })).sort((a, b) => a.km - b.km)[0];
                  return near ? ` · ${describeDistance(current.latitude!, current.longitude!, near.s)}` : '';
                })()}
                {current.altitude_m != null ? ` · ${Math.round(current.altitude_m)} m Höhe` : ''}
              </p>
            )}
            {current.camera && <p className="text-sm text-slate" data-testid="photo-camera">Kamera: {current.camera}</p>}
            {currentUser && canEditOwnedRow(role, current.uploaded_by, currentUser.id) && (
              <Field label="Station" hint={current.stop_id && current.stop_source ? stopSourceLabel[current.stop_source] : undefined}>
                {(p) => (
                  <Select {...p} value={current.stop_id ?? ''} onChange={(e) => void update('media_assets', current.id, { stop_id: e.target.value || null, stop_source: e.target.value ? 'manual' : null })}>
                    <option value="">Keine Station</option>
                    {sortedStops.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                  </Select>
                )}
              </Field>
            )}
            {current.kind === 'photo' && (
              <FollowerShareToggle
                checked={current.shared_with_followers}
                label="Für Follower freigeben (Foto ohne Ortsdaten)"
                blockedReason={current.visibility === 'private' ? 'Private Fotos lassen sich nicht freigeben.' : null}
                onChange={async (next) => void (await update('media_assets', current.id, { shared_with_followers: next }))}
              />
            )}
            {currentUser && canEditOwnedRow(role, current.uploaded_by, currentUser.id) && (
              <Field label="Bildunterschrift">{(p) => <Input {...p} defaultValue={current.caption} key={current.id} onBlur={(e) => e.target.value !== current.caption && void update('media_assets', current.id, { caption: e.target.value })} />}</Field>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={index <= 0} onClick={() => setOpenId(filtered[index - 1]?.id ?? null)}>Zurück</Button><Button variant="secondary" size="sm" disabled={index < 0 || index >= filtered.length - 1} onClick={() => setOpenId(filtered[index + 1]?.id ?? null)}>Weiter</Button></div>
              <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => void download(current)}><Download size={14} aria-hidden /> Download</Button>{currentUser && canEditOwnedRow(role, current.uploaded_by, currentUser.id) && <Button variant="ghost" size="sm" onClick={() => setDeleting(current)}><Trash2 size={14} aria-hidden /> Löschen</Button>}</div>
            </div>
          </div>
        )}
      </Dialog>
      <ConfirmationDialog open={Boolean(deleting)} title="Medium löschen?" message="Das Medium wird aus der Galerie entfernt." confirmLabel="Löschen" onCancel={() => setDeleting(null)} onConfirm={async () => { if (deleting) { await remove('media_assets', deleting.id); await getLocalDb().blobs.delete(deleting.id); } setDeleting(null); setOpenId(null); }} />
    </div>
  );
}
