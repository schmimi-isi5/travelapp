'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Badge, Button, Card, EmptyState, Notice, PageHeader } from '@/components/ui';
import { getLocalDb } from '@/lib/db/local';
import { OFFLINE_QUEUE_LIMIT_BYTES, queuedBytes } from '@/lib/db/media';
import { formatBytes, formatDateTime } from '@/lib/formatting';
import { simulateOtherDeviceEdit } from '@/lib/offline/remote-demo';
import { resolveConflict } from '@/lib/offline/sync';
import { useTable } from '@/lib/db/hooks';

const ENTITY_LABEL: Record<string, string> = { stays: 'Unterkunft', bookings: 'Buchung', payments: 'Zahlung', action_items: 'Aufgabe', journal_entries: 'Tagebuch', media_assets: 'Medium', trip_stops: 'Station', expenses: 'Ausgabe', wildlife_sightings: 'Sichtung' };

function describe(value: Record<string, unknown> | null): string {
  if (!value) return 'gelöscht / nicht vorhanden';
  const keys = ['title', 'name', 'booking_status', 'status', 'price_minor', 'currency', 'notes'] as const;
  return keys.filter((k) => value[k] !== undefined && value[k] !== null && value[k] !== '').map((k) => `${k}: ${String(value[k])}`).join(' · ') || 'keine Details';
}

export default function OfflinePage() {
  const { online, simulatedOffline, setOffline, sync, syncing, lastSync, pendingCount, mode, remote, isSupabase } = useApp();
  const bookings = useTable('bookings').rows;
  const mutations = useLiveQuery(() => getLocalDb().sync_mutations.orderBy('created_at').reverse().limit(30).toArray(), [], []) ?? [];
  const conflicts = useLiveQuery(() => getLocalDb().sync_conflicts.filter((c) => !c.resolved_at).toArray(), [], []) ?? [];
  const queued = useLiveQuery(() => queuedBytes(), [mutations.length], 0) ?? 0;
  const [info, setInfo] = useState<string | null>(null);

  async function otherDevice() {
    const target = bookings[0];
    if (!target) return setInfo('Keine Buchung für die Konfliktdemo vorhanden.');
    await simulateOtherDeviceEdit('bookings', target.id, { notes: 'Geändert auf Gerät B (Demo)' });
    setInfo(`„${target.title}“ wurde auf einem simulierten zweiten Gerät geändert. Ändere dieselbe Buchung hier offline und synchronisiere dann.`);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Offline & Sync" subtitle="Alle Änderungen werden zuerst lokal gespeichert und später idempotent synchronisiert. Konflikte werden nie still überschrieben." />
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={online ? 'ok' : 'warn'} data-testid="net-state">{online ? 'Online' : simulatedOffline ? 'Offline (simuliert)' : 'Offline'}</Badge>
          <Badge tone={pendingCount > 0 ? 'warn' : 'ok'} data-testid="pending-count">{pendingCount} in Warteschlange</Badge>
          <Badge>Server: {remote.name}</Badge>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant={simulatedOffline ? 'sunset' : 'secondary'} aria-pressed={simulatedOffline} onClick={() => setOffline(!simulatedOffline)} data-testid="toggle-offline"><WifiOff size={16} aria-hidden /> {simulatedOffline ? 'Offline-Simulation beenden' : 'Offline simulieren'}</Button>
            <Button onClick={() => void sync()} disabled={!online || syncing}><RefreshCw size={16} aria-hidden className={syncing ? 'animate-spin' : ''} /> Jetzt synchronisieren</Button>
          </div>
        </div>
        {lastSync && <p className="mt-3 text-sm text-slate" data-testid="last-sync">Letzter Lauf: {lastSync.skipped ? `übersprungen (${lastSync.skipped})` : `${lastSync.pushed} gesendet, ${lastSync.pulled} empfangen, ${lastSync.conflicts} Konflikte, ${lastSync.uploaded} Uploads, ${lastSync.failed} Fehler`}</p>}
        <p className="mt-2 text-sm text-slate">Offline-Upload-Warteschlange: {formatBytes(queued)} von {formatBytes(OFFLINE_QUEUE_LIMIT_BYTES)}.</p>
        {mode.effective === 'demo' && <p className="mt-2 text-xs text-muted">Demo-Modus: der „Server“ ist eine lokale IndexedDB-Simulation mit echten Versionsprüfungen.</p>}
        {lastSync && lastSync.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-danger" data-testid="sync-errors">{lastSync.errors.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>}
      </Card>

      <section aria-labelledby="conf-h">
        <h2 id="conf-h" className="mb-3 text-lg font-bold">Konflikte</h2>
        {conflicts.length === 0 ? <EmptyState icon={<RefreshCw />} title="Keine Konflikte" text="Alle Änderungen sind abgeglichen." /> : (
          <ul className="space-y-3">
            {conflicts.map((c) => (
              <li key={c.id} className="rounded-lg border-2 border-danger/50 bg-white p-4" data-testid="conflict">
                <p className="font-bold">{ENTITY_LABEL[c.entity_type] ?? c.entity_type}: {c.reason ? 'Änderung vom Server abgelehnt' : 'unterschiedliche Änderungen'}</p>
                {c.reason && <p className="mt-1 text-sm text-danger" data-testid="conflict-reason">{c.reason}</p>}
                <div className="mt-2 grid gap-3 sm:grid-cols-2 text-sm">
                  <div className="rounded-md bg-sand-50 p-3"><p className="font-bold">Dieses Gerät</p><p>{describe(c.local_value)}</p></div>
                  <div className="rounded-md bg-deep-50 p-3"><p className="font-bold">Server</p><p>{describe(c.remote_value)}</p></div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {!c.reason && <Button size="sm" onClick={() => void resolveConflict(c.id, 'keep_local').then(() => sync())}>Meine Änderung behalten</Button>}
                  <Button size="sm" variant="secondary" onClick={() => void resolveConflict(c.id, 'keep_remote')}>Serverstand übernehmen</Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="queue-h">
        <h2 id="queue-h" className="mb-3 text-lg font-bold">Letzte Änderungen</h2>
        <ul className="divide-y divide-line rounded-lg border border-line bg-white" data-testid="mutation-list">
          {mutations.length === 0 && <li className="p-4 text-sm text-muted">Noch keine Änderungen.</li>}
          {mutations.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <Badge tone={m.status === 'pending' ? 'warn' : m.status === 'conflict' ? 'danger' : m.status === 'failed' ? 'danger' : 'ok'}>{m.status === 'pending' ? 'ausstehend' : m.status === 'acknowledged' ? 'bestätigt' : m.status === 'conflict' ? 'Konflikt' : 'Fehler'}</Badge>
              <span>{ENTITY_LABEL[m.entity_type] ?? m.entity_type} · {m.operation === 'delete' ? 'gelöscht' : 'geändert'}</span>
              <span className="ml-auto text-muted">{formatDateTime(m.created_at)}</span>
              {m.error && <span className="w-full text-xs text-muted">{m.error}</span>}
            </li>
          ))}
        </ul>
      </section>

      {!isSupabase && (
        <Card>
          <h2 className="mb-2 text-lg font-bold">Konflikt-Demo</h2>
          <p className="text-sm text-slate">Simuliert ein zweites Gerät, das dieselbe Buchung verändert hat.</p>
          <Button className="mt-3" variant="secondary" onClick={() => void otherDevice()}>Zweites Gerät ändert Buchung</Button>
          {info && <div className="mt-3"><Notice tone="info">{info}</Notice></div>}
        </Card>
      )}
    </div>
  );
}
