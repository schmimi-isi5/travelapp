'use client';

import { Inbox as InboxIcon, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, EmptyState, Notice, PageHeader } from '@/components/ui';
import { loadInbox, syncMailbox, type Inbox } from '@/features/mailbox/client';
import { MailCard } from '@/features/mailbox/mail-card';
import { MailboxSetup } from '@/features/mailbox/setup';
import { useTable } from '@/lib/db/hooks';
import { isAdult } from '@/lib/domain/policy';
import { formatDateTime } from '@/lib/formatting';

export default function MailboxPage() {
  const { role, isSupabase } = useApp();
  const stays = useTable('stays').rows;
  const bookings = useTable('bookings').rows;
  const documents = useTable('documents').rows;
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const adult = isAdult(role);

  const reload = useCallback(async () => {
    try {
      setInbox(await loadInbox());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Das Postfach konnte nicht geladen werden.');
    }
  }, []);

  useEffect(() => {
    if (adult && isSupabase) void reload();
  }, [adult, isSupabase, reload]);

  async function fetchMails() {
    setIsBusy(true);
    setNote(null);
    setError(null);
    try {
      const result = await syncMailbox();
      setNote(result.stored === 0 ? 'Keine neuen Mails.' : `${result.stored} neue ${result.stored === 1 ? 'Mail' : 'Mails'}, ${result.assigned} davon zugeordnet, ${result.withSuggestions} mit Vorschlägen.${result.aiUsed ? '' : ' (Ohne KI, nur nach festen Mustern gelesen.)'}`);
      await reload();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Der Abruf hat nicht geklappt.');
    } finally {
      setIsBusy(false);
    }
  }

  if (!adult) return <Notice tone="info">Das Postfach ist nur für Erwachsene sichtbar.</Notice>;
  if (!isSupabase) return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Postfach" subtitle="Mails von Unterkünften und Anbietern, automatisch abgelegt." />
      <Notice tone="info">Das Postfach gibt es nur in der Live-Version, nicht im Demo-Modus.</Notice>
    </div>
  );

  const open = inbox?.mails.filter((m) => m.suggestions.some((s) => s.status === 'pending')) ?? [];
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title="Postfach"
        subtitle="Mails von Unterkünften und Anbietern: abgelegt an der passenden Unterkunft oder Buchung. Zahlungen, Fristen und Nummern trägst Du mit einem Klick ein."
        actions={<Button onClick={() => void fetchMails()} disabled={isBusy || inbox?.mailbox.state === 'not_configured'}><RefreshCw size={16} aria-hidden /> {isBusy ? 'Wird abgerufen …' : 'Postfach abrufen'}</Button>}
      />
      {inbox && <MailboxSetup origin={inbox.mailbox.origin} onChanged={() => void reload()} />}
      {inbox?.mailbox.state === 'ready' && (
        <p className="text-sm text-slate" data-testid="mailbox-status">
          {inbox.mailbox.address ?? 'Postfach'} · nur Lesen · {inbox.state?.last_run_at ? `zuletzt abgerufen ${formatDateTime(inbox.state.last_run_at)}` : 'noch nie abgerufen'}
          {open.length > 0 && ` · ${open.length} ${open.length === 1 ? 'Mail' : 'Mails'} mit offenen Vorschlägen`}
        </p>
      )}
      {inbox?.state?.last_error && <Notice tone="warn" title="Letzter Abruf fehlgeschlagen">{inbox.state.last_error}</Notice>}
      {note && <Notice tone="info"><span data-testid="mailbox-note">{note}</span></Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      {inbox && inbox.mails.length === 0 && inbox.mailbox.state === 'ready' && <EmptyState icon={<InboxIcon />} title="Noch keine Mails" text="Mit „Postfach abrufen“ holt die App neue Mails und legt sie ab." />}
      <div className="space-y-4">
        {inbox?.mails.map((mail) => <MailCard key={mail.id} mail={mail} stays={stays} bookings={bookings} documents={documents} onChanged={() => void reload()} />)}
      </div>
      <p className="text-xs text-muted">Die App liest das Postfach nur und verändert nichts darin. Anhänge werden nicht gespeichert. Vorschläge stammen aus festen Mustern und, wenn freigegeben, aus der KI-Auswertung des Mailtextes; übernommene Zahlungen gelten erst nach Deiner Prüfung als verifiziert.</p>
    </div>
  );
}
