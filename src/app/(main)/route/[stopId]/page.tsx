'use client';

import { ArrowLeft, BedDouble, Phone, Plane } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { useApp } from '@/components/app-provider';
import { Scene } from '@/components/scene';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { ActionChecklist } from '@/features/common/action-checklist';
import { TipCard } from '@/features/ai/tip-card';
import { sceneForStop } from '@/features/trip/stop-card';
import { useTable, useTips } from '@/lib/db/hooks';
import { buildDayBriefing } from '@/lib/domain/trip-day';
import { formatDate, formatDuration } from '@/lib/formatting';

export default function StopDetailPage({ params }: { params: Promise<{ stopId: string }> }) {
  const { stopId } = use(params);
  const { today } = useApp();
  const stops = useTable('trip_stops').rows;
  const routes = useTable('routes').rows;
  const stays = useTable('stays').rows;
  const bookings = useTable('bookings').rows;
  const items = useTable('action_items').rows;
  const tips = useTips().rows;
  const contacts = useTable('emergency_contacts').rows;
  const stop = stops.find((s) => s.id === stopId);

  if (!stop) {
    return (
      <EmptyState icon={<ArrowLeft />} title="Station nicht gefunden" text="Diese Station existiert nicht (mehr)." action={<Link className="font-semibold text-deep underline" href="/route">Zur Route</Link>} />
    );
  }
  const incoming = routes.find((r) => r.to_stop_id === stop.id);
  const from = stops.find((s) => s.id === incoming?.from_stop_id);
  const briefing = buildDayBriefing(stops, items, today);
  const isToday = briefing.currentStop?.id === stop.id;
  const stopItems = items.filter((i) => i.stop_id === stop.id);
  const stopTips = tips.filter((t) => t.stop_id === stop.id);
  const activities = bookings.filter((b) => b.stop_id === stop.id);
  const stopStays = stays.filter((s) => s.stop_id === stop.id);
  const generalContacts = contacts.slice(0, 3);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/route" className="inline-flex items-center gap-1 font-semibold text-deep"><ArrowLeft size={16} aria-hidden /> Route</Link>
      <div className="h-48 overflow-hidden rounded-xl md:h-64"><Scene name={sceneForStop(stop)} label={`Illustration zu ${stop.title}`} /></div>
      <PageHeader title={stop.title} subtitle={`${stop.country} · ${stop.arrive_at ? `${formatDate(stop.arrive_at)} bis ${formatDate(stop.depart_at)}` : 'Datum unbekannt'}`} />
      <div className="flex flex-wrap gap-2">
        {isToday && <Badge tone="ok">Heute hier</Badge>}
        {stop.is_demo && <Badge tone="demo">Beispielstation, nicht verifiziert</Badge>}
        {!stop.verified_at && <Badge tone="warn">Angaben nicht geprüft</Badge>}
      </div>
      {stop.summary && <p className="max-w-3xl text-slate">{stop.summary}</p>}

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-bold">Tagesbriefing</h2>
          <ul className="space-y-1 text-[15px] text-slate">
            <li>Station {stop.sequence} von {stops.length}</li>
            <li>Offene Aufgaben hier: {stopItems.filter((i) => i.status !== 'done').length}</li>
            <li>Geplante Aktivitäten: {activities.length || 'keine erfasst'}</li>
            <li>Unterkunft: {stopStays.map((s) => s.name).join(', ') || 'keine erfasst'}</li>
            <li>Wetter: nicht verfügbar (kein Dienst verbunden)</li>
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-bold">Fahrtstrecke</h2>
          {incoming && from ? (
            <p className="text-slate">
              Von <strong>{from.title}</strong>: ca. {incoming.distance_km ?? '?'} km, ca. {formatDuration(incoming.duration_minutes)}.{' '}
              <span className="text-muted">{incoming.duration_source === 'offline_estimate' ? 'Grobe Offline-Schätzung aus Luftlinie, keine Verkehrs- oder Navigationsdaten. Schotterpisten und Grenzen können deutlich länger dauern.' : 'Quelle: ' + incoming.duration_source}</span>
            </p>
          ) : (
            <p className="text-slate">Keine Fahrtstrecke erfasst (erste Station oder Quelle unbekannt).</p>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 text-lg font-bold">Checkliste</h2>
        <ActionChecklist items={stopItems} scope={{ stop_id: stop.id }} label={`Checkliste ${stop.title}`} />
      </Card>

      <section aria-labelledby="sights">
        <h2 id="sights" className="mb-3 text-lg font-bold">Sehenswürdigkeiten &amp; Hinweise</h2>
        {stop.highlights.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2" aria-label="Highlights">
            {stop.highlights.map((h) => <li key={h}><Badge>{h}</Badge></li>)}
          </ul>
        )}
        <p className="mb-3 text-sm text-muted">Highlights sind Beispielangaben ohne Quelle. Öffnungszeiten und Regeln vor Ort prüfen.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {stopTips.length === 0 ? <p className="text-slate">Keine Hinweise für diese Station.</p> : stopTips.map((t) => <TipCard key={t.id} tip={t} />)}
        </div>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><BedDouble size={18} aria-hidden /> Unterkunft</h2>
          {stopStays.length === 0 ? <p className="text-slate">Keine Unterkunft erfasst.</p> : stopStays.map((s) => (
            <p key={s.id}><Link href="/stays" className="font-semibold text-deep underline">{s.name}</Link> · {formatDate(s.check_in)} – {formatDate(s.check_out)}</p>
          ))}
          <h3 className="mb-1 mt-4 flex items-center gap-2 font-bold"><Plane size={16} aria-hidden /> Geplante Aktivitäten &amp; Buchungen</h3>
          {activities.length === 0 ? <p className="text-slate">Keine erfasst.</p> : <ul className="list-disc pl-5">{activities.map((b) => <li key={b.id}>{b.title} <Badge>{b.booking_status}</Badge></li>)}</ul>}
        </Card>
        <Card>
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><Phone size={18} aria-hidden /> Kontakte</h2>
          <ul className="space-y-1">{generalContacts.map((c) => <li key={c.id}><strong>{c.name}</strong>: {c.phone || 'keine Nummer'}</li>)}</ul>
          <Link href="/safety" className="mt-2 inline-block font-semibold text-deep underline">Alle Notfallkontakte</Link>
        </Card>
      </div>
    </div>
  );
}
