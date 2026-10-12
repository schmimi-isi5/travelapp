import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createProviderFromEnv } from '@/lib/ai/providers';
import { aiBudgetExceeded, authorizeCaller } from '@/lib/server/ai-guard';
import { log, requestId } from '@/lib/server/logger';

export const dynamic = 'force-dynamic';

/** About 2 MB of JPEG as base64; the browser shrinks receipt photos to 1600 px before sending. */
const MAX_BASE64 = 2_800_000;
const LIMIT_PER_USER_HOUR = 20;
const LIMIT_PER_USER_DAY = 60;
const bodySchema = z.object({
  consent: z.literal(true),
  // JPEG only (base64 of the JPEG signature starts with /9j/): other formats and non-images are refused before any provider call
  image: z.string().max(MAX_BASE64).regex(/^\/9j\/[A-Za-z0-9+/]+={0,2}$/),
});

/**
 * Reads one receipt photo and returns suggested expense fields. Nothing is stored here and nothing is saved in the app
 * without the user checking the values. Signed-in users only, with its own tighter budget.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  const caller = await authorizeCaller(request);
  if (!caller.ok) return caller.response;
  if (aiBudgetExceeded('receipt', caller.key, LIMIT_PER_USER_HOUR, LIMIT_PER_USER_DAY)) {
    return NextResponse.json({ error: 'RATE_LIMITED', message: 'Das Kontingent für Belege ist vorerst aufgebraucht. Bitte den Betrag selbst eintragen.' }, { status: 429 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Foto ungültig, zu groß oder Einwilligung fehlt.' }, { status: 400 });
  const provider = createProviderFromEnv();
  const status = provider.status();
  if (status.state !== 'ready' || !provider.extractReceipt) {
    return NextResponse.json({ error: 'AI_NOT_AVAILABLE', message: 'Die Belegerkennung ist nicht verfügbar. Bitte den Betrag selbst eintragen.' }, { status: 503 });
  }
  try {
    const reading = await provider.extractReceipt({ mediaType: 'image/jpeg', base64: parsed.data.image });
    return NextResponse.json({ ...reading.receipt, provider: reading.provider, generated_at: reading.generated_at }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    log('error', 'receipt reading failed', { requestId: id, provider: provider.id, detail: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'AI_PROVIDER_FAILED', message: 'Der Beleg konnte nicht gelesen werden. Bitte den Betrag selbst eintragen.' }, { status: 502 });
  }
}
