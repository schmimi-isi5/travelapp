'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { COUNTRY_LABELS, LABEL_FONT, layoutPins, MAP_WIDTH, mapLabel, OUTLINES, type PlacedPin } from '@/lib/map/illustrated-layout';

export interface IllustratedStop {
  id: string;
  title: string;
  sequence: number;
  latitude: number;
  longitude: number;
  /** Small photo of the place from the image library; without it the pin shows the station number. */
  imageUrl: string | null;
}

const ROUTE_COLOR = '#d98a3d';

function Pin({ placed, stop, isCurrent, radius }: { placed: PlacedPin; stop: IllustratedStop; isCurrent: boolean; radius: number }) {
  const clipId = `pin-${stop.id}`;
  const { x, y } = placed.pin;
  return (
    <Link href={`/route/${stop.id}`} aria-label={`Station ${stop.sequence}: ${stop.title}${isCurrent ? ' (aktuell)' : ''}`}>
      {placed.isNudged && (
        <g aria-hidden>
          <line x1={placed.origin.x} y1={placed.origin.y} x2={x} y2={y} stroke={ROUTE_COLOR} strokeWidth="1.5" />
          <circle cx={placed.origin.x} cy={placed.origin.y} r="3" fill={ROUTE_COLOR} />
        </g>
      )}
      <clipPath id={clipId}><circle cx={x} cy={y} r={radius - 2} /></clipPath>
      <circle cx={x} cy={y} r={radius} fill="#fff" stroke={isCurrent ? ROUTE_COLOR : '#fff'} strokeWidth={isCurrent ? 3.5 : 2.5} style={{ filter: 'drop-shadow(0 2px 3px rgb(8 36 48 / 0.35))' }} />
      {stop.imageUrl ? (
        <image href={stop.imageUrl} x={x - radius + 2} y={y - radius + 2} width={(radius - 2) * 2} height={(radius - 2) * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clipId})`} />
      ) : (
        <g>
          <circle cx={x} cy={y} r={radius - 2} fill="#0f3d4e" />
          <text x={x} y={y + 4.5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">{stop.sequence}</text>
        </g>
      )}
      {placed.isLabelShown && <text x={placed.labelAt.x} y={placed.labelAt.y} textAnchor={placed.anchor} fontSize={LABEL_FONT} fontWeight="600" fill="#0f3d4e" stroke="#fffdf8" strokeWidth="3.5" strokeLinejoin="round" paintOrder="stroke">{placed.label}</text>}
    </Link>
  );
}

/** Small car marking where the family is right now (only shown while travelling). */
function Vehicle({ x, y, radius }: { x: number; y: number; radius: number }) {
  return (
    <g transform={`translate(${x + radius - 2} ${y - radius - 6})`} aria-hidden>
      <circle r="11" fill={ROUTE_COLOR} stroke="#fff" strokeWidth="2" />
      <path d="M-6 2v-3l1.6-3.4a1.4 1.4 0 0 1 1.3-.8h6.2a1.4 1.4 0 0 1 1.3.8L6 -1v3a.8.8 0 0 1-.8.8H4.6a.8.8 0 0 1-.8-.8v-.4h-7.6v.4a.8.8 0 0 1-.8.8h-.6A.8.8 0 0 1-6 2Z" fill="#fff" />
      <circle cx="-3" cy="-.2" r=".9" fill={ROUTE_COLOR} />
      <circle cx="3" cy="-.2" r=".9" fill={ROUTE_COLOR} />
    </g>
  );
}

/**
 * Illustrated map of Namibia and Botswana: soft country shapes with name watermarks, dotted orange route and round photo pins.
 * A hand-drawn illustration of the region, not a navigation map.
 */
export function IllustratedTripMap({ stops, currentStopId, className }: { stops: IllustratedStop[]; currentStopId?: string | null; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(MAP_WIDTH);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setWidth(Math.max(240, Math.round(box.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const ordered = [...stops].sort((a, b) => a.sequence - b.sequence);
  const { pins, height, radius } = layoutPins(ordered.map((s) => ({ id: s.id, label: mapLabel(s.title), latitude: s.latitude, longitude: s.longitude })), width);
  const route = pins.map((p, index) => `${index === 0 ? 'M' : 'L'}${p.origin.x.toFixed(1)} ${p.origin.y.toFixed(1)}`).join('');
  const current = pins.find((p) => p.id === currentStopId);
  return (
    <div ref={boxRef} className={clsx('overflow-hidden rounded-xl border border-line bg-[#f7f3ea]', className)} data-testid="illustrated-map">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label="Illustrierte Karte mit den Stationen der Reise" className="block max-w-full">
        <g transform={`scale(${width / MAP_WIDTH})`}>
          <path d={OUTLINES.ocean} fill="#dcebf0" />
          <path d={OUTLINES.namibia} fill="#f1e5cf" stroke="#d9c7a6" strokeWidth="1.5" strokeLinejoin="round" />
          <path d={OUTLINES.botswana} fill="#eadfc4" stroke="#d9c7a6" strokeWidth="1.5" strokeLinejoin="round" />
          {COUNTRY_LABELS.map((c) => (
            <text key={c.text} x={c.x} y={c.y} textAnchor="middle" fontSize="26" fontWeight="600" letterSpacing="9" fill="#8a7a5c" opacity="0.28" aria-hidden>{c.text}</text>
          ))}
        </g>
        {pins.length > 1 && <path d={route} fill="none" stroke={ROUTE_COLOR} strokeWidth="3" strokeLinecap="round" strokeDasharray="0.5 8" aria-hidden />}
        {pins.map((p) => {
          const stop = ordered.find((s) => s.id === p.id)!;
          return <Pin key={p.id} placed={p} stop={stop} isCurrent={p.id === currentStopId} radius={radius} />;
        })}
        {current && <Vehicle x={current.pin.x} y={current.pin.y} radius={radius} />}
      </svg>
    </div>
  );
}
