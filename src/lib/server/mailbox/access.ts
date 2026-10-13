import type { SupabaseClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { bearerToken, createAdminClient, createUserClient, isServerConfigured } from '@/lib/server/supabase-admin';

export interface MailboxCaller {
  admin: SupabaseClient;
  /** Client acting as the signed-in adult (RLS applies); null for the scheduler secret. */
  user: SupabaseClient | null;
  userId: string | null;
  /** The family owner may set up the mailbox; the scheduler never. */
  isOwner: boolean;
  familyId: string;
  tripId: string;
  key: string;
}

const fail = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

function secretMatches(request: Request): boolean {
  const expected = process.env.MAILBOX_SYNC_SECRET;
  const given = request.headers.get('x-mailbox-secret');
  if (!expected || expected.length < 16 || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Who may use the mailbox routes: an adult (owner or adult) of a family, or the scheduler with MAILBOX_SYNC_SECRET (sync only).
 * The mailbox only exists with the live backend; the demo mode has no mails.
 */
export async function authorizeMailbox(request: Request, options: { allowScheduler?: boolean } = {}): Promise<{ ok: true; caller: MailboxCaller } | { ok: false; response: NextResponse }> {
  if (process.env.NEXT_PUBLIC_APP_MODE !== 'supabase' || !isServerConfigured()) return { ok: false, response: fail(503, 'MAILBOX_NOT_AVAILABLE', 'Das Postfach gibt es nur in der Live-Version.') };
  const admin = createAdminClient();
  if (options.allowScheduler && secretMatches(request)) {
    const { data: families } = await admin.from('families').select('id').limit(2);
    if (!families || families.length !== 1) return { ok: false, response: fail(409, 'AMBIGUOUS_FAMILY', 'Der Abruf per Zeitplan braucht genau eine Familie.') };
    const familyId = families[0]!.id as string;
    const tripId = await tripOf(admin, familyId);
    if (!tripId) return { ok: false, response: fail(409, 'NO_TRIP', 'Es gibt noch keine Reise.') };
    return { ok: true, caller: { admin, user: null, userId: null, isOwner: false, familyId, tripId, key: 'scheduler' } };
  }
  const token = bearerToken(request);
  if (!token) return { ok: false, response: fail(401, 'UNAUTHENTICATED', 'Bitte anmelden.') };
  const user = createUserClient(token);
  const { data, error } = await user.auth.getUser(token);
  if (error || !data.user) return { ok: false, response: fail(401, 'UNAUTHENTICATED', 'Anmeldung abgelaufen. Bitte neu anmelden.') };
  const { data: membership } = await user.from('family_members').select('family_id,role').eq('user_id', data.user.id).eq('status', 'active').in('role', ['owner', 'adult']).limit(1).maybeSingle();
  if (!membership) return { ok: false, response: fail(403, 'FORBIDDEN', 'Das Postfach ist nur für Erwachsene sichtbar.') };
  const familyId = membership.family_id as string;
  const tripId = await tripOf(admin, familyId);
  if (!tripId) return { ok: false, response: fail(409, 'NO_TRIP', 'Es gibt noch keine Reise.') };
  return { ok: true, caller: { admin, user, userId: data.user.id, isOwner: membership.role === 'owner', familyId, tripId, key: `user:${data.user.id}` } };
}

async function tripOf(admin: SupabaseClient, familyId: string): Promise<string | null> {
  const { data } = await admin.from('trips').select('id').eq('family_id', familyId).order('created_at', { ascending: true }).limit(1).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
