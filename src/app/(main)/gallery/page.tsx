'use client';

import { Download, Film, Heart, Image as ImageIcon, Mic, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Chip, ConfirmationDialog, Dialog, EmptyState, Field, Input, Notice, PageHeader, ProgressBar, Toolbar } from '@/components/ui';
import { canSeeMedia } from '@/features/journal/visibility';
import { MediaBody } from '@/features/media/media-tile';
import { loadBlob } from '@/lib/db/blob-store';
import { addMedia, MediaError } from '@/lib/db/media';
import { getLocalDb } from '@/lib/db/local';
import { useTable } from '@/lib/db/hooks';
import { remove, update } from '@/lib/db/repo';
import { downloadBlob } from '@/lib/download';
import { canEditOwnedRow } from '@/lib/domain/policy';
import type { MediaAsset } from '@/lib/domain/schemas';
import { formatDateTime } from '@/lib/formatting';

export default function GalleryPage() {
  const { familyId, tripId, currentUser, role } = useApp();
  const media = useTable('media_assets').rows;
  const stops = useTable('trip_stops').rows;
  const [album, setAlbum] = useState('all');
  const [kind, setKind] = useState('all');
  const [onlyFav, setOnlyFav] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<MediaAsset | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const me = currentUser?.id ?? '';

  const visible = media.filter((m) => canSeeMedia(m, me));
  const albums = [...new Set(visible.map((m) => m.album).filter((a): a is string => Boolean(a)))];
  const filtered = visible
    .filter((m) => (album === 'all' ? true : m.album === album))
    .filter((m) => (kind === 'all' ? true : m.kind === kind))
    .filter((m) => (onlyFav ? m.is_favorite : true))
    .sort((a, b) => (b.captured_at ?? b.created_at).localeCompare(a.captured_at ?? a.created_at));
  const index = filtered.findIndex((m) => m.id === openId);
  const current = index >= 0 ? filtered[index] : undefined;

  async function onFiles(list: FileList | null) {
    if (!list) return;
    const problems: string[] = [];
    const files = Array.from(list);
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

  async function download(asset: MediaAsset) {
    const record = await loadBlob(getLocalDb(), asset.id);
    if (record) downloadBlob(record.blob, asset.original_name ?? 'medium');
    else setErrors(['Diese Illustration/Datei hat keine herunterladbare Originaldatei auf diesem Gerät.']);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Galerie" subtitle="Fotos, Videos und Sprachmemos. Nichts wird öffentlich geteilt." actions={<><input ref={fileRef} type="file" multiple accept="image/*,video/*,audio/*" className="sr-only" aria-label="Medien hochladen" onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} /><Button onClick={() => fileRef.current?.click()}><Upload size={18} aria-hidden /> Hochladen</Button></>} />
      {progress !== null && <div className="mb-4"><ProgressBar value={progress} label="Upload-Fortschritt" /></div>}
      {errors.length > 0 && <div className="mb-4 space-y-2">{errors.map((e) => <Notice key={e} tone="danger">{e}</Notice>)}</div>}
      <Toolbar>
        <Chip active={album === 'all'} onClick={() => setAlbum('all')}>Alle Alben</Chip>
        {albums.map((a) => <Chip key={a} active={album === a} onClick={() => setAlbum(a)}>{a}</Chip>)}
        <span className="mx-1 h-6 w-px bg-line" aria-hidden />
        {(['all', 'photo', 'video', 'audio'] as const).map((k) => <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{k === 'all' ? 'Alle Arten' : k === 'photo' ? 'Fotos' : k === 'video' ? 'Videos' : 'Audio'}</Chip>)}
        <Chip active={onlyFav} onClick={() => setOnlyFav(!onlyFav)}><Heart size={14} aria-hidden /> Favoriten</Chip>
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
            {currentUser && canEditOwnedRow(role, current.uploaded_by, currentUser.id) && (
              <Field label="Bildunterschrift">{(p) => <Input {...p} defaultValue={current.caption} key={current.id} onBlur={(e) => e.target.value !== current.caption && void update('media_assets', current.id, { caption: e.target.value })} />}</Field>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={index <= 0} onClick={() => setOpenId(filtered[index - 1]?.id ?? null)}>Zurück</Button><Button variant="secondary" size="sm" disabled={index >= filtered.length - 1} onClick={() => setOpenId(filtered[index + 1]?.id ?? null)}>Weiter</Button></div>
              <div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => void download(current)}><Download size={14} aria-hidden /> Download</Button>{currentUser && canEditOwnedRow(role, current.uploaded_by, currentUser.id) && <Button variant="ghost" size="sm" onClick={() => setDeleting(current)}><Trash2 size={14} aria-hidden /> Löschen</Button>}</div>
            </div>
          </div>
        )}
      </Dialog>
      <ConfirmationDialog open={Boolean(deleting)} title="Medium löschen?" message="Das Medium wird aus der Galerie entfernt." confirmLabel="Löschen" onCancel={() => setDeleting(null)} onConfirm={async () => { if (deleting) { await remove('media_assets', deleting.id); await getLocalDb().blobs.delete(deleting.id); } setDeleting(null); setOpenId(null); }} />
    </div>
  );
}
