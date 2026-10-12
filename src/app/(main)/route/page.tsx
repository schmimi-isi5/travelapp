'use client';

import { Map as MapIcon, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button, Dialog, EmptyState, PageHeader } from '@/components/ui';
import { StopCard } from '@/features/trip/stop-card';
import { StopForm } from '@/features/trip/stop-form';
import { useTable } from '@/lib/db/hooks';
import { isAdult } from '@/lib/domain/policy';
import { buildDayBriefing } from '@/lib/domain/trip-day';
import { driveSummary, durationSourceLabel } from '@/lib/labels';

export default function RoutePage() {
  const { role, today } = useApp();
  const stops = useTable('trip_stops').rows;
  const routes = useTable('routes').rows;
  const items = useTable('action_items').rows;
  const [adding, setAdding] = useState(false);
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  const current = buildDayBriefing(stops, items, today).currentStop;

  return (
    <div className="mx-auto max-w-content">
      <PageHeader
        title="Reiseplan"
        subtitle="Stationen nach Datum mit Fahrtstrecken und Tagesbriefing. Zeiten sind grobe Schätzungen, keine Navigation."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/map" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-white px-5 font-semibold text-deep hover:bg-sand-50"><MapIcon size={18} aria-hidden /> Karte ansehen</Link>
            {isAdult(role) && (
              <Button onClick={() => setAdding(true)}>
                <Plus size={18} aria-hidden /> Station hinzufügen
              </Button>
            )}
          </div>
        }
      />
      {ordered.length === 0 ? (
        <EmptyState icon={<MapIcon />} title="Noch keine Stationen" text="Lege die erste Station deiner Reise an." action={isAdult(role) ? <Button onClick={() => setAdding(true)}>Station hinzufügen</Button> : undefined} />
      ) : (
        <div>
          <section aria-label="Stationenliste" className="min-w-0 space-y-3">
            {ordered.map((stop, index) => {
              const previous = ordered[index - 1];
              const leg = previous ? routes.find((r) => r.from_stop_id === previous.id && r.to_stop_id === stop.id) : undefined;
              return (
                <div key={stop.id}>
                  {leg && driveSummary(leg.distance_km, leg.duration_minutes) && (
                    <p className="mb-3 ml-6 border-l-2 border-dashed border-clay pl-4 text-sm text-slate" data-testid="route-leg">
                      {driveSummary(leg.distance_km, leg.duration_minutes)}
                      {durationSourceLabel[leg.duration_source] && <span className="text-muted"> ({durationSourceLabel[leg.duration_source]})</span>}
                    </p>
                  )}
                  <StopCard stop={stop} isCurrent={current?.id === stop.id} />
                </div>
              );
            })}
          </section>
        </div>
      )}
      <Dialog open={adding} onClose={() => setAdding(false)} title="Station hinzufügen">
        <StopForm stops={stops} onDone={() => setAdding(false)} />
      </Dialog>
    </div>
  );
}
