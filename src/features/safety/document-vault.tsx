'use client';

import { KeyRound, Lock, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Dialog, Field, Input, Notice, Select } from '@/components/ui';
import { useTable } from '@/lib/db/hooks';
import { addDocument, DocumentError, openDocument } from '@/lib/db/documents';
import { remove } from '@/lib/db/repo';
import { downloadBlob } from '@/lib/download';
import { isAdult } from '@/lib/domain/policy';
import { DOCUMENT_CLASSIFICATIONS, type DocumentRecord } from '@/lib/domain/schemas';
import { formatBytes } from '@/lib/formatting';

const LABEL: Record<string, string> = { invoice: 'Rechnung', confirmation: 'Bestätigung', passport: 'Reisepass / Ausweis', insurance: 'Versicherung', voucher: 'Voucher', receipt: 'Quittung', ticket: 'Ticket', visa: 'Visum', other: 'Sonstiges' };

export function DocumentVault() {
  const { role, familyId, remote } = useApp();
  const documents = useTable('documents').rows;
  const [classification, setClassification] = useState<DocumentRecord['classification']>('insurance');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [unlock, setUnlock] = useState<DocumentRecord | null>(null);
  const [unlockPass, setUnlockPass] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  if (!isAdult(role)) {
    return <Notice tone="info" title="Dokumenten-Tresor gesperrt">Ausweise, Versicherungs- und Zahlungsdokumente sind in dieser Rolle nicht zugänglich.</Notice>;
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setError(null);
      await addDocument({ file, familyId, classification, passphrase: passphrase || undefined });
    } catch (err) {
      setError(err instanceof DocumentError ? err.message : 'Dokument konnte nicht gespeichert werden.');
    }
  }

  async function open(doc: DocumentRecord, pass?: string) {
    try {
      const blob = await openDocument(doc, pass, remote);
      downloadBlob(blob, doc.original_name);
      setUnlock(null);
      setUnlockPass('');
      setError(null);
    } catch (err) {
      setError(err instanceof DocumentError ? err.message : 'Dokument konnte nicht geöffnet werden.');
    }
  }

  return (
    <div className="space-y-4" data-testid="vault">
      <p className="text-sm text-slate">Dokumente werden privat auf diesem Gerät gespeichert. Ausweis- und Versicherungsdokumente werden mit deiner Passphrase verschlüsselt (AES-256-GCM) und nie im Klartext abgelegt. Die Passphrase wird nicht gespeichert.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Dokumentart">{(p) => <Select {...p} value={classification} onChange={(e) => setClassification(e.target.value as DocumentRecord['classification'])}>{DOCUMENT_CLASSIFICATIONS.map((c) => <option key={c} value={c}>{LABEL[c]}</option>)}</Select>}</Field>
        <Field label="Passphrase" hint="Pflicht für Ausweis/Versicherung">{(p) => <Input {...p} type="password" autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />}</Field>
        <div className="flex items-end"><input ref={fileRef} type="file" className="sr-only" aria-label="Dokument zum Tresor hinzufügen" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={upload} /><Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={16} aria-hidden /> Datei wählen</Button></div>
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <ul className="divide-y divide-line rounded-lg border border-line bg-white" aria-label="Dokumente">
        {documents.length === 0 && <li className="p-4 text-sm text-muted">Keine Dokumente im Tresor.</li>}
        {documents.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3 p-3" data-testid="vault-doc">
            {d.access_level === 'sensitive' ? <Lock size={16} aria-label="verschlüsselt" /> : <KeyRound size={16} aria-hidden className="text-muted" />}
            <span className="min-w-0 flex-1 truncate font-semibold">{d.title ?? d.original_name}</span>
            <Badge>{LABEL[d.classification]}</Badge>
            <span className="text-xs text-muted">{formatBytes(d.size_bytes)}</span>
            <Button size="sm" variant="secondary" onClick={() => (d.access_level === 'sensitive' ? setUnlock(d) : void open(d))}>Öffnen</Button>
            <Button size="sm" variant="ghost" onClick={() => void remove('documents', d.id)}>Löschen</Button>
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(unlock)} onClose={() => { setUnlock(null); setUnlockPass(''); }} title="Passphrase erforderlich">
        <form onSubmit={(e) => { e.preventDefault(); if (unlock) void open(unlock, unlockPass); }} className="space-y-4">
          <Field label="Passphrase" error={error}>{(p) => <Input {...p} type="password" autoComplete="current-password" value={unlockPass} onChange={(e) => setUnlockPass(e.target.value)} />}</Field>
          <div className="flex justify-end"><Button type="submit">Entschlüsseln &amp; öffnen</Button></div>
        </form>
      </Dialog>
    </div>
  );
}
