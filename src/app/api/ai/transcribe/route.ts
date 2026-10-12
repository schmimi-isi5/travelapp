import { NextResponse } from 'next/server';
import { aiBudgetExceeded, authorizeCaller } from '@/lib/server/ai-guard';
import { log, requestId } from '@/lib/server/logger';
import { createTranscriberFromEnv, MAX_AUDIO_BYTES } from '@/lib/server/transcribe';

export const dynamic = 'force-dynamic';

const LIMIT_PER_USER_HOUR = 20;
const LIMIT_PER_USER_DAY = 60;
/** What MediaRecorder produces on Android (webm/opus) and iPhone (mp4/aac), plus common upload formats. */
const AUDIO_TYPES = /^(audio\/(webm|mp4|x-m4a|m4a|mpeg|mp3|ogg|wav|x-wav|aac|flac)|video\/(webm|mp4))$/;

/** Whether voice memos can be transcribed at all (so the app can say so before anybody records). No audio, no secrets. */
export function GET() {
  const { state, provider, detail } = createTranscriberFromEnv().status();
  return NextResponse.json({ state, provider, detail }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Turns one voice memo into text. Signed-in users only, with its own budget; the audio is passed to the configured service once
 * and neither stored nor logged. The app never saves the text without the person reading it.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  const caller = await authorizeCaller(request);
  if (!caller.ok) return caller.response;
  if (aiBudgetExceeded('transcribe', caller.key, LIMIT_PER_USER_HOUR, LIMIT_PER_USER_DAY)) {
    return NextResponse.json({ error: 'RATE_LIMITED', message: 'Das Kontingent für Abschriften ist vorerst aufgebraucht.' }, { status: 429 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!form || form.get('consent') !== 'true' || !(file instanceof Blob)) return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Aufnahme fehlt oder Einwilligung fehlt.' }, { status: 400 });
  if (file.size === 0 || file.size > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'INVALID_REQUEST', message: `Die Aufnahme muss zwischen 1 Byte und ${MAX_AUDIO_BYTES / 1024 / 1024} MB groß sein.` }, { status: 400 });
  if (!AUDIO_TYPES.test(file.type.split(';')[0]?.trim().toLowerCase() ?? '')) return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Dieses Audioformat wird nicht unterstützt.' }, { status: 400 });
  const transcriber = createTranscriberFromEnv();
  if (transcriber.status().state !== 'ready') return NextResponse.json({ error: 'TRANSCRIPTION_NOT_AVAILABLE', message: transcriber.status().detail }, { status: 503 });
  try {
    const result = await transcriber.transcribe(file, { filename: file instanceof File && file.name ? file.name : 'sprachmemo.webm', language: 'de' });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    log('error', 'transcription failed', { requestId: id, provider: transcriber.id, detail: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'TRANSCRIPTION_FAILED', message: 'Die Abschrift hat nicht geklappt.' }, { status: 502 });
  }
}
