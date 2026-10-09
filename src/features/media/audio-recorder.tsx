'use client';

import { Mic, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t));
}

/** Records a voice memo with the browser MediaRecorder. Transcription is not offered without a provider. */
export function AudioRecorder({ onRecorded }: { onRecorded: (file: File) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const supported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  async function start() {
    setError(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onstop = () => {
        const type = rec.mimeType || 'audio/webm';
        const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : 'webm';
        onRecorded(new File(chunks.current, `sprachmemo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`, { type: type.split(';')[0] }));
        stream.current?.getTracks().forEach((t) => t.stop());
      };
      rec.start();
      recorder.current = rec;
      setSeconds(0);
      setRecording(true);
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Mikrofonzugriff wurde verweigert.' : 'Aufnahme nicht möglich (kein Mikrofon gefunden).');
    }
  }

  function stop() {
    recorder.current?.stop();
    setRecording(false);
  }

  if (!supported) return <p className="text-sm text-muted">Sprachaufnahme wird von diesem Browser nicht unterstützt. Audiodateien lassen sich als Datei hinzufügen.</p>;
  return (
    <div>
      {recording ? (
        <Button variant="danger" onClick={stop} aria-label="Aufnahme beenden"><Square size={16} aria-hidden /> Aufnahme beenden · {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</Button>
      ) : (
        <Button variant="sunset" onClick={() => void start()}><Mic size={16} aria-hidden /> Sprachmemo aufnehmen</Button>
      )}
      <p className="mt-1 text-xs text-muted">Transkription: nicht verfügbar (kein Provider angebunden). Die Aufnahme bleibt als Audio erhalten.</p>
      {error && <p role="alert" className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
