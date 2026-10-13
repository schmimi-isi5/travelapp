import { NextResponse } from 'next/server';
import { z } from 'zod';
import { mailSuggestionSchema } from '@/lib/ai/mail-types';
import { authorizeMailbox } from '@/lib/server/mailbox/access';

export const dynamic = 'force-dynamic';
const bodySchema = z.object({ ingestId: z.string().uuid(), suggestionId: z.string().min(1), status: z.enum(['accepted', 'dismissed']) });

/** Marks one suggestion as accepted or dismissed (the app has entered the value itself, with the person's confirmation). */
export async function POST(request: Request) {
  const access = await authorizeMailbox(request);
  if (!access.ok) return access.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Angaben ungültig.' }, { status: 400 });
  const { user, admin, familyId } = access.caller;
  const { data: row } = await user!.from('mail_ingest').select('id,suggestions').eq('id', parsed.data.ingestId).eq('family_id', familyId).maybeSingle();
  if (!row) return NextResponse.json({ error: 'NOT_FOUND', message: 'Mail nicht gefunden.' }, { status: 404 });
  const suggestions = z.array(mailSuggestionSchema).parse(row.suggestions);
  if (!suggestions.some((s) => s.id === parsed.data.suggestionId)) return NextResponse.json({ error: 'NOT_FOUND', message: 'Vorschlag nicht gefunden.' }, { status: 404 });
  const next = suggestions.map((s) => (s.id === parsed.data.suggestionId ? { ...s, status: parsed.data.status } : s));
  const { error } = await admin.from('mail_ingest').update({ suggestions: next }).eq('id', parsed.data.ingestId).eq('family_id', familyId);
  if (error) return NextResponse.json({ error: 'UPDATE_FAILED', message: 'Der Vorschlag konnte nicht gespeichert werden.' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
