'use client';

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Card, Notice } from '@/components/ui';
import { requestAi, type AiOutcome } from '@/lib/ai/client';
import type { Stay, TripStop } from '@/lib/domain/schemas';
import { formatDate, formatDateTime } from '@/lib/formatting';
import { placeKeyForStop } from '@/lib/media/places';
import { accommodationKind, recommendForStation, summarizeWeather, type StayKind, type Tip, type TipCategory } from '@/lib/tips/recommend';
import type { WeatherDay } from '@/lib/weather/types';
import { useStationWeather, type WeatherStatus } from './use-station-weather';

const KIND_TEXT: Record<StayKind, string> = { camping: 'Camping', lodge: 'Lodge', tented: 'Zelt-Lodge', unknown: 'Unterkunft unbekannt' };
const CATEGORY_ORDER: TipCategory[] = ['Hitze & Wasser', 'Wetter & Kleidung', 'Schlafen & Unterkunft', 'Unterwegs', 'Tiere & Sicherheit', 'Gesundheit'];

function rainText(day: WeatherDay): string {
  if ((day.rainMm ?? 0) < 1 && (day.rainChance ?? 0) < 20) return 'trocken';
  return day.source === 'forecast' ? `Regen ${Math.round(day.rainChance ?? 0)} %${day.rainMm ? `, ${day.rainMm} mm` : ''}` : `Regen in ${Math.round(day.rainChance ?? 0)} % der Jahre`;
}

export function WeatherStrip({ days }: { days: readonly WeatherDay[] }) {
  return (
    <ul className="divide-y divide-line rounded-md border border-line bg-white text-sm" aria-label="Wetter an den Tagen der Station" data-testid="weather-days">
      {days.map((day) => (
        <li key={day.date} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2">
          <span className="w-28 font-semibold">{formatDate(day.date, { weekday: 'short', day: '2-digit', month: '2-digit' })}</span>
          <span className="tabular">{day.tmin !== null && day.tmax !== null ? `${Math.round(day.tmin)} bis ${Math.round(day.tmax)} °C` : 'Temperatur unbekannt'}</span>
          <span>{rainText(day)}</span>
          {day.windMax !== null && <span className="tabular">Wind {Math.round(day.windMax)} km/h</span>}
          {day.uvMax !== null && <span className="tabular">UV {day.uvMax.toFixed(0)}</span>}
          <Badge tone={day.source === 'forecast' ? 'info' : 'neutral'} className="ml-auto">{day.source === 'forecast' ? 'Vorhersage' : 'Durchschnitt'}</Badge>
        </li>
      ))}
    </ul>
  );
}

function statusNotice(status: WeatherStatus) {
  switch (status) {
    case 'unavailable_in_demo':
      return <Notice tone="info">Wetterdaten gibt es nur in der Live-Version. Die Hinweise zu Unterkunft und Ort gelten auch hier.</Notice>;
    case 'offline_without_data':
      return <Notice tone="warn">Du bist offline und für diese Station wurden noch keine Wetterdaten geladen. Sie erscheinen, sobald du online bist.</Notice>;
    case 'failed':
      return <Notice tone="warn">Das Wetter konnte gerade nicht geladen werden. Die Hinweise zu Unterkunft und Ort stehen trotzdem unten.</Notice>;
    case 'loading':
      return <p className="text-sm text-slate" aria-busy="true">Wetter wird geladen …</p>;
    default:
      return null;
  }
}

function TipList({ tips }: { tips: readonly Tip[] }) {
  const groups = CATEGORY_ORDER.map((category) => ({ category, items: tips.filter((t) => t.category === category) })).filter((g) => g.items.length > 0);
  return (
    <div className="space-y-4">
      {groups.map(({ category, items }) => (
        <section key={category} aria-label={category}>
          <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate">{category}</h3>
          <ul className="space-y-2">
            {items.map((tip) => (
              <li key={tip.id} className="rounded-md border border-line bg-white p-3" data-testid="station-tip" data-tip-id={tip.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{tip.title}</strong>
                  {tip.tone === 'warn' && <Badge tone="warn">Wichtig</Badge>}
                </div>
                <p className="mt-1 text-[15px] text-slate">{tip.text}</p>
                <p className="mt-1 text-xs text-muted" data-testid="tip-reason">{tip.reason}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function AiTailoring({ stop, kinds, days, tips }: { stop: TripStop; kinds: readonly StayKind[]; days: readonly WeatherDay[]; tips: readonly Tip[] }) {
  const [outcome, setOutcome] = useState<AiOutcome | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  async function ask() {
    setIsBusy(true);
    const summary = summarizeWeather(days);
    const facts = [
      `Station: ${stop.title} (${stop.country}), ${stop.arrive_at ?? 'Datum unbekannt'} bis ${stop.depart_at ?? 'unbekannt'}`,
      `Unterkunft: ${[...new Set(kinds)].map((k) => KIND_TEXT[k]).join(', ') || 'unbekannt'}`,
      ...(summary ? [`Wetter: ${summary.tmin ?? '?'} bis ${summary.tmax ?? '?'} Grad Celsius, Regenrisiko ${summary.rainChance ?? '?'} Prozent, Wind bis ${summary.windMax ?? '?'} km/h${summary.isClimateOnly ? ' (Durchschnitt, keine Vorhersage)' : ''}`] : []),
      `Bereits genannte Hinweise: ${tips.map((t) => t.title).join('; ')}`,
      'Reisegruppe: Familie mit drei Kindern (12, 14, 16 Jahre) und zwei Erwachsenen, Mietwagen, Selbstversorgung',
    ];
    setOutcome(await requestAi({ task: 'answer_question', input: { question: 'Nenne fünf kurze, konkrete Tipps für diesen Aufenthalt, zugeschnitten auf die genannten Fakten. Nenne nur Dinge, die du sicher weißt, und sage, was vor Ort geprüft werden muss.', facts } }));
    setIsBusy(false);
  }
  return (
    <div className="mt-4 border-t border-line pt-3">
      <Button size="sm" variant="secondary" disabled={isBusy} onClick={() => void ask()}><Sparkles size={14} aria-hidden /> {isBusy ? 'Wird erstellt …' : 'Mit KI auf unsere Reise zuschneiden'}</Button>
      {outcome && outcome.result.origin === 'ai_generated' && (
        <div className="mt-3 rounded-md bg-sand-50 p-3 text-sm" data-testid="station-ai">
          <Badge tone="ai">KI-Entwurf ({outcome.result.provider})</Badge>
          <p className="mt-2 whitespace-pre-line">{outcome.result.text}</p>
          <p className="mt-2 text-xs text-muted">{outcome.result.availability_note}</p>
        </div>
      )}
      {outcome?.fallbackReason && <div className="mt-3"><Notice tone="info">{outcome.fallbackReason}</Notice></div>}
    </div>
  );
}

/** Weather and tips for a station, matched to the booked accommodation type. */
export function StationRecommendations({ stop, stays }: { stop: TripStop; stays: readonly Stay[] }) {
  const { weather, isStale, status } = useStationWeather(stop);
  const kinds = stays.map(accommodationKind);
  const label = stop.title.split('/').pop()?.trim() ?? stop.title;
  const days = weather?.days ?? [];
  const tips = recommendForStation({ placeKey: placeKeyForStop(stop.title), placeLabel: label, stayKinds: kinds, weather: days.length ? days : null });
  const known = [...new Set(kinds)].filter((k) => k !== 'unknown');
  return (
    <Card data-testid="station-recommendations">
      <h2 className="text-lg font-bold">Empfehlungen für diese Station</h2>
      <p className="mb-3 text-sm text-slate">
        Angepasst an {known.length ? `deine Unterkunft (${known.map((k) => KIND_TEXT[k]).join(', ')})` : 'den Ort'} und das Wetter an den Tagen vor Ort.
      </p>
      {statusNotice(status)}
      {days.length > 0 && (
        <div className="mb-4 space-y-1">
          <WeatherStrip days={days} />
          <p className="text-xs text-muted">
            {weather?.attribution} · Stand {formatDateTime(weather?.fetchedAt)}
            {isStale && ' (ältere Daten, aktualisiert sich online)'}
            {days.some((d) => d.source === 'climate') && ` · „Durchschnitt“ = Mittel dieser Tage in den Jahren ${weather?.climateYears[0]} bis ${weather?.climateYears[weather.climateYears.length - 1]}, keine Vorhersage`}
          </p>
        </div>
      )}
      {tips.length > 0 ? <TipList tips={tips} /> : <p className="text-slate">Für diese Station liegen noch keine Hinweise vor.</p>}
      <p className="mt-4 text-xs text-muted">Regelbasierte Empfehlungen aus Wetter, Unterkunftsart und Ort, keine Gewähr. Öffnungszeiten, Regeln und Gesundheitsfragen vor Ort und bei offiziellen Stellen prüfen.</p>
      {status !== 'unavailable_in_demo' && <AiTailoring stop={stop} kinds={kinds} days={days} tips={tips} />}
    </Card>
  );
}

/** Short version for the dashboard: the day's weather and the most important tips of the current or next station. */
export function StationTipsSummary({ stop, stays }: { stop: TripStop; stays: readonly Stay[] }) {
  const { weather, status } = useStationWeather(stop);
  const kinds = stays.map(accommodationKind);
  const days = weather?.days ?? [];
  const tips = recommendForStation({ placeKey: placeKeyForStop(stop.title), placeLabel: stop.title, stayKinds: kinds, weather: days.length ? days : null }).slice(0, 3);
  return (
    <Card data-testid="dashboard-tips">
      <h2 className="mb-1 text-lg font-bold">Tipps für {stop.title.split('/').pop()?.trim()}</h2>
      {days[0] && <p className="mb-2 text-sm text-slate tabular">{formatDate(days[0].date, { weekday: 'short', day: '2-digit', month: '2-digit' })}: {days[0].tmin !== null && days[0].tmax !== null ? `${Math.round(days[0].tmin)} bis ${Math.round(days[0].tmax)} °C, ` : ''}{rainText(days[0])} ({days[0].source === 'forecast' ? 'Vorhersage' : 'Durchschnitt'})</p>}
      {!days[0] && status === 'loading' && <p className="mb-2 text-sm text-slate">Wetter wird geladen …</p>}
      <ul className="space-y-2">
        {tips.map((tip) => (
          <li key={tip.id} className="text-[15px]"><strong>{tip.title}:</strong> <span className="text-slate">{tip.text.split('. ')[0]}.</span></li>
        ))}
        {tips.length === 0 && <li className="text-slate">Noch keine Hinweise.</li>}
      </ul>
      <a href={`/route/${stop.id}`} className="mt-3 inline-block font-semibold text-deep underline">Alle Empfehlungen</a>
    </Card>
  );
}
