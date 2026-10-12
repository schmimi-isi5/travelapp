'use client';

import { Map as MapIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { TripMap } from '@/components/trip-map';
import { Chip, EmptyState, Notice, PageHeader } from '@/components/ui';
import { useTable } from '@/lib/db/hooks';

export default function MapPage() {
  const stops = useTable('trip_stops').rows;
  const routes = useTable('routes').rows;
  const [selected, setSelected] = useState<string | null>(null);
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  const selectedStop = ordered.find((s) => s.id === selected);

  return (
    <div className="mx-auto max-w-content">
      <PageHeader title="Karte" subtitle="Alle Stationen auf der Karte. Tippe eine Station an, um sie hervorzuheben." />
      {ordered.length === 0 ? (
        <EmptyState icon={<MapIcon />} title="Noch keine Stationen" text="Sobald es Stationen gibt, erscheinen sie hier auf der Karte." action={<Link href="/route" className="font-semibold text-deep underline">Zum Reiseplan</Link>} />
      ) : (
        <div className="space-y-4">
          <section aria-label="Karte" className="min-w-0">
            <TripMap stops={ordered} routes={routes} selectedId={selected} onSelect={setSelected} />
          </section>
          <section aria-label="Stationen" className="flex flex-wrap gap-2">
            {ordered.map((stop) => (
              <Chip key={stop.id} active={stop.id === selected} onClick={() => setSelected(stop.id === selected ? null : stop.id)}>{stop.sequence}. {stop.title}</Chip>
            ))}
          </section>
          {selectedStop && (
            <p className="text-sm">
              Ausgewählt: <strong>{selectedStop.title}</strong> · <Link className="font-semibold text-deep underline" href={`/route/${selectedStop.id}`}>Details und Tagesbriefing</Link>
            </p>
          )}
          <Notice tone="info">Die Karte nutzt OpenStreetMap-Daten vom eigenen Server. Wer sie auf dem Gerät speichert, kann sie auch ohne Netz verwenden. Fehlen die Kartendaten, zeigt die App eine schematische Karte.</Notice>
        </div>
      )}
    </div>
  );
}
