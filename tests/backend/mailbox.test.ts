import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { POST as postAssign } from '@/app/api/mailbox/assign/route';
import { GET as getInbox } from '@/app/api/mailbox/inbox/route';
import { POST as postResolve } from '@/app/api/mailbox/resolve/route';
import { POST as postSync } from '@/app/api/mailbox/sync/route';
import { admin, backendAvailable, createFamilyWithRoles, createUser, deleteCreatedUsers, uniq } from './harness';

const available = await backendAvailable();
const REF = `AB-${Math.floor(10000 + Math.random() * 89999)}`;
const mails = [
  { uid: 1, messageId: `<paid-${uniq()}@lodge.test>`, from: 'Rezeption <info@lodge.test>', subject: 'Anzahlung erhalten', receivedAt: '2026-10-12T09:00:00.000Z', attachmentNames: [], text: `Booking reference: ${REF}\nWe have received your deposit of NAD 2,340.00 on 12 October 2026. The balance of NAD 4,000.00 is due on 01.11.2026.` },
  { uid: 2, messageId: `<news-${uniq()}@promo.test>`, from: 'news@promo.test', subject: 'Newsletter', receivedAt: '2026-10-12T10:00:00.000Z', attachmentNames: ['flyer.pdf'], text: 'Our rooms cost about NAD 1,200 per night.' },
];
const call = (handler: (r: Request) => Promise<Response> | Response, path: string, token: string | null, body?: unknown, headers: Record<string, string> = {}) =>
  handler(new Request(`http://localhost${path}`, { method: body === undefined && handler !== postSync ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }));

describe.skipIf(!available)('mailbox (real database, stub mail source, no AI)', () => {
  let ctx: Awaited<ReturnType<typeof createFamilyWithRoles>>;
  let stayId = '';
  const previous = { ...process.env };

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_APP_MODE = 'supabase';
    process.env.MAILBOX_SOURCE = 'stub';
    process.env.MAILBOX_STUB_MAILS = JSON.stringify(mails);
    process.env.MAILBOX_AI = 'off';
    process.env.MAILBOX_SYNC_SECRET = 'scheduler-secret-0123456789';
    ctx = await createFamilyWithRoles();
    const { data } = await ctx.owner.client.from('stays').insert({ trip_id: ctx.family.tripId, name: 'Arebbusch Travel Lodge', booking_ref: REF, contact: 'info@lodge.test' }).select('id').single();
    stayId = String((data as { id: string }).id);
  });
  afterAll(async () => {
    for (const key of ['NEXT_PUBLIC_APP_MODE', 'MAILBOX_SOURCE', 'MAILBOX_STUB_MAILS', 'MAILBOX_AI', 'MAILBOX_SYNC_SECRET']) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await deleteCreatedUsers();
  });

  it('reports the mailbox state to adults, with the access in use and without secrets', async () => {
    const body = await (await call(getInbox, '/api/mailbox/inbox', ctx.adult.accessToken)).json();
    expect(body.mailbox).toMatchObject({ state: 'ready', origin: 'stub' });
    expect(JSON.stringify(body.mailbox)).not.toMatch(/password|secret/i);
  });

  it('is for adults of a family only', async () => {
    expect((await call(postSync, '/api/mailbox/sync', null)).status).toBe(401);
    expect((await call(postSync, '/api/mailbox/sync', 'bad-token')).status).toBe(401);
    for (const who of [ctx.member, ctx.child]) expect((await call(postSync, '/api/mailbox/sync', who.accessToken)).status, who.role).toBe(403);
    const stranger = await createUser('fremd');
    expect((await call(postSync, '/api/mailbox/sync', stranger.accessToken)).status).toBe(403);
    expect((await call(getInbox, '/api/mailbox/inbox', ctx.member.accessToken)).status).toBe(403);
  });

  it('refuses the scheduler with a wrong secret and does not guess the family when there are several', async () => {
    expect((await call(postSync, '/api/mailbox/sync', null, undefined, { 'x-mailbox-secret': 'wrong-secret-0123456789' })).status).toBe(401);
    expect((await call(postSync, '/api/mailbox/sync', null, undefined, { 'x-mailbox-secret': 'scheduler-secret-0123456789' })).status).toBe(409);
  });

  it('files the mails: one matched by booking reference with suggestions, one left unassigned, a text file per mail', async () => {
    const res = await call(postSync, '/api/mailbox/sync', ctx.adult.accessToken);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ fetched: 2, stored: 2, assigned: 1, withSuggestions: 1, aiUsed: false });

    const inbox = await (await call(getInbox, '/api/mailbox/inbox', ctx.owner.accessToken)).json();
    expect(inbox.mails).toHaveLength(2);
    const paid = inbox.mails.find((m: { subject: string }) => m.subject === 'Anzahlung erhalten');
    expect(paid).toMatchObject({ stay_id: stayId, match_reason: 'Buchungsnummer in der Mail' });
    expect(paid.suggestions.map((s: { kind: string; status: string }) => [s.kind, s.status]).sort()).toEqual([['booking_ref', 'pending'], ['payment_due', 'pending'], ['payment_received', 'pending']]);
    expect(paid.suggestions.find((s: { kind: string }) => s.kind === 'payment_received')).toMatchObject({ amount_minor: 234_000, currency: 'NAD', date: '2026-10-12' });
    expect(inbox.mails.find((m: { subject: string }) => m.subject === 'Newsletter')).toMatchObject({ stay_id: null, suggestions: [] });

    const { data: doc } = await admin.from('documents').select('classification,stay_id,mime_type,access_level,storage_path').eq('id', paid.document_id).single();
    expect(doc).toMatchObject({ classification: 'correspondence', stay_id: stayId, mime_type: 'text/plain', access_level: 'adult' });
    const file = await admin.storage.from('documents').download(String((doc as { storage_path: string }).storage_path));
    expect(await file.data?.text()).toContain('Von: Rezeption <info@lodge.test>');
  });

  it('is harmless to run again: mails are not stored twice and nothing is booked automatically', async () => {
    const res = await call(postSync, '/api/mailbox/sync', ctx.adult.accessToken);
    expect(await res.json()).toMatchObject({ fetched: 0, stored: 0 });
    const { count } = await admin.from('mail_ingest').select('id', { count: 'exact', head: true }).eq('family_id', ctx.family.id);
    expect(count).toBe(2);
    const { count: payments } = await admin.from('payments').select('id', { count: 'exact', head: true }).eq('stay_id', stayId);
    expect(payments).toBe(0);
  });

  it('keeps the mails away from members and children at the database level', async () => {
    for (const who of [ctx.member, ctx.child]) {
      const { data } = await who.client.from('mail_ingest').select('id').eq('family_id', ctx.family.id);
      expect(data, who.role).toEqual([]);
    }
    expect((await ctx.adult.client.from('mail_ingest').select('id').eq('family_id', ctx.family.id)).data).toHaveLength(2);
    expect((await ctx.owner.client.from('mail_ingest').update({ subject: 'x' }).eq('family_id', ctx.family.id).select('id')).error).not.toBeNull();
  });

  it('marks a suggestion as accepted or dismissed, and rejects foreign or unknown ids', async () => {
    const inbox = await (await call(getInbox, '/api/mailbox/inbox', ctx.adult.accessToken)).json();
    const paid = inbox.mails.find((m: { stay_id: string | null }) => m.stay_id === stayId);
    const [first, second] = paid.suggestions as { id: string }[];
    expect((await call(postResolve, '/api/mailbox/resolve', ctx.adult.accessToken, { ingestId: paid.id, suggestionId: first!.id, status: 'accepted' })).status).toBe(200);
    expect((await call(postResolve, '/api/mailbox/resolve', ctx.adult.accessToken, { ingestId: paid.id, suggestionId: second!.id, status: 'dismissed' })).status).toBe(200);
    expect((await call(postResolve, '/api/mailbox/resolve', ctx.adult.accessToken, { ingestId: paid.id, suggestionId: 'nope', status: 'accepted' })).status).toBe(404);
    expect((await call(postResolve, '/api/mailbox/resolve', ctx.member.accessToken, { ingestId: paid.id, suggestionId: first!.id, status: 'accepted' })).status).toBe(403);
    const other = await createFamilyWithRoles();
    expect((await call(postResolve, '/api/mailbox/resolve', other.adult.accessToken, { ingestId: paid.id, suggestionId: first!.id, status: 'accepted' })).status).toBe(404);
    const after = await (await call(getInbox, '/api/mailbox/inbox', ctx.adult.accessToken)).json();
    const states = after.mails.find((m: { id: string }) => m.id === paid.id).suggestions.map((s: { id: string; status: string }) => [s.id === first!.id, s.status]);
    expect(states).toContainEqual([true, 'accepted']);
  });

  it('assigns a mail by hand to a stay of the own family only, and moves its document along', async () => {
    const inbox = await (await call(getInbox, '/api/mailbox/inbox', ctx.adult.accessToken)).json();
    const news = inbox.mails.find((m: { subject: string }) => m.subject === 'Newsletter');
    expect((await call(postAssign, '/api/mailbox/assign', ctx.adult.accessToken, { ingestId: news.id, stayId, bookingId: null })).status).toBe(200);
    const { data: doc } = await admin.from('documents').select('stay_id').eq('id', news.document_id).single();
    expect(doc).toMatchObject({ stay_id: stayId });
    const other = await createFamilyWithRoles();
    const { data: foreign } = await other.owner.client.from('stays').insert({ trip_id: other.family.tripId, name: 'Fremde Lodge' }).select('id').single();
    expect((await call(postAssign, '/api/mailbox/assign', ctx.adult.accessToken, { ingestId: news.id, stayId: (foreign as { id: string }).id, bookingId: null })).status).toBe(404);
    expect((await call(postAssign, '/api/mailbox/assign', ctx.adult.accessToken, { ingestId: news.id, stayId, bookingId: stayId })).status).toBe(400);
    expect((await call(postAssign, '/api/mailbox/assign', ctx.adult.accessToken, { ingestId: news.id, stayId: null, bookingId: null })).status).toBe(200);
  });
});
