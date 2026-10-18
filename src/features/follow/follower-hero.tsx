'use client';

import { BookOpen, Camera, MapPin, PawPrint, Route as RouteIcon } from 'lucide-react';
import { Scene } from '@/components/scene';
import { imageUrl, VARIANT_WIDTH } from '@/lib/media/places';
import type { FollowerView } from '@/lib/follow/view';
import { photoUrl } from './photo-url';
import type { DemoAssets } from './follower-photo';

function statusLine(view: FollowerView, place: string | null): string {
  const { status, day, totalDays, daysUntilStart } = view.trip;
  if (status === 'upcoming') return daysUntilStart === null ? 'Die Reise hat noch nicht begonnen.' : daysUntilStart === 0 ? 'Heute geht es los!' : `Noch ${daysUntilStart} ${daysUntilStart === 1 ? 'Tag' : 'Tage'} bis zur Abreise.`;
  if (status === 'finished') return 'Unsere Reise ist zu Ende. Hier ist alles, was wir erlebt haben.';
  const dayText = day !== null ? `Tag ${day}${totalDays ? ` von ${totalDays}` : ''}` : 'Wir sind unterwegs';
  return place ? `${dayText} · gerade in ${place}` : dayText;
}

const variantSrcSet = (paths: NonNullable<FollowerView['stops'][number]['image']>['variantPaths']) =>
  (['mobile', 'tablet', 'desktop'] as const).flatMap((key) => (paths[key] ? [`${imageUrl(paths[key]!)} ${VARIANT_WIDTH[key]}w`] : [])).join(', ');

/** The top of the page: a big picture of where we are (place photo, else our latest photo, else an illustration), the title and where the trip stands. */
export function FollowerHero({ view, token, demoAssets, newCount }: { view: FollowerView; token: string; demoAssets: DemoAssets; newCount: number }) {
  const current = view.stops.find((s) => s.id === view.currentStopId) ?? view.stops[view.stops.length - 1] ?? null;
  const placeImage = current?.image ?? null;
  const latest = view.photos[0];
  const useLatest = !placeImage && latest && !demoAssets?.has(latest.id);
  const stats = [
    { icon: RouteIcon, value: view.stops.length, label: view.stops.length === 1 ? 'Station' : 'Stationen' },
    { icon: Camera, value: view.photos.length, label: view.photos.length === 1 ? 'Foto' : 'Fotos' },
    { icon: BookOpen, value: view.entries.length, label: view.entries.length === 1 ? 'Bericht' : 'Berichte' },
    { icon: PawPrint, value: view.sightings.length, label: view.sightings.length === 1 ? 'Tier' : 'Tiere' },
  ].filter((s) => s.value > 0);

  return (
    <header className="relative isolate overflow-hidden bg-teal-950 text-white">
      <div className="absolute inset-0 -z-10" aria-hidden>
        {placeImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl(placeImage.variantPaths.tablet ?? placeImage.path)} srcSet={variantSrcSet(placeImage.variantPaths) || undefined} sizes="100vw" alt="" fetchPriority="high" className="size-full object-cover" />
        ) : useLatest ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl(token, latest.id, 1600)} alt="" fetchPriority="high" className="size-full object-cover" />
        ) : (
          <Scene name="savanna" label="" className="size-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-teal-950 via-teal-950/55 to-teal-950/20" />
      </div>
      <div className="relative mx-auto flex min-h-[26rem] max-w-4xl flex-col justify-end px-4 pb-14 pt-[max(2rem,env(safe-area-inset-top))] sm:min-h-[30rem] md:pb-16">
        {placeImage?.isRegionMotif && <p className="absolute right-4 top-4 rounded-full bg-black/30 px-2.5 py-1 text-xs font-medium text-white" title="Landschaft der Gegend, nicht genau dieser Ort">Regionsmotiv</p>}
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-200 sm:text-sm">Unsere Reise. Unsere Geschichte.</p>
        <h1 className="mt-2 text-4xl font-semibold leading-[1.05] text-balance text-white! sm:text-5xl md:text-6xl">{view.trip.title}</h1>
        {view.trip.countries.length > 0 && <p className="mt-2 text-base text-white/85 sm:text-lg">{view.trip.countries.join(' · ')}</p>}
        <p className="mt-4 flex items-start gap-2 text-lg font-semibold sm:text-xl" data-testid="follower-status">
          {view.trip.status === 'ongoing' && <MapPin aria-hidden className="mt-1 size-5 shrink-0 text-gold-200" />}
          <span>{statusLine(view, current?.title ?? null)}</span>
        </p>
        {stats.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Überblick">
            {stats.map(({ icon: Icon, value, label }) => (
              <li key={label} className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-2 text-sm font-semibold backdrop-blur"><Icon size={16} aria-hidden /> {value} {label}</li>
            ))}
            {newCount > 0 && <li className="inline-flex items-center rounded-full bg-clay-strong px-3.5 py-2 text-sm font-bold" data-testid="follower-new">{newCount} neu seit deinem letzten Besuch</li>}
          </ul>
        )}
      </div>
    </header>
  );
}
