'use client';

import { Binoculars, MapPin, RefreshCw } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Scene, sceneNameFromPath } from '@/components/scene';
import { TripMap } from '@/components/trip-map';
import { Badge, Button, Dialog, Notice, Skeleton } from '@/components/ui';
import { DEMO_FOLLOW_TOKEN, useFollowerView } from '@/features/follow/use-follower-view';
import { formatDate, formatDateTime, formatShortDate } from '@/lib/formatting';
import type { FollowerView } from '@/lib/follow/view';
import type { MediaAsset } from '@/lib/domain/schemas';

type Photo = FollowerView['photos'][number];

function PhotoImage({ photo, token, width, demoAssets }: { photo: Photo; token: string; width: 480 | 1600; demoAssets: Map<string, MediaAsset> | null }) {
  const label = photo.caption || 'Foto von unserer Reise';
  const asset = demoAssets?.get(photo.id);
  const scene = asset ? sceneNameFromPath(asset.storage_path) : null;
  if (scene) return <Scene name={scene} label={label} className="h-full w-full" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/api/follow/${encodeURIComponent(token)}/media/${photo.id}?w=${width}`} alt={label} loading="lazy" className="h-full w-full object-cover" />;
}

function CurrentPlace({ view }: { view: FollowerView }) {
  const current = view.stops.find((s) => s.id === view.currentStopId);
  if (view.trip.status === 'upcoming') return <Notice tone="info">Die Reise hat noch nicht begonnen. Sobald wir unterwegs sind, erscheinen hier unsere Stationen.</Notice>;
  if (view.trip.status === 'finished') return <Notice tone="ok">Die Reise ist zu Ende. Hier seht ihr unsere ganze Route.</Notice>;
  if (!current) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-line bg-white p-4 shadow-card" data-testid="follower-current">
      <MapPin aria-hidden className="mt-1 shrink-0 text-clay-strong" />
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate">Gerade sind wir hier</p>
        <p className="text-xl font-extrabold">{current.title}</p>
        <p className="text-slate">
          {current.country}
          {current.arrive_at && ` · seit ${formatDate(current.arrive_at, { day: 'numeric', month: 'long' })}`}
          {current.depart_at && ` · bis ${formatDate(current.depart_at, { day: 'numeric', month: 'long' })}`}
        </p>
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="mt-10">
      <h2 className="mb-3 text-xl font-extrabold">
        {title} {count !== undefined && count > 0 && <span className="text-base font-semibold text-slate">({count})</span>}
      </h2>
      {children}
    </section>
  );
}

export default function FollowerPage() {
  const { token } = useParams<{ token: string }>();
  const state = useFollowerView(token);
  const [openId, setOpenId] = useState<string | null>(null);

  if (state.status === 'loading') {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6" aria-busy="true" aria-label="Reise wird geladen">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (state.status === 'invalid') {
    return (
      <main className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl font-extrabold">Dieser Link ist nicht (mehr) gültig</h1>
        <p className="mt-3 text-slate">Der Link wurde beendet oder ist abgelaufen. Bitte fragt die Familie nach einem neuen Link.</p>
      </main>
    );
  }
  if (state.status === 'error') {
    return (
      <main className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-2xl font-extrabold">Die Reise konnte nicht geladen werden</h1>
        <p className="mt-3 text-slate" role="alert">{state.message}</p>
        <Button className="mt-5" onClick={state.reload}>Erneut versuchen</Button>
      </main>
    );
  }

  const { view, demoAssets } = state;
  const stopsWithPlace = view.stops;
  const legs = stopsWithPlace.slice(1).map((s, i) => ({ id: s.id, from_stop_id: stopsWithPlace[i]!.id, to_stop_id: s.id }));
  const open = view.photos.find((p) => p.id === openId) ?? null;
  const hasContent = view.entries.length + view.photos.length + view.sightings.length > 0;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 md:py-12">
      {token === DEMO_FOLLOW_TOKEN && <Notice tone="warn" title="Vorschau (Demo)">So sehen Daheimgebliebene die Reise. Die Inhalte sind fiktiv.</Notice>}
      <header className={token === DEMO_FOLLOW_TOKEN ? 'mt-6' : ''}>
        <p className="text-sm font-semibold uppercase tracking-wide text-clay-strong">Unsere Reise. Unsere Geschichte.</p>
        <h1 className="mt-1 text-3xl font-extrabold md:text-4xl">{view.trip.title}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate">
          <span>Stand: {formatDateTime(view.generatedAt)}</span>
          <button type="button" onClick={state.reload} className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 font-semibold text-deep hover:bg-deep-50" aria-label="Aktualisieren">
            <RefreshCw size={16} aria-hidden className={state.isRefreshing ? 'animate-spin' : ''} /> Aktualisieren
          </button>
          {state.refreshFailed && <Badge tone="warn">Aktualisierung fehlgeschlagen</Badge>}
        </p>
      </header>

      <div className="mt-6 space-y-4">
        <CurrentPlace view={view} />
        {stopsWithPlace.length > 0 && <TripMap stops={stopsWithPlace} routes={legs} selectedId={view.currentStopId} readOnly />}
      </div>

      {stopsWithPlace.length > 0 && (
        <Section title="Unsere Route">
          <ol className="space-y-2">
            {stopsWithPlace.map((s) => (
              <li key={s.id} className="flex items-baseline gap-3 rounded-lg border border-line bg-white px-4 py-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-deep text-sm font-bold text-white" aria-hidden>{s.sequence}</span>
                <span className="font-semibold">{s.title}</span>
                <span className="text-sm text-slate">{s.country}</span>
                <span className="ml-auto text-sm text-slate">{s.arrive_at ? formatShortDate(s.arrive_at) : ''}{s.depart_at ? ` – ${formatShortDate(s.depart_at)}` : ''}</span>
                {s.id === view.currentStopId && <Badge tone="info">Jetzt</Badge>}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {view.trip.status !== 'upcoming' && !hasContent && (
        <div className="mt-10"><Notice tone="info">Noch nichts geteilt. Sobald die Familie Berichte, Fotos oder Tiersichtungen freigibt, erscheinen sie hier.</Notice></div>
      )}

      {view.entries.length > 0 && (
        <Section title="Reiseberichte" count={view.entries.length}>
          <div className="space-y-4">
            {view.entries.map((e) => (
              <article key={e.id} className="rounded-lg border border-line bg-white p-5 shadow-card">
                <h3 className="text-lg font-bold">{e.title}</h3>
                <p className="mt-1 text-sm text-slate">{formatDate(e.entry_date)}{e.stop && ` · ${e.stop}`}{e.author && ` · von ${e.author}`}</p>
                <p className="mt-3 whitespace-pre-wrap leading-relaxed">{e.body}</p>
              </article>
            ))}
          </div>
        </Section>
      )}

      {view.photos.length > 0 && (
        <Section title="Fotos" count={view.photos.length}>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {view.photos.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpenId(p.id)} aria-label={`Foto öffnen: ${p.caption || 'ohne Beschriftung'}`} className="block aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-sand">
                  <PhotoImage photo={p} token={token} width={480} demoAssets={demoAssets} />
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {view.sightings.length > 0 && (
        <Section title="Tiersichtungen" count={view.sightings.length}>
          <ul className="space-y-2">
            {view.sightings.map((s) => (
              <li key={s.id} className="flex items-start gap-3 rounded-lg border border-line bg-white px-4 py-3">
                <Binoculars aria-hidden className="mt-0.5 shrink-0 text-deep" />
                <div>
                  <p className="font-semibold">{s.species}{s.count ? ` (${s.count}×)` : ''}</p>
                  <p className="text-sm text-slate">{formatDateTime(s.seen_at)}{s.stop && ` · ${s.stop}`}</p>
                  {s.notes && <p className="mt-1">{s.notes}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <footer className="mt-12 border-t border-line pt-4 text-sm text-slate">
        Dies ist eine private Ansicht, nur für dich gedacht. Bitte gib den Link nicht weiter. Gezeigt wird nur, was die Familie freigegeben hat.
      </footer>

      <Dialog open={open !== null} onClose={() => setOpenId(null)} title={open?.caption || 'Foto'} wide>
        {open && (
          <div>
            <div className="overflow-hidden rounded-lg bg-sand">
              <div className="mx-auto max-h-[70vh] w-full">
                <PhotoImage photo={open} token={token} width={1600} demoAssets={demoAssets} />
              </div>
            </div>
            <p className="mt-3 text-sm text-slate">{open.captured_at ? formatDateTime(open.captured_at) : ''}{open.stop && ` · ${open.stop}`}</p>
          </div>
        )}
      </Dialog>
    </main>
  );
}
