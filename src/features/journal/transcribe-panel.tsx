'use client';

import { FileText, Sparkles, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, Button, ConfirmationDialog, Notice, Textarea } from '@/components/ui';
import { requestAi } from '@/lib/ai/client';
import { fetchTranscribeStatus, transcribeAudio, type TranscribeStatus } from '@/lib/ai/transcribe';

interface Props {
  /** The recording to transcribe (a local file, or fetched from storage); null when it cannot be had. */
  getAudio: () => Promise<Blob | null>;
  filename: string;
  /** A transcript that already exists (saved with the memo); shown without sending anything. */
  initialText?: string;
  initialProvider?: string;
  /** Takes the (checked) text over into the entry. */
  onUse: (text: string, provider: string) => void;
  useLabel?: string;
  /** Keeps the text with the memo (saved entries only). */
  onSave?: (text: string, provider: string) => void;
}

/**
 * From voice memo to written text: transcribe (after a confirmation, because the recording leaves the device once), read and
 * correct, optionally smooth with the AI (filler words, recognition errors), then take it over into the entry. The text is
 * always editable and never saved or used without the person pressing a button.
 */
export function TranscribePanel({ getAudio, filename, initialText = '', initialProvider = '', onUse, useLabel = 'In den Eintrag übernehmen', onSave }: Props) {
  const [status, setStatus] = useState<TranscribeStatus | null | undefined>(undefined);
  const [text, setText] = useState(initialText);
  const [provider, setProvider] = useState(initialProvider);
  const [rawBeforeSmoothing, setRawBeforeSmoothing] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'info' | 'warn' | 'ok'; text: string } | null>(null);

  useEffect(() => {
    let isCancelled = false;
    void fetchTranscribeStatus().then((s) => !isCancelled && setStatus(s));
    return () => {
      isCancelled = true;
    };
  }, []);

  async function transcribe() {
    setIsConfirming(false);
    setIsBusy(true);
    setNote(null);
    const audio = await getAudio();
    if (!audio) {
      setIsBusy(false);
      return setNote({ tone: 'warn', text: 'Die Aufnahme ist auf diesem Gerät gerade nicht verfügbar. Bitte mit Netz noch einmal versuchen.' });
    }
    const outcome = await transcribeAudio(audio, filename);
    setIsBusy(false);
    if (!outcome.ok) return setNote({ tone: 'warn', text: outcome.reason });
    setText(outcome.text);
    setProvider(outcome.provider);
    setRawBeforeSmoothing(null);
    setNote({ tone: 'info', text: 'Automatische Abschrift. Bitte lesen und korrigieren, Namen und Orte werden gern falsch erkannt.' });
  }

  async function smooth() {
    setIsBusy(true);
    setNote(null);
    const { result, fallbackReason } = await requestAi({ task: 'clean_transcript', input: { entries: [{ title: 'Abschrift', body: text.slice(0, 8000) }] } });
    setIsBusy(false);
    setRawBeforeSmoothing(text);
    setText(result.text);
    setNote(result.origin === 'ai_generated'
      ? { tone: 'ok', text: `Von der KI geglättet (${result.provider}). Bitte prüfen, ob der Sinn erhalten ist.` }
      : { tone: 'info', text: `${result.availability_note}${fallbackReason ? ` (${fallbackReason})` : ''}` });
  }

  const isUnavailable = status !== undefined && status !== null && status.state !== 'ready';
  return (
    <div className="mt-2 rounded-md bg-sand-50 p-3 text-sm" data-testid="transcribe-panel">
      {!text && (
        <>
          <Button type="button" size="sm" variant="secondary" disabled={isBusy || isUnavailable} onClick={() => setIsConfirming(true)}><FileText size={14} aria-hidden /> {isBusy ? 'Abschrift wird erstellt …' : 'Abschrift erstellen'}</Button>
          {isUnavailable && <p className="mt-2 text-muted" data-testid="transcribe-unavailable">Die Abschrift von Sprachmemos ist noch nicht eingerichtet.</p>}
        </>
      )}
      {text && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {provider && <Badge tone="neutral">Automatische Abschrift ({provider})</Badge>}
          </div>
          <label className="block">
            <span className="mb-1 block font-semibold">Abschrift (bitte prüfen und korrigieren)</span>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} aria-label="Abschrift" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" disabled={isBusy} onClick={() => void smooth()}><Sparkles size={14} aria-hidden /> {isBusy ? 'Wird geglättet …' : 'Glätten'}</Button>
            {rawBeforeSmoothing !== null && <Button type="button" size="sm" variant="ghost" onClick={() => { setText(rawBeforeSmoothing); setRawBeforeSmoothing(null); setNote(null); }}><Undo2 size={14} aria-hidden /> Vorher wiederherstellen</Button>}
            <Button type="button" size="sm" onClick={() => onUse(text.trim(), provider || 'manuell')}>{useLabel}</Button>
            {onSave && <Button type="button" size="sm" variant="secondary" onClick={() => { onSave(text.trim(), provider || 'manuell'); setNote({ tone: 'ok', text: 'Abschrift gespeichert.' }); }}>Abschrift speichern</Button>}
          </div>
        </div>
      )}
      {note && <div className="mt-2"><Notice tone={note.tone}><span data-testid="transcribe-note">{note.text}</span></Notice></div>}
      <ConfirmationDialog
        open={isConfirming}
        title="Aufnahme zur Abschrift senden?"
        message="Die Aufnahme wird einmal an den Dienst für Texterkennung gesendet und dort nicht gespeichert. Sie enthält deine Stimme und alles, was du gesagt hast. Gespeichert wird der Text erst, wenn du ihn geprüft hast."
        confirmLabel="Aufnahme senden"
        tone="primary"
        onCancel={() => setIsConfirming(false)}
        onConfirm={() => void transcribe()}
      />
    </div>
  );
}
