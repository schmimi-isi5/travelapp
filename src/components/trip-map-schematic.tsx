'use client';

import clsx from 'clsx';
import Link from 'next/link';
import type { Route, TripStop } from '@/lib/domain/schemas';

const WIDTH = 640;
const HEIGHT = 420;
const PADDING = 48;

/** The parts of a stop / leg the maps need; lets the follower view reuse the maps without app entities. */
export type MapStop = Pick<TripStop, 'id' | 'title' | 'sequence' | 'latitude' | 'longitude'>;
export type MapLeg = Pick<Route, 'id' | 'from_stop_id' | 'to_stop_id'>;

interface Point {
  x: number;
  y: number;
}

function project(stops: MapStop[]): Map<string, Point> {
  const located = stops.filter((s) => s.latitude !== null && s.longitude !== null);
  const map = new Map<string, Point>();
  if (located.length === 0) return map;
  const lats = located.map((s) => s.latitude as number);
  const lons = located.map((s) => s.longitude as number);
  const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const spanLat = Math.max(maxLat - minLat, 0.5);
  const spanLon = Math.max(maxLon - minLon, 0.5);
  // Equirectangular projection scaled to keep the aspect ratio at this latitude.
  const midLat = ((minLat + maxLat) / 2) * (Math.PI / 180);
  const scale = Math.min((WIDTH - 2 * PADDING) / (spanLon * Math.cos(midLat)), (HEIGHT - 2 * PADDING) / spanLat);
  const offsetX = (WIDTH - spanLon * Math.cos(midLat) * scale) / 2;
  const offsetY = (HEIGHT - spanLat * scale) / 2;
  for (const s of located) {
    map.set(s.id, {
      x: offsetX + ((s.longitude as number) - minLon) * Math.cos(midLat) * scale,
      y: offsetY + (maxLat - (s.latitude as number)) * scale,
    });
  }
  return map;
}

/**
 * Fallback SVG route map (used when tile data or WebGL is unavailable): pins and route lines from stop coordinates.
 * The primary map is trip-map.tsx (MapLibre with self-hosted Protomaps tiles).
 */
export function SchematicTripMap({ stops, routes, selectedId, onSelect, className, readOnly = false }: { stops: MapStop[]; routes: MapLeg[]; selectedId?: string | null; onSelect?: (id: string) => void; className?: string; readOnly?: boolean }) {
  const points = project(stops);
  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  return (
    <div className={clsx('overflow-hidden rounded-lg border border-line bg-deep-50', className)}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="group" aria-label="Routenkarte mit Stationen" className="block h-auto w-full">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#c9dde3" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="url(#grid)" />
        {routes.map((r) => {
          const a = points.get(r.from_stop_id);
          const b = points.get(r.to_stop_id);
          if (!a || !b) return null;
          return <line key={r.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#C65A3A" strokeWidth="3" strokeDasharray="8 6" strokeLinecap="round" />;
        })}
        {ordered.map((s) => {
          const p = points.get(s.id);
          if (!p) return null;
          const active = selectedId === s.id;
          const pin = (
            <>
                <circle r={active ? 17 : 14} fill={active ? '#C65A3A' : '#0F3D4E'} stroke="#fff" strokeWidth="3" />
                <text textAnchor="middle" dy="5" fontSize="13" fontWeight="700" fill="#fff">
                  {s.sequence}
                </text>
                <text y={-22} textAnchor="middle" fontSize="13" fontWeight="600" fill="#0F3D4E" stroke="#fff" strokeWidth="4" paintOrder="stroke">
                  {s.title.split(' / ')[0]}
                </text>
            </>
          );
          return (
            <g key={s.id} transform={`translate(${p.x} ${p.y})`}>
              {readOnly ? (
                <g role="img" aria-label={`Station ${s.sequence}: ${s.title}`}>{pin}</g>
              ) : (
                <Link href={`/route/${s.id}`} onClick={(e) => { if (onSelect) { e.preventDefault(); onSelect(s.id); } }} aria-label={`Station ${s.sequence}: ${s.title}`}>{pin}</Link>
              )}
            </g>
          );
        })}
      </svg>
      <p className="border-t border-line bg-white px-3 py-2 text-xs text-slate">Schematische Karte aus Stationskoordinaten (keine Navigation, keine Kartenkacheln).</p>
    </div>
  );
}
