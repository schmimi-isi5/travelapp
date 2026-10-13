'use client';

import Link from 'next/link';
import { useApp } from '@/components/app-provider';
import { Scene, sceneNameFromPath } from '@/components/scene';
import { Badge } from '@/components/ui';
import { FamilyCard, ImpressionsCard, impressionsFor, NextStopCard, QuickActions, quickTiles, RoutePreviewCard, TasksCard } from '@/features/dashboard/dashboard-sections';
import { TravelHero } from '@/features/dashboard/travel-hero';
import { canSeeEntry } from '@/features/journal/visibility';
import { useDestinationLibrary } from '@/features/media/use-destination-library';
import { WeatherTile } from '@/features/tips/weather-tile';
import { useTable } from '@/lib/db/hooks';
import { update } from '@/lib/db/repo';
import type { ActionItem } from '@/lib/domain/schemas';
import { buildDayBriefing } from '@/lib/domain/trip-day';
import { checkTripPlan } from '@/lib/domain/trip-check';
import { formatDate } from '@/lib/formatting';
import { imagesForStop, isScenicMotif } from '@/lib/media/places';

const DESERT_PLACE = 'sossusvlei';

export default function DashboardPage() {
  const { today, role, hasDemoDateOverride, members, currentUser } = useApp();
  const stops = useTable('trip_stops').rows;
  const items = useTable('action_items').rows;
  const media = useTable('media_assets').rows;
  const stays = useTable('stays').rows;
  const bookings = useTable('bookings').rows;
  const documents = useTable('documents').rows;
  const routes = useTable('routes').rows;
  const journal = useTable('journal_entries').rows;
  const sightings = useTable('wildlife_sightings').rows;
  const trips = useTable('trips').rows;
  const trip = trips[0];
  const library = useDestinationLibrary();

  const briefing = buildDayBriefing(stops, items, today);
  const featured = briefing.featuredStop;
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  const featuredIndex = featured ? ordered.findIndex((s) => s.id === featured.id) : -1;
  const previous = featuredIndex > 0 ? (ordered[featuredIndex - 1] ?? null) : null;
  const leg = featured && previous ? routes.find((r) => r.from_stop_id === previous.id && r.to_stop_id === featured.id) : undefined;
  const fromFeatured = ordered.slice(Math.max(0, featuredIndex));
  // Tips and weather follow the current station, or before departure the first station in the travel region (not the airport).
  const tipsStop = briefing.currentStop ?? fromFeatured.find((s) => s.country === 'Namibia' || s.country === 'Botswana') ?? featured;
  // The hero is a desert motif from the library; without one, the next station's own hero photo, else the illustration.
  const desertHero = library.find((i) => i.place_key === DESERT_PLACE && i.role === 'hero' && isScenicMotif(i));
  const featuredHero = fromFeatured.map((s) => imagesForStop(s, library).hero).find(Boolean) ?? null;
  const heroImage = desertHero ?? featuredHero;
  const me = currentUser?.id ?? '';

  const unclearBookings = bookings.filter((b) => b.booking_status === 'unknown').length + stays.filter((s) => s.booking_status === 'unknown').length;
  const docsFor = new Set(documents.filter((d) => d.classification !== 'correspondence').flatMap((d) => [d.stay_id, d.booking_id].filter(Boolean)));
  const withoutReceipt = [...stays.filter((s) => s.booking_status !== 'cancelled').map((s) => s.id), ...bookings.filter((b) => b.booking_status !== 'cancelled').map((b) => b.id)].filter((id) => !docsFor.has(id)).length;
  const impressions = impressionsFor(library, stops);
  const planFindings = checkTripPlan({ stops, routes, stays, bookings, today }).length;
  const latestMedia = [...media].sort((a, b) => (b.captured_at ?? '').localeCompare(a.captured_at ?? '')).slice(0, 4);
  const toggleTask = (item: ActionItem) => void update('action_items', item.id, { status: item.status === 'done' ? 'open' : 'done' });

  return (
    <div className="space-y-6">
      <TravelHero image={heroImage} briefing={briefing} trip={trip} today={today} featured={featured} />

      <div className="mx-auto max-w-content space-y-6">
        {hasDemoDateOverride && <Badge tone="demo" className="w-fit">Demo-Datum: {formatDate(today)}</Badge>}

        <div className="grid gap-6 lg:grid-cols-[5fr_5fr_3fr]">
          {featured && <NextStopCard stop={featured} previous={previous} leg={leg} stays={stays.filter((s) => s.stop_id === featured.id)} bookings={bookings} trip={trip} />}
          <RoutePreviewCard stops={ordered} library={library} currentStopId={briefing.currentStop?.id ?? null} />
          {tipsStop && <WeatherTile stop={tipsStop} stays={stays.filter((s) => s.stop_id === tipsStop.id)} today={today} />}
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {impressions.length > 0 && <div className="lg:col-span-2"><ImpressionsCard impressions={impressions} /></div>}
          <div className={impressions.length > 0 ? '' : 'lg:col-span-3'}>
            <TasksCard items={briefing.openItems} members={members} today={today} role={role} withoutReceipt={withoutReceipt} unclearBookings={unclearBookings} planFindings={planFindings} onToggle={toggleTask} />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <FamilyCard members={members} />
          <div className="lg:col-span-2">
            <QuickActions tiles={quickTiles({ stays: stays.length, bookings: bookings.length, journal: journal.filter((e) => canSeeEntry(e, me)).length, sightings: sightings.length, documents: documents.length }, role)} />
          </div>
        </div>

        {latestMedia.length > 0 && (
          <section aria-labelledby="media-title">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="media-title" className="font-display text-xl font-bold md:text-2xl">Letzte Erinnerungen</h2>
              <Link href="/gallery" className="inline-flex min-h-11 items-center text-sm font-semibold text-deep underline">Zur Galerie</Link>
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
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
