'use client';

import { CloudRain, Sun, Sunrise, Sunset } from 'lucide-react';
import Link from 'next/link';
import { Card } from '@/components/ui';
import type { Stay, TripStop } from '@/lib/domain/schemas';
import { formatDate } from '@/lib/formatting';
import { placeKeyForStop } from '@/lib/media/places';
import { accommodationKind, recommendForStation } from '@/lib/tips/recommend';
import type { WeatherDay } from '@/lib/weather/types';
import { rainText } from './station-recommendations';
import { useStationWeather, type WeatherStatus } from './use-station-weather';

const MAX_MORE_TIPS = 4;

export const STATUS_TEXT: Record<Exclude<WeatherStatus, 'ready'>, string> = {
  unavailable_in_demo: 'Wetterdaten gibt es nur in der Live-Version.',
  no_period: 'Für diese Station fehlen die Reisedaten, daher gibt es noch kein Wetter.',
  loading: 'Wetter wird geladen …',
  offline_without_data: 'Offline: Das Wetter erscheint, sobald du online bist.',
  failed: 'Das Wetter konnte gerade nicht geladen werden.',
};

const timeOf = (iso: string | null) => (iso && iso.length >= 16 ? iso.slice(11, 16) : null);

/** First sentence of a tip text, without a doubled full stop. */
export function firstSentence(text: string): string {
  const sentence = text.split('. ')[0] ?? text;
  return sentence.replace(/\.+$/, '') + '.';
}

function dayHeading(day: WeatherDay, today: string): string {
  const short = formatDate(day.date, { day: 'numeric', month: 'short' });
  return day.date === today ? `Heute, ${short}` : `${formatDate(day.date, { weekday: 'short' })}, ${short}`;
}

/** Compact weather tile for the dashboard: the station's first day, sun times, and the remaining tips folded away. */
export function WeatherTile({ stop, stays, today }: { stop: TripStop; stays: readonly Stay[]; today: string }) {
  const { weather, status } = useStationWeather(stop);
  const days = weather?.days ?? [];
  const day = days.find((d) => d.date === today) ?? days[0];
  const label = stop.title.split('/').pop()?.trim() ?? stop.title;
  const tips = recommendForStation({ placeKey: placeKeyForStop(stop.title), placeLabel: label, stayKinds: stays.map(accommodationKind), weather: days.length ? days : null });
  const isDry = day ? (day.rainMm ?? 0) < 1 && (day.rainChance ?? 0) < 20 : true;
  const sunrise = timeOf(day?.sunrise ?? null);
  const sunset = timeOf(day?.sunset ?? null);

  return (
    <Card data-testid="dashboard-tips" className="flex h-full flex-col gap-3">
      <div>
        <h2 className="font-display text-xl font-bold md:text-2xl">{label}</h2>
        {day && <p className="text-sm text-slate">{dayHeading(day, today)}</p>}
      </div>
      {day ? (
        <>
          <div className="flex items-center gap-3">
            {isDry ? <Sun size={44} aria-hidden className="shrink-0 text-gold-500" /> : <CloudRain size={44} aria-hidden className="shrink-0 text-teal-700" />}
            <div>
              <p className="text-3xl font-bold tabular">{day.tmax !== null ? `${Math.round(day.tmax)} °C` : 'unbekannt'}</p>
              <p className="text-sm text-slate">
                {rainText(day).replace(/^./, (c) => c.toUpperCase())}
                {day.tmin !== null && ` · nachts ${Math.round(day.tmin)} °C`}
              </p>
            </div>
          </div>
          {(sunrise || sunset) && (
            <dl className="space-y-2 border-t border-line pt-3 text-sm">
              {sunrise && <div className="flex items-center gap-2"><Sunrise size={20} aria-hidden className="shrink-0 text-gold-700" /><dt className="text-slate">Sonnenaufgang</dt><dd className="ml-auto font-semibold tabular">{sunrise}</dd></div>}
              {sunset && <div className="flex items-center gap-2"><Sunset size={20} aria-hidden className="shrink-0 text-clay-500" /><dt className="text-slate">Sonnenuntergang</dt><dd className="ml-auto font-semibold tabular">{sunset}</dd></div>}
            </dl>
          )}
          <p className="text-xs text-muted">{day.source === 'forecast' ? 'Vorhersage' : 'Durchschnitt der letzten Jahre, keine Vorhersage'}</p>
        </>
      ) : (
        status !== 'ready' && <p className="text-sm text-slate" aria-busy={status === 'loading'}>{STATUS_TEXT[status]}</p>
      )}
      {tips.length > 0 && (
        <details className="mt-auto border-t border-line pt-3 text-sm">
          <summary className="min-h-11 cursor-pointer font-semibold text-deep">Mehr Tipps ({Math.min(tips.length, MAX_MORE_TIPS)})</summary>
          <ul className="mt-2 space-y-2">
            {tips.slice(0, MAX_MORE_TIPS).map((tip) => (
              <li key={tip.id}><strong>{tip.title}:</strong> <span className="text-slate">{firstSentence(tip.text)}</span></li>
            ))}
          </ul>
          <Link href={`/route/${stop.id}`} className="mt-2 inline-block font-semibold text-deep underline">Alle Empfehlungen</Link>
        </details>
      )}
    </Card>
  );
}
