import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Scene, type SceneName } from '@/components/scene';
import { Badge } from '@/components/ui';
import type { TripStop } from '@/lib/domain/schemas';
import { formatShortDate } from '@/lib/formatting';

const SCENES: Record<string, SceneName> = { windhoek: 'city', sossusvlei: 'dunes', swakopmund: 'coast', etosha: 'waterhole', chobe: 'river', maun: 'savanna' };

export function sceneForStop(stop: TripStop): SceneName {
  const key = stop.title.toLowerCase();
  const match = Object.entries(SCENES).find(([k]) => key.includes(k));
  return match ? match[1] : 'savanna';
}

export function StopCard({ stop, isCurrent, isDemo }: { stop: TripStop; isCurrent?: boolean; isDemo?: boolean }) {
  return (
    <Link href={`/route/${stop.id}`} className="group flex overflow-hidden rounded-lg border border-line bg-white shadow-card transition-shadow hover:shadow-lg">
      <div className="h-auto w-28 shrink-0 sm:w-40">
        <Scene name={sceneForStop(stop)} label={`Illustration zu ${stop.title}`} />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-muted">STATION {String(stop.sequence).padStart(2, '0')}</span>
            {isCurrent && <Badge tone="ok">aktuell</Badge>}
            {(isDemo || stop.is_demo) && <Badge tone="demo">Beispiel</Badge>}
          </div>
          <h3 className="truncate text-lg font-bold">{stop.title}</h3>
          <p className="text-sm text-slate">
            {stop.country} · {stop.arrive_at ? `${formatShortDate(stop.arrive_at)} – ${formatShortDate(stop.depart_at)}` : 'Datum unbekannt'}
          </p>
        </div>
        <ChevronRight aria-hidden className="shrink-0 text-muted transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}
