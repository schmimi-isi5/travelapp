import type { MailSuggestion } from '@/lib/ai/mail-types';
import { authHeaders } from '@/lib/supabase/auth-headers';

export interface InboxMail {
  id: string;
  from_address: string;
  subject: string;
  received_at: string | null;
  document_id: string | null;
  stay_id: string | null;
  booking_id: string | null;
  match_reason: string | null;
  summary: string | null;
  suggestions: MailSuggestion[];
  extracted_by: string;
}

export interface Inbox {
  mailbox: { state: 'ready' | 'not_configured'; detail: string; address: string | null };
  state: { last_run_at: string | null; last_error: string | null; fetched_total: number } | null;
  mails: InboxMail[];
}

export interface SyncResult {
  fetched: number;
  stored: number;
  alreadyKnown: number;
  assigned: number;
  withSuggestions: number;
  aiFailures: number;
  aiUsed: boolean;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(await authHeaders()), ...init?.headers }, cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as { message?: string } & T;
  if (!res.ok) throw new Error(body.message ?? 'Die Anfrage ist fehlgeschlagen.');
  return body;
}

export const loadInbox = () => call<Inbox>('/api/mailbox/inbox');
export const syncMailbox = () => call<SyncResult>('/api/mailbox/sync', { method: 'POST' });
export const resolveSuggestion = (ingestId: string, suggestionId: string, status: 'accepted' | 'dismissed') =>
  call<{ ok: true }>('/api/mailbox/resolve', { method: 'POST', body: JSON.stringify({ ingestId, suggestionId, status }) });
export const assignMail = (ingestId: string, target: { stayId: string | null; bookingId: string | null }) =>
  call<{ ok: true }>('/api/mailbox/assign', { method: 'POST', body: JSON.stringify({ ingestId, ...target }) });
