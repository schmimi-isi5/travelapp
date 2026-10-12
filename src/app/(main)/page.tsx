'use client';

import { FileWarning } from 'lucide-react';
import Link from 'next/link';
import { useApp } from '@/components/app-provider';
import { DestinationHero } from '@/components/destination-image';
import { Scene, sceneNameFromPath } from '@/components/scene';
import { Badge, Card } from '@/components/ui';
import { FamilyCard, ImpressionsStrip, impressionsFor, NextStopCard, QuickActions, RoutePreviewCard, TaskSummary } from '@/features/dashboard/dashboard-sections';
import { useDestinationLibrary } from '@/features/media/use-destination-library';
import { StationTipsSummary } from '@/features/tips/station-recommendations';
import { sceneForStop } from '@/features/trip/stop-card';
import { useTable } from '@/lib/db/hooks';
import { isAdult } from '@/lib/domain/policy';
import { buildDayBriefing } from '@/lib/domain/trip-day';
import { formatDate } from '@/lib/formatting';
import { imagesForStop } from '@/lib/media/places';

export default function DashboardPage() {
  const { today, role, hasDemoDateOverride, members } = useApp();
  const stops = useTable('trip_stops').rows;
  const items = useTable('action_items').rows;
  const media = useTable('media_assets').rows;
  const stays = useTable('stays').rows;
  const bookings = useTable('bookings').rows;
  const documents = useTable('documents').rows;
  const routes = useTable('routes').rows;
  const trips = useTable('trips').rows;
  const trip = trips[0];

  const briefing = buildDayBriefing(stops, items, today);
  const featured = briefing.featuredStop;
  const latestMedia = [...media].sort((a, b) => (b.captured_at ?? '').localeCompare(a.captured_at ?? '')).slice(0, 4);
  const adult = isAdult(role);
  // The hero photo follows the current or next station; a station without a library photo (e.g. the departure airport)
  // hands over to the next one that has a photo, so the first screen is never an illustration when real photos exist.
  const library = useDestinationLibrary();
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  // Tips follow the current station, or before departure the first station in the travel region (not the airport).
  const tipsStop = briefing.currentStop ?? ordered.slice(Math.max(0, featured ? ordered.findIndex((s) => s.id === featured.id) : 0)).find((s) => s.country === 'Namibia' || s.country === 'Botswana') ?? featured;
  const heroStop = ordered.slice(Math.max(0, featured ? ordered.findIndex((s) => s.id === featured.id) : 0)).find((s) => imagesForStop(s, library).hero) ?? featured;

  const upcoming = ordered.slice(Math.max(0, featured ? ordered.findIndex((s) => s.id === featured.id) : 0));
  const impressions = impressionsFor(upcoming, library);

  const unclearBookings = bookings.filter((b) => b.booking_status === 'unknown').length + stays.filter((s) => s.booking_status === 'unknown').length;
  const docsFor = new Set(documents.flatMap((d) => [d.stay_id, d.booking_id].filter(Boolean)));
  const withoutReceipt = [...stays.filter((s) => s.booking_status !== 'cancelled').map((s) => s.id), ...bookings.filter((b) => b.booking_status !== 'cancelled').map((b) => b.id)].filter((id) => !docsFor.has(id)).length;

  const heading =
    briefing.phase === 'before'
      ? `Abreise in ${briefing.daysUntilStart} ${briefing.daysUntilStart === 1 ? 'Tag' : 'Tagen'}`
      : briefing.phase === 'during'
        ? briefing.currentStop?.title ?? 'Unterwegs'
        : briefing.phase === 'after'
          ? 'Reise abgeschlossen'
          : 'Reisetermine fehlen';

  return (
    <div className="mx-auto max-w-content space-y-8">
      <section aria-labelledby="hero-title" className="overflow-hidden rounded-xl text-white shadow-card">
        <DestinationHero stop={heroStop} fallback={featured ? sceneForStop(featured) : 'savanna'}>
        <div className="flex flex-col gap-3 p-6 pb-3 pt-24 md:p-10 md:pb-4">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-gold-200">Dein nächster Reisetag</span>
          <h1 id="hero-title" className="max-w-2xl !text-white text-3xl font-bold md:text-5xl">
            {heading}
          </h1>
          {featured && (
            <p className="max-w-xl text-white/90" data-testid="featured-stop">
              {briefing.phase === 'during' ? 'Heute: ' : 'Nächste Station: '}
              <strong>{featured.title}</strong> ({featured.country}) · {formatDate(featured.arrive_at)}
              {featured.is_demo && ' · Beispieldaten'}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href={featured ? `/route/${featured.id}` : '/route'} className="inline-flex min-h-11 items-center rounded-full bg-gold px-6 font-bold text-deep hover:bg-sand">
              Tagesbriefing öffnen
            </Link>
            <Link href="/route" className="inline-flex min-h-11 items-center rounded-full border border-white/60 px-6 font-semibold hover:bg-white/10">
              Route ansehen
            </Link>
          </div>
          {hasDemoDateOverride && <Badge tone="demo" className="w-fit">Demo-Datum: {formatDate(today)}</Badge>}
        </div>
        </DestinationHero>
      </section>

      <section aria-label="Eckdaten" className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs font-bold uppercase text-muted">Abreise laut Planung</p>
          <p className="mt-1 text-xl font-bold text-deep">{formatDate(trip?.start_date)}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase text-muted">Reiseziele</p>
          <p className="mt-1 text-xl font-bold text-deep">{trip?.countries.join(' & ') || 'unbekannt'}</p>
        </Card>
        <Card>
          <p className="text-xs font-bold uppercase text-muted">Buchungsstatus</p>
          <p className="mt-1 text-xl font-bold text-deep" data-testid="booking-check">{unclearBookings > 0 ? `${unclearBookings} zu prüfen` : 'alle geklärt'}</p>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        {featured && <div className="lg:col-span-5"><NextStopCard stop={featured} stays={stays.filter((s) => s.stop_id === featured.id)} /></div>}
        <div className="lg:col-span-4"><RoutePreviewCard stops={ordered} routes={routes} selectedId={featured?.id} /></div>
        <div className="space-y-6 lg:col-span-3">
          {tipsStop && <StationTipsSummary stop={tipsStop} stays={stays.filter((s) => s.stop_id === tipsStop.id)} />}
        </div>
      </div>

      <ImpressionsStrip impressions={impressions} />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><TaskSummary items={briefing.openItems} /></div>
        <div className="space-y-6">
          {adult && (
            <Card>
              <h2 className="mb-2 flex items-center gap-2 text-lg font-bold"><FileWarning size={18} aria-hidden /> Fehlende Belege</h2>
              <p className="text-slate" data-testid="missing-receipts">
                {withoutReceipt} Unterkünfte/Buchungen ohne hinterlegten Beleg.
              </p>
              <Link href="/stays" className="mt-2 inline-block font-semibold text-deep underline">Unterkünfte prüfen</Link>
            </Card>
          )}
          <FamilyCard members={members} />
        </div>
      </div>

      <QuickActions role={role} />

      <section aria-labelledby="media-title">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="media-title" className="text-xl font-bold">Letzte Erinnerungen</h2>
          <Link href="/gallery" className="font-semibold text-deep underline">Galerie</Link>
        </div>
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {latestMedia.map((m) => {
            const scene = sceneNameFromPath(m.storage_path);
            return (
              <li key={m.id} className="aspect-[4/3] overflow-hidden rounded-lg border border-line">
                {scene ? <Scene name={scene} label={m.caption || 'Illustration'} /> : <div className="grid h-full place-items-center bg-sand text-sm">{m.kind}</div>}
              </li>
            );
          })}
          {latestMedia.length === 0 && <li className="col-span-full text-slate">Noch keine Medien.</li>}
        </ul>
      </section>
    </div>
  );
}
