import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authorizeMailbox } from '@/lib/server/mailbox/access';

export const dynamic = 'force-dynamic';
const bodySchema = z.object({ ingestId: z.string().uuid(), stayId: z.string().uuid().nullable(), bookingId: z.string().uuid().nullable() }).refine((b) => !(b.stayId && b.bookingId), 'Entweder Unterkunft oder Buchung');

/** Files a mail (and its document) at a stay or booking, or takes it off again. Both must belong to the caller's family. */
export async function POST(request: Request) {
  const access = await authorizeMailbox(request);
  if (!access.ok) return access.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_REQUEST', message: 'Angaben ungültig.' }, { status: 400 });
  const { user, admin, familyId } = access.caller;
  const { ingestId, stayId, bookingId } = parsed.data;
  const { data: row } = await user!.from('mail_ingest').select('id,document_id').eq('id', ingestId).eq('family_id', familyId).maybeSingle();
  if (!row) return NextResponse.json({ error: 'NOT_FOUND', message: 'Mail nicht gefunden.' }, { status: 404 });
  // existence checked as the caller: RLS hides rows of other families
  if (stayId && !(await user!.from('stays').select('id').eq('id', stayId).maybeSingle()).data) return NextResponse.json({ error: 'NOT_FOUND', message: 'Unterkunft nicht gefunden.' }, { status: 404 });
  if (bookingId && !(await user!.from('bookings').select('id').eq('id', bookingId).maybeSingle()).data) return NextResponse.json({ error: 'NOT_FOUND', message: 'Buchung nicht gefunden.' }, { status: 404 });
  const update = await admin.from('mail_ingest').update({ stay_id: stayId, booking_id: bookingId, match_reason: stayId || bookingId ? 'Von Hand zugeordnet' : null }).eq('id', ingestId).eq('family_id', familyId);
  if (update.error) return NextResponse.json({ error: 'UPDATE_FAILED', message: 'Die Zuordnung konnte nicht gespeichert werden.' }, { status: 502 });
  if (row.document_id) await admin.from('documents').update({ stay_id: stayId, booking_id: bookingId }).eq('id', row.document_id as string).eq('family_id', familyId);
  return NextResponse.json({ ok: true });
}
