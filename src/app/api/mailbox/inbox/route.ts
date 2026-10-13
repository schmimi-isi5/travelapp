import { NextResponse } from 'next/server';
import { authorizeMailbox } from '@/lib/server/mailbox/access';
import { resolveMailbox } from '@/lib/server/mailbox/config';

export const dynamic = 'force-dynamic';
const LIMIT = 100;

/** The mails of the trip mailbox with their suggestions, newest first. Adults only (the database applies the same rule). */
export async function GET(request: Request) {
  const access = await authorizeMailbox(request);
  if (!access.ok) return access.response;
  const { user, admin, familyId } = access.caller;
  const resolved = await resolveMailbox(admin, familyId);
  const [mails, state] = await Promise.all([
    user!.from('mail_ingest').select('id,from_address,subject,received_at,document_id,stay_id,booking_id,match_reason,summary,suggestions,extracted_by').eq('family_id', familyId).order('received_at', { ascending: false, nullsFirst: false }).limit(LIMIT),
    user!.from('mail_sync_state').select('last_run_at,last_error,fetched_total').eq('family_id', familyId).maybeSingle(),
  ]);
  if (mails.error) return NextResponse.json({ error: 'INBOX_FAILED', message: 'Das Postfach konnte nicht geladen werden.' }, { status: 502 });
  return NextResponse.json({ mailbox: { state: resolved.source ? 'ready' : 'not_configured', detail: resolved.detail, address: resolved.address, origin: resolved.origin }, state: state.data ?? null, mails: mails.data }, { headers: { 'Cache-Control': 'no-store' } });
}
