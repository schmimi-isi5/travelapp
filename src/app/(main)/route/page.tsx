'use client';

import { Map as MapIcon, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { TripMap } from '@/components/trip-map';
import { Button, Dialog, EmptyState, Notice, PageHeader } from '@/components/ui';
import { StopCard } from '@/features/trip/stop-card';
import { StopForm } from '@/features/trip/stop-form';
import { useTable } from '@/lib/db/hooks';
import { isAdult } from '@/lib/domain/policy';
import { buildDayBriefing } from '@/lib/domain/trip-day';
import { formatDuration } from '@/lib/formatting';

const DURATION_SOURCE_LABEL = {
  offline_estimate: 'grobe Offline-Schätzung',
  provider: 'Quelle: Anbieter',
  user_entered: 'selbst eingetragen',
  unknown: 'Quelle unbekannt',
} as const;

export default function RoutePage() {
  const { role, today } = useApp();
  const stops = useTable('trip_stops').rows;
  const routes = useTable('routes').rows;
  const items = useTable('action_items').rows;
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  const current = buildDayBriefing(stops, items, today).currentStop;
  const selectedStop = ordered.find((s) => s.id === selected);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Route"
        subtitle="Stationen nach Datum, mit Karte und Fahrtstrecken. Zeiten sind grobe Schätzungen, keine Navigation."
        actions={
          isAdult(role) && (
            <Button onClick={() => setAdding(true)}>
              <Plus size={18} aria-hidden /> Station hinzufügen
            </Button>
          )
        }
      />
      {ordered.length === 0 ? (
        <EmptyState icon={<MapIcon />} title="Noch keine Stationen" text="Lege die erste Station deiner Reise an." action={isAdult(role) ? <Button onClick={() => setAdding(true)}>Station hinzufügen</Button> : undefined} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <section aria-label="Stationenliste" className="space-y-3 lg:col-span-3">
            {ordered.map((stop, index) => {
              const previous = ordered[index - 1];
              const leg = previous ? routes.find((r) => r.from_stop_id === previous.id && r.to_stop_id === stop.id) : undefined;
              return (
                <div key={stop.id}>
                  {leg && (
                    <p className="mb-3 ml-6 border-l-2 border-dashed border-clay pl-4 text-sm text-slate" data-testid="route-leg">
                      ca. {leg.distance_km ?? '?'} km · ca. {formatDuration(leg.duration_minutes)} <span className="text-muted">({DURATION_SOURCE_LABEL[leg.duration_source]})</span>
                    </p>
                  )}
                  <StopCard stop={stop} isCurrent={current?.id === stop.id} />
                </div>
              );
            })}
          </section>
          <section aria-label="Karte" className="lg:col-span-2">
            <div className="lg:sticky lg:top-28">
              <TripMap stops={ordered} routes={routes} selectedId={selected} onSelect={setSelected} />
              {selectedStop && (
                <p className="mt-2 text-sm">
                  Ausgewählt: <strong>{selectedStop.title}</strong> ·{' '}
                  <Link className="font-semibold text-deep underline" href={`/route/${selectedStop.id}`}>
                    Details
                  </Link>
                </p>
              )}
              <div className="mt-3">
                <Notice tone="info">Ohne lizenzierten Kartendienst zeigt die App eine schematische Karte. Offline-Kartenkacheln sind nicht enthalten.</Notice>
              </div>
            </div>
          </section>
        </div>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} title="Station hinzufügen">
        <StopForm stops={stops} onDone={() => setAdding(false)} />
      </Dialog>
    </div>
  );
}
