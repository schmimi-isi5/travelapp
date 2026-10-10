'use client';

import { Camera, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Field, Input, Notice, PageHeader, ProgressBar, Select, Textarea } from '@/components/ui';
import { AudioRecorder } from '@/features/media/audio-recorder';
import { addMedia, MediaError } from '@/lib/db/media';
import { useTable } from '@/lib/db/hooks';
import { create, get, update } from '@/lib/db/repo';
import { isAdult } from '@/lib/domain/policy';
import { formatBytes, todayIso } from '@/lib/formatting';

interface PendingFile {
  file: File;
  progress: number;
  error: string | null;
}

function Editor() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get('id');
  const { tripId, familyId, currentUser, today, role } = useApp();
  const stops = useTable('trip_stops').rows;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [date, setDate] = useState(today || todayIso());
  const [stopId, setStopId] = useState('');
  const [visibility, setVisibility] = useState<'family' | 'private'>('family');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [readExif, setReadExif] = useState(false);
  const [shareLocation, setShareLocation] = useState(false);
  const [shareWithFollowers, setShareWithFollowers] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // Only adults publish to followers; private entries and drafts never can be.
  const canShare = isAdult(role) && visibility === 'family';

  useEffect(() => {
    if (!editId) return;
    void get('journal_entries', editId).then((entry) => {
      if (!entry) return;
      setTitle(entry.title);
      setBody(entry.body);
      setDate(entry.entry_date);
      setStopId(entry.stop_id ?? '');
      setVisibility(entry.visibility);
      setShareWithFollowers(entry.shared_with_followers);
    });
  }, [editId]);

  function addFiles(list: FileList | File[]) {
    // Copy first: the FileList is live and is emptied when the input is reset right after selection.
    const picked = Array.from(list);
    setFiles((f) => [...f, ...picked.map((file) => ({ file, progress: 0, error: null }))]);
  }

  async function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
    if (!shareLocation || !navigator.geolocation) return null;
    return new Promise((resolve) => navigator.geolocation.getCurrentPosition((p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }), () => resolve(null), { timeout: 8000 }));
  }

  async function save(status: 'draft' | 'published') {
    if (!currentUser) return;
    if (!title.trim()) return setErrors({ title: 'Bitte einen Titel eingeben.' });
    setErrors({});
    setSaving(true);
    const publishToFollowers = canShare && shareWithFollowers && status === 'published'; // drafts are never shared
    const location = await currentPosition();
    const payload = { trip_id: tripId, stop_id: stopId || null, author_user_id: currentUser.id, entry_date: date, title: title.trim(), body, visibility, status, ...(visibility === 'private' ? { shared_with_followers: false } : canShare ? { shared_with_followers: publishToFollowers } : {}), ...(location ? { location } : {}) };
    const entry = editId ? await update('journal_entries', editId, payload) : await create('journal_entries', payload);
    let failed = false;
    for (let i = 0; i < files.length; i++) {
      const item = files[i]!;
      if (item.progress === 100) continue;
      try {
        await addMedia({ file: item.file, familyId, tripId, stopId: stopId || null, journalEntryId: entry.id, visibility, sharedWithFollowers: publishToFollowers, readExif, onProgress: (p) => setFiles((f) => f.map((x, j) => (j === i ? { ...x, progress: p } : x))) });
      } catch (e) {
        failed = true;
        setFiles((f) => f.map((x, j) => (j === i ? { ...x, error: e instanceof MediaError ? e.message : 'Datei konnte nicht gespeichert werden.' } : x)));
      }
    }
    setSaving(false);
    if (!failed) router.push('/journal');
    else setErrors({ files: 'Der Eintrag wurde gespeichert, aber nicht alle Dateien. Bitte Fehler prüfen.' });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={editId ? 'Eintrag bearbeiten' : 'Neuer Eintrag'} subtitle="Text, Fotos, Video und Sprachmemos. Alles bleibt privat in eurer Familie." />
      <form className="space-y-5" noValidate onSubmit={(e) => { e.preventDefault(); void save('published'); }} aria-label="Tagebucheintrag">
        <Field label="Titel" error={errors.title}>{(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Was war das Besondere heute?" />}</Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Datum">{(p) => <Input {...p} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Field label="Station">{(p) => <Select {...p} value={stopId} onChange={(e) => setStopId(e.target.value)}><option value="">Keine</option>{[...stops].sort((a, b) => a.sequence - b.sequence).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}</Select>}</Field>
          <Field label="Sichtbarkeit">{(p) => <Select {...p} value={visibility} onChange={(e) => setVisibility(e.target.value as 'family' | 'private')}><option value="family">Familie</option><option value="private">Nur ich</option></Select>}</Field>
        </div>
        <Field label="Was habt ihr erlebt?">{(p) => <Textarea {...p} value={body} onChange={(e) => setBody(e.target.value)} rows={7} />}</Field>

        <fieldset className="space-y-3 rounded-lg border border-line bg-white p-4">
          <legend className="px-1 font-bold">Medien</legend>
          <input ref={fileRef} type="file" multiple accept="image/*,video/*,audio/*" className="sr-only" aria-label="Fotos, Videos oder Audio auswählen" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => fileRef.current?.click()}><Camera size={16} aria-hidden /> Fotos / Video / Audio hinzufügen</Button>
            <AudioRecorder onRecorded={(f) => addFiles([f])} />
          </div>
          <ul className="space-y-2" aria-label="Ausgewählte Dateien">
            {files.map((f, i) => (
              <li key={`${f.file.name}-${i}`} className="rounded-md bg-sand-50 p-2 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="truncate">{f.file.name} · {formatBytes(f.file.size)}</span><button type="button" aria-label={`${f.file.name} entfernen`} onClick={() => setFiles((x) => x.filter((_, j) => j !== i))} className="grid size-8 place-items-center"><X size={16} aria-hidden /></button></div>
                {f.progress > 0 && <ProgressBar value={f.progress} label={`Fortschritt ${f.file.name}`} />}
                {f.error && <p role="alert" className="text-danger">{f.error}</p>}
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-4" checked={readExif} onChange={(e) => setReadExif(e.target.checked)} /><span>Aufnahmedatum aus Foto-Metadaten (EXIF) lesen. Standortdaten im Foto werden nie ausgelesen.</span></label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 size-4" checked={shareLocation} onChange={(e) => setShareLocation(e.target.checked)} /><span>Aktuellen Standort einmalig zu diesem Eintrag speichern (Einwilligung, kein Hintergrund-Tracking).</span></label>
          <Badge tone="info">Transkription: nur mit angebundenem Provider</Badge>
        </fieldset>
        {isAdult(role) && (
          <label className="flex items-start gap-2 rounded-lg border border-line bg-white p-4 text-sm">
            <input type="checkbox" className="mt-1 size-4" checked={canShare && shareWithFollowers} disabled={visibility !== 'family'} onChange={(e) => setShareWithFollowers(e.target.checked)} />
            <span><strong>Für Follower freigeben:</strong> Bericht und Fotos sind für Daheimgebliebene mit privatem Link sichtbar (Fotos ohne Ortsdaten). {visibility !== 'family' ? 'Private Einträge lassen sich nicht freigeben.' : 'Entwürfe werden erst beim Veröffentlichen freigegeben.'}</span>
          </label>
        )}
        {errors.files && <Notice tone="warn">{errors.files}</Notice>}

        <div className="sticky bottom-20 z-10 flex flex-wrap justify-end gap-2 rounded-lg bg-white/90 p-2 backdrop-blur lg:static">
          <Button variant="secondary" disabled={saving} onClick={() => void save('draft')}>Als Entwurf speichern</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Speichert …' : 'Veröffentlichen'}</Button>
        </div>
      </form>
    </div>
  );
}

export default function NewEntryPage() {
  return (
    <Suspense fallback={<p>Lädt …</p>}>
      <Editor />
    </Suspense>
  );
}
