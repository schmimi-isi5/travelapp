'use client';

import clsx from 'clsx';
import { Binoculars, MapPin } from 'lucide-react';
import { useEffect, useState } from 'react';
import { TripMap } from '@/components/trip-map';
import { Badge } from '@/components/ui';
import { formatDate, formatDateTime, formatShortDate } from '@/lib/formatting';
import { imageUrl } from '@/lib/media/places';
import type { FollowerView } from '@/lib/follow/view';

/** A section with an anchor, a Fraunces heading and the count. */
export function Section({ id, title, count, children }: { id: string; title: string; count?: number; children: React.ReactNode }) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-16 pt-10">
      <h2 className="mb-4 font-display text-2xl font-semibold text-deep sm:text-3xl">
        {title} {count !== undefined && count > 0 && <span className="font-sans text-base font-semibold text-slate">({count})</span>}
      </h2>
      {children}
    </section>
  );
}

/** "Gerade sind wir hier": the card that sits on the lower edge of the hero. */
export function CurrentPlaceCard({ view }: { view: FollowerView }) {
  const current = view.stops.find((s) => s.id === view.currentStopId);
  if (view.trip.status === 'upcoming') {
    return (
      <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <p className="text-slate">Die Reise hat noch nicht begonnen. Sobald wir unterwegs sind, erscheinen hier unsere Stationen, Fotos und Berichte.</p>
      </div>
    );
  }
  if (view.trip.status === 'finished') {
    return (
      <div className="rounded-2xl border border-line bg-white p-5 shadow-card">
        <p className="text-slate">Die Reise ist zu Ende. Hier seht ihr unsere ganze Route.</p>
      </div>
    );
  }
  if (!current) return null;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line bg-white p-5 shadow-card" data-testid="follower-current">
      <span className="grid size-11 shrink-0 place-items-center rounded-full bg-clay-50 text-clay-strong">
        <MapPin aria-hidden size={22} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate">Gerade sind wir hier</p>
        <p className="font-display text-2xl font-semibold leading-tight text-deep">{current.title}</p>
        <p className="mt-0.5 text-sm text-slate">
          {current.country}
          {current.arrive_at && ` · seit ${formatDate(current.arrive_at, { day: 'numeric', month: 'long' })}`}
          {current.depart_at && ` · bis ${formatDate(current.depart_at, { day: 'numeric', month: 'long' })}`}
        </p>
      </div>
    </div>
  );
}

/** The route as a timeline with the place photos, and the map above it. */
export function RouteSection({ view }: { view: FollowerView }) {
  const stops = view.stops;
  const legs = stops.slice(1).map((s, i) => ({ id: s.id, from_stop_id: stops[i]!.id, to_stop_id: s.id }));
  return (
    <Section id="route" title="Unsere Route" count={stops.length}>
      <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
        <TripMap stops={stops} routes={legs} selectedId={view.currentStopId} readOnly />
      </div>
      <ol className="mt-6" aria-label="Stationen">
        {stops.map((s, i) => {
          const isCurrent = s.id === view.currentStopId;
          return (
            <li key={s.id} className="relative flex gap-4 pb-6 last:pb-0">
              {i < stops.length - 1 && <span className="absolute left-[1.05rem] top-9 h-[calc(100%-1.5rem)] w-0.5 bg-line" aria-hidden />}
              <span className={clsx('relative z-10 grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold', isCurrent ? 'bg-clay-strong text-white ring-4 ring-clay-50' : 'bg-deep text-white')} aria-hidden>
                {s.sequence}
              </span>
              <div className="min-w-0 flex-1 overflow-hidden rounded-xl border border-line bg-white shadow-card">
                {s.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl(s.image.path)} alt={s.image.alt} loading="lazy" decoding="async" className="aspect-[16/9] w-full object-cover" title={s.image.isRegionMotif ? 'Regionsmotiv: Landschaft der Gegend' : undefined} />
                )}
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4">
                  <h3 className="font-display text-xl font-semibold text-deep">{s.title}</h3>
                  <span className="text-sm text-slate">{s.country}</span>
                  {isCurrent && <Badge tone="info">Jetzt</Badge>}
                  <span className="w-full text-sm text-slate">
                    {s.arrive_at ? formatShortDate(s.arrive_at) : ''}
                    {s.depart_at ? ` – ${formatShortDate(s.depart_at)}` : ''}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function Story({ entry, isNew }: { entry: FollowerView['entries'][number]; isNew: boolean }) {
  const isLong = entry.body.length > 420;
  const [isOpen, setIsOpen] = useState(false);
  return (
    <article className="rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-slate">
        <span className="font-semibold text-clay-strong">{formatDate(entry.entry_date, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
        {entry.stop && <Badge>{entry.stop}</Badge>}
        {isNew && <Badge tone="danger">Neu</Badge>}
      </div>
      <h3 className="mt-2 font-display text-2xl font-semibold leading-snug text-deep">{entry.title}</h3>
      <p className={clsx('mt-3 whitespace-pre-wrap text-[17px] leading-relaxed text-ink', isLong && !isOpen && 'line-clamp-6')}>{entry.body}</p>
      {isLong && (
        <button type="button" aria-expanded={isOpen} onClick={() => setIsOpen((v) => !v)} className="mt-2 min-h-11 rounded-full font-semibold text-deep underline">
          {isOpen ? 'Weniger anzeigen' : 'Weiterlesen'}
        </button>
      )}
      {entry.author && <p className="mt-3 text-sm text-slate">von {entry.author}</p>}
    </article>
  );
}

export function StoriesSection({ entries, newIds }: { entries: FollowerView['entries']; newIds: ReadonlySet<string> }) {
  return (
    <Section id="berichte" title="Reiseberichte" count={entries.length}>
      <div className="space-y-4">
        {entries.map((e) => (
          <Story key={e.id} entry={e} isNew={newIds.has(e.id)} />
        ))}
      </div>
    </Section>
  );
}

/** Animals: a tally per species on top, then what was seen when. */
export function SightingsSection({ sightings, newIds }: { sightings: FollowerView['sightings']; newIds: ReadonlySet<string> }) {
  const [showAll, setShowAll] = useState(false);
  const tally = new Map<string, number>();
  for (const s of sightings) tally.set(s.species, (tally.get(s.species) ?? 0) + (s.count ?? 1));
  const species = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const shown = showAll ? sightings : sightings.slice(0, 6);
  return (
    <Section id="tiere" title="Tiersichtungen" count={sightings.length}>
      <ul className="mb-4 flex flex-wrap gap-2" aria-label="Das haben wir gesehen">
        {species.map(([name, total]) => (
          <li key={name} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3.5 py-2 text-sm font-semibold text-deep shadow-card">
            <Binoculars size={16} aria-hidden /> {name} <span className="text-slate">× {total}</span>
          </li>
        ))}
      </ul>
      <ul className="space-y-2">
        {shown.map((s) => (
          <li key={s.id} className="flex items-start gap-3 rounded-xl border border-line bg-white px-4 py-3">
            <Binoculars aria-hidden className="mt-0.5 shrink-0 text-deep" />
            <div className="min-w-0">
              <p className="font-semibold">
                {s.species}
                {s.count ? ` (${s.count}×)` : ''} {newIds.has(s.id) && <Badge tone="danger">Neu</Badge>}
              </p>
              <p className="text-sm text-slate">
                {formatDateTime(s.seen_at)}
                {s.stop && ` · ${s.stop}`}
              </p>
              {s.notes && <p className="mt-1">{s.notes}</p>}
            </div>
          </li>
        ))}
      </ul>
      {sightings.length > 6 && (
        <button type="button" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)} className="mt-2 min-h-11 rounded-full font-semibold text-deep underline">
          {showAll ? 'Weniger anzeigen' : `Alle ${sightings.length} anzeigen`}
        </button>
      )}
    </Section>
  );
}

/** Sticky chips to jump between the sections; the one in view is highlighted. */
export function SectionNav({ items }: { items: { id: string; label: string; count?: number }[] }) {
  const [active, setActive] = useState(items[0]?.id ?? '');
  useEffect(() => {
    const targets = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: '-20% 0px -65% 0px' },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [items]);
  if (items.length < 2) return null;
  return (
    <nav aria-label="Abschnitte" className="sticky top-0 z-30 mt-2 border-b border-line bg-sand-50/95 backdrop-blur">
      <ul className="mx-auto flex max-w-4xl gap-2 overflow-x-auto px-4 py-2">
        {items.map((item) => (
          <li key={item.id} className="shrink-0">
            <a href={`#${item.id}`} aria-current={active === item.id ? 'true' : undefined} className={clsx('inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold', active === item.id ? 'bg-deep text-white' : 'text-deep hover:bg-sand')}>
              {item.label}
              {item.count ? ` (${item.count})` : ''}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
