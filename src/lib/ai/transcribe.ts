import { isOnline } from '../offline/network';
import { authHeaders } from '../supabase/auth-headers';
import { getAiConsent } from './client';

export type TranscribeOutcome =
  | { ok: true; text: string; provider: string }
  | { ok: false; reason: string };

export interface TranscribeStatus {
  state: 'ready' | 'not_configured' | 'disabled';
  provider: string;
  detail: string;
}

export async function fetchTranscribeStatus(): Promise<TranscribeStatus | null> {
  if (!isOnline()) return null;
  try {
    const res = await fetch('/api/ai/transcribe', { cache: 'no-store' });
    return res.ok ? ((await res.json()) as TranscribeStatus) : null;
  } catch {
    return null;
  }
}

/** Sends one voice memo to the transcription service (only after the person confirmed it) and returns the text. */
export async function transcribeAudio(audio: Blob, filename: string): Promise<TranscribeOutcome> {
  if (!getAiConsent()) return { ok: false, reason: 'KI-Nutzung ist nicht freigegeben (Einstellungen). Es wird nichts gesendet.' };
  if (!isOnline()) return { ok: false, reason: 'Offline: Die Abschrift braucht Netz. Probiere es später noch einmal.' };
  const form = new FormData();
  form.append('consent', 'true');
  form.append('language', 'de');
  form.append('file', audio, filename);
  try {
    const res = await fetch('/api/ai/transcribe', { method: 'POST', headers: await authHeaders(), body: form });
    if (res.status === 429) return { ok: false, reason: 'Das Kontingent für Abschriften ist vorerst aufgebraucht.' };
    if (res.status === 503) return { ok: false, reason: ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? 'Die Abschrift ist noch nicht eingerichtet.' };
    if (!res.ok) return { ok: false, reason: 'Die Abschrift hat nicht geklappt. Bitte später noch einmal versuchen.' };
    const json = (await res.json()) as { text?: string; provider?: string };
    if (!json.text?.trim()) return { ok: false, reason: 'In der Aufnahme wurde keine Sprache erkannt.' };
    return { ok: true, text: json.text.trim(), provider: json.provider ?? 'unbekannt' };
  } catch {
    return { ok: false, reason: 'Der Dienst für Abschriften ist nicht erreichbar.' };
  }
}
