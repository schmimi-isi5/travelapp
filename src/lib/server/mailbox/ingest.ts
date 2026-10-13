import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import type { MailFacts, MailSuggestion } from '@/lib/ai/mail-types';
import type { AiProvider } from '@/lib/ai/types';
import type { Booking, Stay } from '@/lib/domain/schemas';
import { extractFactsByRules, mergeFacts } from './extract';
import { matchMail } from './match';
import type { MailSource, RawMail } from './source';

export const MAILS_PER_RUN = 40;
const MAX_STORED_CHARS = 100_000;

export interface SyncSummary {
  fetched: number;
  stored: number;
  alreadyKnown: number;
  assigned: number;
  withSuggestions: number;
  aiFailures: number;
}

export interface SyncDeps {
  admin: SupabaseClient;
  familyId: string;
  tripId: string;
  source: MailSource;
  /** Reads mail text with AI when given. Only the text goes out, never attachments; null = pattern rules only. */
  aiProvider: AiProvider | null;
  log?: (message: string, fields?: Record<string, unknown>) => void;
}

/** The mail as a plain-text file for the documents bucket: header lines, then the text. */
export function mailToTextFile(mail: RawMail): string {
  const attachments = mail.attachmentNames.length ? `Anhänge (nicht gespeichert): ${mail.attachmentNames.join(', ')}\n` : '';
  const header = `Von: ${mail.from}\nBetreff: ${mail.subject}\nDatum: ${mail.receivedAt ?? 'unbekannt'}\n${attachments}\n`;
  return (header + mail.text).slice(0, MAX_STORED_CHARS);
}

async function readFacts(mail: RawMail, ai: AiProvider | null): Promise<{ facts: MailFacts; by: string; failed: boolean }> {
  const rules = extractFactsByRules(mail.text);
  if (!ai?.extractMailFacts || ai.status().state !== 'ready' || !mail.text.trim()) return { facts: rules, by: 'rules', failed: false };
  try {
    const reading = await ai.extractMailFacts({ from: mail.from, subject: mail.subject, text: mail.text });
    return { facts: mergeFacts(rules, reading), by: reading.provider, failed: false };
  } catch {
    // the rule result stands; the failure is counted, the error text (may echo content) is not logged
    return { facts: rules, by: 'rules', failed: true };
  }
}

/**
 * Fetches new mails and files each one: text as a 'correspondence' document at the matching stay or booking (or unassigned),
 * plus a mail_ingest row with the suggestions. Suggestions stay "pending" until an adult confirms them in the app.
 * Already stored mails (by Message-ID) are skipped, so repeated runs are harmless.
 */
export async function runMailboxSync(deps: SyncDeps): Promise<SyncSummary> {
  const { admin, familyId, tripId, source, aiProvider } = deps;
  const summary: SyncSummary = { fetched: 0, stored: 0, alreadyKnown: 0, assigned: 0, withSuggestions: 0, aiFailures: 0 };
  const { data: state } = await admin.from('mail_sync_state').select('uid_validity,last_uid,fetched_total').eq('family_id', familyId).maybeSingle();
  try {
    const result = await source.fetchNew({ uidValidity: state?.uid_validity ?? null, lastUid: Number(state?.last_uid ?? 0) }, MAILS_PER_RUN);
    summary.fetched = result.mails.length;
    const [{ data: stays }, { data: bookings }] = await Promise.all([
      admin.from('stays').select('id,name,booking_ref,contact').eq('trip_id', tripId),
      admin.from('bookings').select('id,title,reference,contact').eq('trip_id', tripId),
    ]);
    for (const mail of result.mails) {
      const { data: known } = await admin.from('mail_ingest').select('id').eq('family_id', familyId).eq('message_id', mail.messageId).maybeSingle();
      if (known) {
        summary.alreadyKnown += 1;
        continue;
      }
      const match = matchMail(mail, (stays ?? []) as Stay[], (bookings ?? []) as Booking[]);
      const { facts, by, failed } = await readFacts(mail, aiProvider);
      if (failed) summary.aiFailures += 1;
      const documentId = randomUUID();
      const body = mailToTextFile(mail);
      const day = (mail.receivedAt ?? new Date().toISOString()).slice(0, 10);
      const storagePath = `${familyId}/documents/${documentId}-mail-${day}.txt`;
      const upload = await admin.storage.from('documents').upload(storagePath, new Blob([body], { type: 'text/plain' }), { contentType: 'text/plain', upsert: false });
      if (upload.error) throw new Error(`Mail konnte nicht abgelegt werden: ${upload.error.message}`);
      const document = await admin.from('documents').insert({
        id: documentId,
        family_id: familyId,
        stay_id: match.stayId,
        booking_id: match.bookingId,
        title: `E-Mail: ${mail.subject}`.slice(0, 200),
        storage_path: storagePath,
        original_name: `mail-${day}.txt`,
        mime_type: 'text/plain',
        size_bytes: Buffer.byteLength(body),
        classification: 'correspondence',
        access_level: 'adult',
        source_type: 'imported_document',
      });
      if (document.error) throw new Error(`Mail-Dokument konnte nicht angelegt werden: ${document.error.message}`);
      const suggestions: MailSuggestion[] = facts.suggestions.map((s) => ({ ...s, id: randomUUID(), status: 'pending' as const }));
      const ingest = await admin.from('mail_ingest').insert({
        family_id: familyId,
        message_id: mail.messageId,
        imap_uid: mail.uid,
        from_address: mail.from.slice(0, 300),
        subject: mail.subject.slice(0, 300),
        received_at: mail.receivedAt,
        document_id: documentId,
        stay_id: match.stayId,
        booking_id: match.bookingId,
        match_reason: match.reason,
        summary: facts.summary,
        suggestions,
        extracted_by: by,
      });
      if (ingest.error) throw new Error(`Mail-Eintrag konnte nicht angelegt werden: ${ingest.error.message}`);
      summary.stored += 1;
      if (match.stayId || match.bookingId) summary.assigned += 1;
      if (suggestions.length > 0) summary.withSuggestions += 1;
    }
    await admin.from('mail_sync_state').upsert({
      family_id: familyId,
      uid_validity: result.uidValidity,
      last_uid: result.lastUid,
      last_run_at: new Date().toISOString(),
      last_error: null,
      fetched_total: Number(state?.fetched_total ?? 0) + summary.stored,
    });
    deps.log?.('mailbox sync done', { ...summary });
    return summary;
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'unbekannter Fehler';
    await admin.from('mail_sync_state').upsert({ family_id: familyId, last_run_at: new Date().toISOString(), last_error: message, last_uid: Number(state?.last_uid ?? 0), uid_validity: state?.uid_validity ?? null, fetched_total: Number(state?.fetched_total ?? 0) });
    throw error;
  }
}
