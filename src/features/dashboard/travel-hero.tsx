'use client';

import { ArrowRight, MapPin, Plane } from 'lucide-react';
import Link from 'next/link';
import { ResponsiveTravelImage } from '@/components/destination-image';
import { Scene } from '@/components/scene';
import type { DayBriefing } from '@/lib/domain/trip-day';
import type { Trip, TripStop } from '@/lib/domain/schemas';
import { daysBetween, formatDate } from '@/lib/formatting';
import type { DestinationImage } from '@/lib/media/places';

const SHORT_DATE: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' };

/** "NAMIBIA & BOTSWANA · 13. Okt. – 04. Nov. 2026", all from the trip data. */
export function heroEyebrow(trip: Pick<Trip, 'countries' | 'start_date' | 'end_date'> | undefined): string {
  const countries = trip?.countries.length ? trip.countries.join(' & ') : 'Unsere Reise';
  const start = trip?.start_date ? formatDate(trip.start_date, SHORT_DATE) : null;
  const end = trip?.end_date ? formatDate(trip.end_date, { ...SHORT_DATE, year: 'numeric' }) : null;
  return [countries.toUpperCase(), start && end ? `${start} – ${end}` : start].filter(Boolean).join(' · ');
}

/** The status line under the claim, driven by the real trip phase: countdown, day x of y, or the closing words. */
export function PhaseLine({ briefing, trip, today }: { briefing: DayBriefing; trip: Pick<Trip, 'start_date' | 'end_date'> | undefined; today: string }) {
  if (briefing.phase === 'before' && briefing.daysUntilStart !== null) {
    const days = briefing.daysUntilStart;
    return <>Noch <span className="font-bold text-gold-200">{days}</span> {days === 1 ? 'Tag' : 'Tage'} bis zum Abflug.</>;
  }
  if (briefing.phase === 'during' && trip?.start_date && trip.end_date) {
    const total = daysBetween(trip.start_date, trip.end_date) + 1;
    return <>Tag <span className="font-bold text-gold-200">{daysBetween(trip.start_date, today) + 1}</span> von {total}{briefing.currentStop ? ` · heute ${briefing.currentStop.title.split('/').pop()?.trim()}` : ''}.</>;
  }
  if (briefing.phase === 'after') return <>Die Reise ist abgeschlossen. Danke für diese Geschichte.</>;
  return <>Die Reisetermine fehlen noch.</>;
}

/**
 * Dashboard hero: borderless desert photo flush with the content area (rounded at the bottom right), eyebrow with the trip dates,
 * the claim, the real countdown and the two actions. Without a library photo the illustration takes over.
 */
export function TravelHero({ image, briefing, trip, today, featured }: { image: DestinationImage | null; briefing: DayBriefing; trip: Trip | undefined; today: string; featured: TripStop | null }) {
  return (
    <section aria-labelledby="hero-title" className="relative -mx-4 -mt-6 flex min-h-[420px] flex-col overflow-hidden rounded-br-[3rem] bg-deep text-white md:-mx-8 md:min-h-[440px]" data-testid="destination-hero" data-image={image ? 'photo' : 'illustration'}>
      <div className="absolute inset-0">
        {image ? <ResponsiveTravelImage image={image} kind="hero" sizes="100vw" priority /> : <Scene name="dunes" label="" />}
      </div>
      <div className="absolute inset-0 bg-gradient-to-r from-deep/80 via-deep/35 to-transparent" aria-hidden />
      <div className="absolute inset-0 bg-gradient-to-t from-deep/60 via-transparent to-transparent" aria-hidden />

      <p className="absolute right-6 top-6 hidden max-w-60 -rotate-3 text-right font-script text-3xl leading-tight text-white md:block lg:right-10 lg:top-8" aria-hidden>
        „Nicht nur ein Ort, sondern ein Gefühl.“
        <span className="mt-1 ml-auto block h-0.5 w-24 rounded bg-gold-200/90" />
      </p>

      <div className="relative z-10 mt-auto flex max-w-2xl flex-col gap-3 p-6 pt-28 md:p-10">
        <p className="text-xs font-bold tracking-[0.18em] text-white/90">{heroEyebrow(trip)}</p>
        <h1 id="hero-title" className="font-display !text-white text-4xl font-bold leading-[1.05] md:text-6xl">
          Willkommen zu<br />unserer Reise
        </h1>
        <p className="text-lg text-white/95" data-testid="featured-stop">
          Wüste. Wildnis. Wunder.<br />
          <span className="text-base"><PhaseLine briefing={briefing} trip={trip} today={today} /></span>
          {featured && <span className="sr-only"> {briefing.phase === 'during' ? 'Heute: ' : 'Nächste Station: '}{featured.title} ({featured.country}), {formatDate(featured.arrive_at)}</span>}
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          <Link href={featured ? `/route/${featured.id}` : '/route'} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-gold px-6 font-bold text-deep hover:bg-gold-200">
            <Plane size={18} aria-hidden /> Tagesbriefing öffnen <ArrowRight size={18} aria-hidden />
          </Link>
          <Link href="/route" className="inline-flex min-h-12 items-center gap-2 rounded-full border border-white/70 px-6 font-semibold hover:bg-white/10">
            Reiseplan ansehen <ArrowRight size={18} aria-hidden />
          </Link>
        </div>
      </div>

      {image && (
        <p className="absolute bottom-5 right-6 z-10 flex items-center gap-1.5 text-right text-sm font-semibold text-white md:right-10" title={image.location_verified ? undefined : 'Regionsmotiv: Landschaft der Gegend'}>
          <MapPin size={16} aria-hidden /> <span>{image.place_label}<br /><span className="font-normal text-white/85">{image.country}</span></span>
        </p>
      )}
    </section>
  );
}
