'use client';

import { ArrowLeft, BedDouble, Phone, Plane } from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';
import { useApp } from '@/components/app-provider';
import { DestinationHero, ResponsiveTravelImage } from '@/components/destination-image';
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { STATUS_LABEL } from '@/features/bookings/booking-form';
import { ActionChecklist } from '@/features/common/action-checklist';
import { TipCard } from '@/features/ai/tip-card';
import { StationRecommendations } from '@/features/tips/station-recommendations';
import { DayBriefingCard } from '@/features/trip/day-briefing';
import { useStopImages } from '@/features/media/use-destination-library';
import { sceneForStop } from '@/features/trip/stop-card';
import { useTable, useTips } from '@/lib/db/hooks';
import { buildDayBriefing } from '@/lib/domain/trip-day';
import { formatDate } from '@/lib/formatting';
import { driveSummary, durationSourceLabel } from '@/lib/labels';

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
  const photos = useStopImages(stop);

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
      <Link href="/route" className="inline-flex items-center gap-1 font-semibold text-deep"><ArrowLeft size={16} aria-hidden /> Reiseplan</Link>
      <DestinationHero stop={stop} fallback={sceneForStop(stop)} className="rounded-xl" minHeight="h-56 md:h-80" />
      <PageHeader title={stop.title} subtitle={`${stop.country} · ${stop.arrive_at ? `${formatDate(stop.arrive_at)} bis ${formatDate(stop.depart_at)}` : 'Datum unbekannt'}`} />
      <div className="flex flex-wrap gap-2">
        {isToday && <Badge tone="ok">Heute hier</Badge>}
        {stop.is_demo && <Badge tone="demo">Beispielstation, nicht verifiziert</Badge>}
        {!stop.verified_at && <Badge tone="warn">Angaben nicht geprüft</Badge>}
      </div>
      {stop.summary && <p className="max-w-3xl text-slate">{stop.summary}</p>}

      {photos.gallery.length > 0 && (
        <section aria-label="Bilder der Region" data-testid="stop-gallery">
          <h2 className="mb-3 text-lg font-bold">Bilder aus {stop.title.split('/').pop()?.trim()}</h2>
          {photos.gallery.some((image) => !image.location_verified) && <p className="mb-3 text-sm text-slate">Einige Bilder sind Regionsmotive: Landschaft und Tiere der Gegend, nicht zwingend genau dieser Ort.</p>}
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {photos.gallery.map((image) => (
              <li key={image.id}>
                <figure>
                  <div className="aspect-[4/3] overflow-hidden rounded-lg border border-line bg-sand"><ResponsiveTravelImage image={image} kind="gallery" sizes="(min-width: 768px) 33vw, 50vw" /></div>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      )}

      <StationRecommendations stop={stop} stays={stopStays} />

      <div className="grid gap-6 md:grid-cols-2">
        <DayBriefingCard stop={stop} stopCount={stops.length} previous={from ?? null} leg={incoming} stays={stopStays} bookings={activities} items={stopItems} />
        <Card>
          <h2 className="mb-2 text-lg font-bold">Fahrtstrecke</h2>
          {incoming && from && driveSummary(incoming.distance_km, incoming.duration_minutes) ? (
            <p className="text-slate">
              Von <strong>{from.title}</strong>: {driveSummary(incoming.distance_km, incoming.duration_minutes)}{' '}
              <span className="text-muted">{incoming.duration_source === 'offline_estimate' ? 'Grobe Offline-Schätzung aus Luftlinie, keine Verkehrs- oder Navigationsdaten. Schotterpisten und Grenzen können deutlich länger dauern.' : (durationSourceLabel[incoming.duration_source] ?? '')}</span>
            </p>
          ) : (
            <p className="text-slate">Keine Fahrtstrecke erfasst.</p>
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
          {activities.length === 0 ? <p className="text-slate">Keine erfasst.</p> : <ul className="list-disc pl-5">{activities.map((b) => <li key={b.id}>{b.title} <Badge>{STATUS_LABEL[b.booking_status] ?? b.booking_status}</Badge></li>)}</ul>}
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
