import { NextResponse } from 'next/server';
import { createProviderFromEnv } from '@/lib/ai/providers';
import { aiBudgetExceeded } from '@/lib/server/ai-guard';
import { log, requestId } from '@/lib/server/logger';
import { authorizeMailbox } from '@/lib/server/mailbox/access';
import { runMailboxSync } from '@/lib/server/mailbox/ingest';
import { createMailSourceFromEnv, mailboxStatusFromEnv } from '@/lib/server/mailbox/source';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/** One run at a time per instance: a second click while a run is going waits for the same result. */
let running: Promise<unknown> | null = null;

/** Whether the mailbox is connected. Open to everyone, so it says nothing but the state: no address, no variable names. */
export function GET() {
  return NextResponse.json({ state: mailboxStatusFromEnv().state }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Fetches new mails of the trip mailbox, files them at the stays and bookings and prepares suggestions. Adults of the family,
 * or the scheduler with MAILBOX_SYNC_SECRET. Reads only: the mailbox itself is never changed.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  const access = await authorizeMailbox(request, { allowScheduler: true });
  if (!access.ok) return access.response;
  const { caller } = access;
  if (aiBudgetExceeded('mailbox-sync', caller.key, 20, 100)) return NextResponse.json({ error: 'RATE_LIMITED', message: 'Zu viele Abrufe. Bitte später erneut versuchen.' }, { status: 429 });
  const source = createMailSourceFromEnv();
  if (!source) return NextResponse.json({ error: 'MAILBOX_NOT_CONFIGURED', message: mailboxStatusFromEnv().detail }, { status: 503 });
  if (running) return NextResponse.json({ error: 'ALREADY_RUNNING', message: 'Ein Abruf läuft gerade. Bitte kurz warten.' }, { status: 409 });
  const aiProvider = process.env.MAILBOX_AI === 'off' ? null : createProviderFromEnv();
  const run = runMailboxSync({ admin: caller.admin, familyId: caller.familyId, tripId: caller.tripId, source, aiProvider, log: (message, fields) => log('info', message, { requestId: id, ...fields }) });
  running = run;
  try {
    return NextResponse.json({ ...(await run), aiUsed: Boolean(aiProvider && aiProvider.status().state === 'ready') }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    log('error', 'mailbox sync failed', { requestId: id, detail: error instanceof Error ? error.message.slice(0, 200) : String(error) });
    return NextResponse.json({ error: 'MAILBOX_FAILED', message: 'Der Abruf des Postfachs hat nicht geklappt. Zugangsdaten und Verbindung prüfen.' }, { status: 502 });
  } finally {
    running = null;
  }
}
