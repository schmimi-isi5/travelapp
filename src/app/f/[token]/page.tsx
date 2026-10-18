'use client';

import { RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Notice, Skeleton } from '@/components/ui';
import { FollowerHero } from '@/features/follow/follower-hero';
import { CurrentPlaceCard, RouteSection, Section, SectionNav, SightingsSection, StoriesSection } from '@/features/follow/follower-sections';
import { PhotoGallery } from '@/features/follow/photo-gallery';
import { findNewIds, readSeenIds, writeSeenIds } from '@/features/follow/photo-url';
import { DEMO_FOLLOW_TOKEN, useFollowerView } from '@/features/follow/use-follower-view';
import { formatDateTime } from '@/lib/formatting';
import type { FollowerView } from '@/lib/follow/view';

const SEEN_AFTER_MS = 6000;

/** What is new since the last visit on this device (nothing on a first visit); the list of seen items is saved a few seconds after the page opened. */
function useNewItems(token: string, view: FollowerView | null): Set<string> {
  const baseline = useRef<string[] | null | undefined>(undefined);
  const ids = useMemo(() => (view ? [...view.photos.map((p) => p.id), ...view.entries.map((e) => e.id), ...view.sightings.map((s) => s.id)] : []), [view]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!view) return;
    if (baseline.current === undefined) baseline.current = readSeenIds(token);
    setNewIds(new Set(findNewIds(baseline.current, ids)));
    const timer = window.setTimeout(() => writeSeenIds(token, ids), SEEN_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [token, view, ids]);
  return newIds;
}

function Centered({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-12 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-clay-strong">Unsere Reise. Unsere Geschichte.</p>
      <h1 className="mt-3 text-3xl font-semibold text-deep">{title}</h1>
      {children}
    </main>
  );
}

export default function FollowerPage() {
  const { token } = useParams<{ token: string }>();
  const state = useFollowerView(token);
  const view = state.status === 'ready' ? state.view : null;
  const newIds = useNewItems(token, view);

  if (state.status === 'loading') {
    return (
      <div aria-busy="true" aria-label="Reise wird geladen">
        <Skeleton className="h-[26rem] w-full rounded-none" />
        <div className="mx-auto max-w-4xl space-y-4 p-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  if (state.status === 'invalid') {
    return (
      <Centered title="Dieser Link ist nicht (mehr) gültig">
        <p className="mt-3 text-slate">Der Link wurde beendet oder ist abgelaufen. Bitte fragt die Familie nach einem neuen Link.</p>
      </Centered>
    );
  }
  if (state.status === 'error') {
    return (
      <Centered title="Die Reise konnte nicht geladen werden">
        <p className="mt-3 text-slate" role="alert">{state.message}</p>
        <div><Button className="mt-5" onClick={state.reload}>Erneut versuchen</Button></div>
      </Centered>
    );
  }

  const { view: data, demoAssets } = state;
  const hasContent = data.entries.length + data.photos.length + data.sightings.length > 0;
  const newCount = newIds.size;
  const sections = [
    ...(data.photos.length > 0 ? [{ id: 'fotos', label: 'Fotos', count: data.photos.length }] : []),
    ...(data.entries.length > 0 ? [{ id: 'berichte', label: 'Berichte', count: data.entries.length }] : []),
    ...(data.stops.length > 0 ? [{ id: 'route', label: 'Route', count: data.stops.length }] : []),
    ...(data.sightings.length > 0 ? [{ id: 'tiere', label: 'Tiere', count: data.sightings.length }] : []),
  ];

  return (
    <main className="pb-[max(2rem,env(safe-area-inset-bottom))]">
      {token === DEMO_FOLLOW_TOKEN && (
        <div className="bg-sand px-4 py-3">
          <div className="mx-auto max-w-4xl"><Notice tone="warn" title="Vorschau (Demo)">So sehen Daheimgebliebene die Reise. Die Inhalte sind fiktiv.</Notice></div>
        </div>
      )}
      <FollowerHero view={data} token={token} demoAssets={demoAssets} newCount={newCount} />

      <div className="relative z-10 mx-auto -mt-8 max-w-4xl px-4">
        <CurrentPlaceCard view={data} />
        <p className="mt-3 flex flex-wrap items-center gap-x-2 text-sm text-slate">
          <span>Stand: {formatDateTime(data.generatedAt)}</span>
          <button type="button" onClick={state.reload} className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 font-semibold text-deep hover:bg-sand" aria-label="Aktualisieren">
            <RefreshCw size={16} aria-hidden className={state.isRefreshing ? 'animate-spin' : ''} /> Aktualisieren
          </button>
          {state.refreshFailed && <Badge tone="warn">Aktualisierung fehlgeschlagen</Badge>}
        </p>
      </div>

      {/* directly in <main>: a sticky bar only sticks within its parent */}
      <SectionNav items={sections} />

      <div className="mx-auto max-w-4xl px-4">
        {data.trip.status !== 'upcoming' && !hasContent && (
          <div className="mt-10"><Notice tone="info">Noch nichts geteilt. Sobald die Familie Berichte, Fotos oder Tiersichtungen freigibt, erscheinen sie hier.</Notice></div>
        )}

        {data.photos.length > 0 && (
          <Section id="fotos" title="Fotos" count={data.photos.length}>
            <PhotoGallery photos={data.photos} token={token} demoAssets={demoAssets} newIds={newIds} />
          </Section>
        )}
        {data.entries.length > 0 && <StoriesSection entries={data.entries} newIds={newIds} />}
        {data.stops.length > 0 && <RouteSection view={data} />}
        {data.sightings.length > 0 && <SightingsSection sightings={data.sightings} newIds={newIds} />}

        {data.imageCredits.length > 0 && (
          <details className="mt-10 text-sm text-slate" data-testid="follower-credits">
            <summary className="min-h-11 cursor-pointer font-semibold text-deep">Bildnachweise der Ortsfotos</summary>
            <ul className="mt-2 space-y-1">
              {data.imageCredits.map((credit) => (
                <li key={credit.url}>
                  <strong>{credit.place}:</strong> {credit.text} (<a href={credit.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-deep underline">Quelle</a>)
                </li>
              ))}
            </ul>
          </details>
        )}

        <footer className="mt-12 border-t border-line pt-4 text-sm text-slate">
          Dies ist eine private Ansicht, nur für dich gedacht. Bitte gib den Link nicht weiter. Gezeigt wird nur, was die Familie freigegeben hat.
        </footer>
      </div>
    </main>
  );
}
