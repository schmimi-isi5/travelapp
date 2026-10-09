import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createProviderFromEnv } from '@/lib/ai/providers';

export const dynamic = 'force-dynamic';

const MAX_TEXT = 8000;
const bodySchema = z.object({
  consent: z.literal(true),
  task: z.enum(['summarize_journal', 'answer_question', 'draft_day_text']),
  input: z.object({
    question: z.string().max(500).optional(),
    entries: z.array(z.object({ title: z.string().max(200), body: z.string().max(MAX_TEXT) })).max(20).optional(),
    stopTitle: z.string().max(200).optional(),
    facts: z.array(z.string().max(500)).max(30).optional(),
  }),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Anfrage ungültig oder Einwilligung fehlt.' }, { status: 400 });
  }
  const provider = createProviderFromEnv();
  const status = provider.status();
  if (status.state !== 'ready') {
    return NextResponse.json({ error: 'AI_NOT_AVAILABLE', message: status.detail, provider: status.provider }, { status: 503 });
  }
  try {
    const result = await provider.generate({ task: parsed.data.task, input: parsed.data.input });
    return NextResponse.json(result);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', message: 'ai provider failed', provider: provider.id, detail: error instanceof Error ? error.message : String(error) }));
    return NextResponse.json({ error: 'AI_PROVIDER_FAILED', message: 'Der KI-Dienst hat nicht geantwortet.' }, { status: 502 });
  }
}
