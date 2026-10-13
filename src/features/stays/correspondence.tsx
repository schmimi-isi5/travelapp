'use client';

import { MessageSquare, Paperclip, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, Dialog, Field, Input, Select, Textarea } from '@/components/ui';
import { addDocument, DocumentError, openDocument } from '@/lib/db/documents';
import { remove } from '@/lib/db/repo';
import type { DocumentRecord, Stay } from '@/lib/domain/schemas';
import { formatDate } from '@/lib/formatting';

const CHANNELS = ['E-Mail', 'WhatsApp / Chat', 'Telefonat', 'Persönlich', 'Sonstiges'] as const;

export const isCorrespondence = (doc: Pick<DocumentRecord, 'classification'>) => doc.classification === 'correspondence';

function fileNameFor(channel: string, subject: string): string {
  const slug = `${channel}-${subject}`.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${slug || 'nachricht'}.txt`;
}

/** Mails, chats and call notes with the host, filed at the stay. Adults only, decided by the caller. */
export function CorrespondenceSection({ stay, documents }: { stay: Stay; documents: DocumentRecord[] }) {
  const { familyId, remote } = useApp();
  const letters = documents.filter(isCorrespondence).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [channel, setChannel] = useState<(typeof CHANNELS)[number]>('E-Mail');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState<{ title: string; body: string } | null>(null);
  const [deleting, setDeleting] = useState<DocumentRecord | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function saveNote(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !text.trim()) {
      setError('Bitte Betreff und Text eingeben.');
      return;
    }
    try {
      setError(null);
      const file = new File([text.trim()], fileNameFor(channel, subject), { type: 'text/plain' });
      await addDocument({ file, familyId, stayId: stay.id, classification: 'correspondence', title: `${channel}: ${subject.trim()}` });
      setSubject('');
      setText('');
    } catch (cause) {
      setError(cause instanceof DocumentError ? cause.message : 'Die Nachricht konnte nicht abgelegt werden.');
    }
  }

  async function attach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setError(null);
      await addDocument({ file, familyId, stayId: stay.id, classification: 'correspondence', title: `${channel}: ${subject.trim() || file.name}` });
      setSubject('');
    } catch (cause) {
      setError(cause instanceof DocumentError ? cause.message : 'Die Datei konnte nicht abgelegt werden.');
    }
  }

  async function open(doc: DocumentRecord) {
    try {
      const blob = await openDocument(doc, undefined, remote);
      if (doc.mime_type === 'text/plain') setReading({ title: doc.title ?? doc.original_name, body: await blob.text() });
      else window.open(URL.createObjectURL(blob), '_blank', 'noopener');
    } catch (cause) {
      setError(cause instanceof DocumentError ? cause.message : 'Die Nachricht konnte nicht geöffnet werden.');
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await remove('documents', deleting.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Die Nachricht konnte nicht gelöscht werden.');
    }
    setDeleting(null);
  }

  return (
    <section aria-label={`Kommunikation ${stay.name}`}>
      <h4 className="mb-2 font-bold">Kommunikation mit der Unterkunft (privat)</h4>
      <ul className="space-y-1">
        {letters.length === 0 && <li className="text-sm text-muted">Noch nichts abgelegt.</li>}
        {letters.map((d) => (
          <li key={d.id} className="flex items-center gap-2 text-sm" data-testid="correspondence-item">
            <MessageSquare size={16} aria-hidden className="shrink-0" />
            <button type="button" className="min-w-0 flex-1 truncate text-left font-semibold text-deep underline" onClick={() => void open(d)}>{d.title ?? d.original_name}</button>
            <span className="shrink-0 text-xs text-muted">{formatDate(d.created_at)}</span>
            <button type="button" aria-label="Nachricht löschen" onClick={() => setDeleting(d)} className="grid size-9 shrink-0 place-items-center rounded-full text-slate hover:bg-sand-50"><Trash2 size={14} aria-hidden /></button>
          </li>
        ))}
      </ul>
      <form onSubmit={saveNote} className="mt-3 space-y-2" aria-label={`Nachricht ablegen ${stay.name}`} noValidate>
        <div className="grid gap-2 sm:grid-cols-3">
          <Field label="Art">{(p) => <Select {...p} value={channel} onChange={(e) => setChannel(e.target.value as (typeof CHANNELS)[number])}>{CHANNELS.map((c) => <option key={c}>{c}</option>)}</Select>}</Field>
          <div className="sm:col-span-2"><Field label="Betreff">{(p) => <Input {...p} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="z. B. Anfrage Ankunftszeit" />}</Field></div>
        </div>
        <Field label="Text" hint="Mail oder Chat hier einfügen, oder Gesprächsnotiz schreiben.">{(p) => <Textarea {...p} value={text} onChange={(e) => setText(e.target.value)} />}</Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="secondary" size="sm">Nachricht ablegen</Button>
          <input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" aria-label={`Datei zur Kommunikation für ${stay.name}`} onChange={attach} />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}><Paperclip size={14} aria-hidden /> Screenshot oder PDF anhängen</Button>
        </div>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </form>
      <Dialog open={reading !== null} onClose={() => setReading(null)} title={reading?.title ?? ''}>
        <p className="whitespace-pre-wrap text-[15px]">{reading?.body}</p>
      </Dialog>
      <Dialog open={deleting !== null} onClose={() => setDeleting(null)} title="Nachricht löschen?">
        <p className="text-slate">„{deleting?.title ?? deleting?.original_name}“ wird endgültig gelöscht.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(null)}>Abbrechen</Button>
          <Button variant="danger" onClick={() => void confirmDelete()}>Endgültig löschen</Button>
        </div>
      </Dialog>
    </section>
  );
}
