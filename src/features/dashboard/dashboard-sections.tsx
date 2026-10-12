'use client';

import { ArrowRight, BedDouble } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { FamilyAvatarGroup } from '@/components/app-shell';
import { RegionMotifBadge, ResponsiveTravelImage, StopCover } from '@/components/destination-image';
import { MORE_NAV, PRIMARY_NAV, visibleFor } from '@/components/nav-items';
import { SchematicTripMap } from '@/components/trip-map-schematic';
import { Button, Card } from '@/components/ui';
import { ActionChecklist } from '@/features/common/action-checklist';
import { sceneForStop } from '@/features/trip/stop-card';
import type { ActionItem, Member, Role, Route, Stay, TripStop } from '@/lib/domain/schemas';
import { formatShortDate } from '@/lib/formatting';
import { imagesForStop, type DestinationImage } from '@/lib/media/places';

const QUICK_ACTION_HREFS = ['/stays', '/bookings', '/journal', '/sightings', '/expenses', '/safety'];
const TASKS_COLLAPSED = 3;
const IMPRESSIONS_MAX = 4;

function SectionHeading({ id, title, href, linkLabel }: { id: string; title: string; href?: string; linkLabel?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 id={id} className="font-display text-xl font-bold md:text-2xl">{title}</h2>
      {href && (
        <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-deep underline">
          {linkLabel} <ArrowRight size={14} aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** Next station: photo (or illustration), place, dates and where we sleep; leads to the station page with the day briefing. */
export function NextStopCard({ stop, stays }: { stop: TripStop; stays: readonly Stay[] }) {
  const stayNames = stays.map((s) => s.name).join(', ');
  return (
    <Card className="flex h-full flex-col gap-3" data-testid="next-stop-card">
      <SectionHeading id="next-stop-title" title="Unser nächster Stopp" />
      <Link href={`/route/${stop.id}`} aria-label={`Station ${stop.title} öffnen`} className="group relative block aspect-[4/3] overflow-hidden rounded-xl bg-sand">
        <StopCover stop={stop} fallback={sceneForStop(stop)} label={`Illustration zu ${stop.title}`} />
      </Link>
      <div>
        <p className="font-display text-xl font-bold">{stop.title}</p>
        <p className="text-sm text-slate">
          {stop.country} · {stop.arrive_at ? `${formatShortDate(stop.arrive_at)} – ${formatShortDate(stop.depart_at)}` : 'Datum unbekannt'}
        </p>
        <p className="mt-2 flex items-start gap-2 text-sm text-slate">
          <BedDouble size={16} aria-hidden className="mt-0.5 shrink-0" />
          <span>{stayNames ? `Unterkunft: ${stayNames}` : 'Unterkunft hier noch nicht erfasst'}</span>
        </p>
      </div>
    </Card>
  );
}

/** Schematic route overview: always labelled as such, never as navigation. */
export function RoutePreviewCard({ stops, routes, selectedId }: { stops: TripStop[]; routes: Route[]; selectedId?: string }) {
  return (
    <Card className="flex h-full flex-col gap-3" data-testid="route-preview">
      <SectionHeading id="route-preview-title" title="Unsere Route" href="/route" linkLabel="Karte öffnen" />
      <SchematicTripMap stops={stops} routes={routes} selectedId={selectedId} readOnly className="w-full" />
    </Card>
  );
}

interface Impression {
  stop: TripStop;
  image: DestinationImage;
}

/** One gallery photo per upcoming station from the image library; empty when there are none (e.g. demo mode). */
export function impressionsFor(stops: readonly TripStop[], library: readonly DestinationImage[]): Impression[] {
  const result: Impression[] = [];
  for (const stop of stops) {
    const image = imagesForStop(stop, library).gallery[0];
    if (image && !result.some((r) => r.image.place_key === image.place_key)) result.push({ stop, image });
    if (result.length === IMPRESSIONS_MAX) break;
  }
  return result;
}

export function ImpressionsStrip({ impressions }: { impressions: Impression[] }) {
  if (impressions.length === 0) return null;
  return (
    <section aria-labelledby="impressions-title" data-testid="impressions">
      <SectionHeading id="impressions-title" title="Reiseimpressionen" href="/route" linkLabel="Alle Stationen" />
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {impressions.map(({ stop, image }) => (
          <li key={image.id}>
            <Link href={`/route/${stop.id}`} className="group relative block aspect-[4/3] overflow-hidden rounded-xl border border-line bg-sand">
              <ResponsiveTravelImage image={image} kind="gallery" sizes="(min-width: 768px) 25vw, 50vw" className="transition-transform duration-200 group-hover:scale-[1.03]" />
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-deep/85 to-transparent p-3 pt-8 text-sm font-semibold text-white">
                {image.place_label}
                <RegionMotifBadge image={image} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The most urgent open tasks (top three, rest on request); every task stays reachable and checkable. */
export function TaskSummary({ items }: { items: ActionItem[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const visible = isExpanded ? items : items.slice(0, TASKS_COLLAPSED);
  const hiddenCount = items.length - TASKS_COLLAPSED;
  return (
    <Card data-testid="task-summary">
      <SectionHeading id="tasks-title" title="Offene Aufgaben" />
      <p className="mb-2 text-sm text-slate" data-testid="open-count">{items.length} offen</p>
      <ActionChecklist items={visible} label="Offene Aufgaben" />
      {hiddenCount > 0 && (
        <Button variant="secondary" size="sm" className="mt-3" aria-expanded={isExpanded} onClick={() => setIsExpanded((value) => !value)}>
          {isExpanded ? 'Weniger anzeigen' : `Alle ${items.length} anzeigen`}
        </Button>
      )}
    </Card>
  );
}

export function FamilyCard({ members }: { members: Member[] }) {
  const active = members.filter((m) => m.status === 'active');
  return (
    <Card data-testid="family-card">
      <SectionHeading id="family-title" title="Unsere Familie" href="/family" linkLabel="Familie" />
      <div className="flex flex-wrap items-center gap-4">
        <FamilyAvatarGroup members={members} size={44} />
        <p className="text-sm text-slate">{active.length} Mitreisende</p>
      </div>
    </Card>
  );
}

/** Six frequent destinations as compact tiles (the full list is in the navigation). */
export function QuickActions({ role }: { role: Role }) {
  const items = [...visibleFor(PRIMARY_NAV, role), ...visibleFor(MORE_NAV, role)].filter((item) => QUICK_ACTION_HREFS.includes(item.href));
  return (
    <section aria-labelledby="quick-title">
      <SectionHeading id="quick-title" title="Schnellzugriff" />
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex h-full min-h-20 flex-col gap-1 rounded-xl border border-line bg-white p-3 transition-colors hover:bg-sand">
              <item.icon size={20} aria-hidden className="text-deep" />
              <strong className="text-sm">{item.label}</strong>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
