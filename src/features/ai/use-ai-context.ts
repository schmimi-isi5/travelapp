'use client';

import { useApp } from '@/components/app-provider';
import { useStationWeather } from '@/features/tips/use-station-weather';
import { useTable } from '@/lib/db/hooks';
import { buildDayBriefing } from '@/lib/domain/trip-day';
import { formatDate } from '@/lib/formatting';
import { accommodationKind, summarizeWeather, type StayKind } from '@/lib/tips/recommend';

const KIND_TEXT: Record<StayKind, string> = { camping: 'Camping', lodge: 'Lodge', tented: 'Zelt-Lodge', unknown: 'unbekannt' };

/**
 * What the optional AI may know about the situation, as plain sentences: date, current or next station, accommodation type,
 * weather and the size of the group. No names, no money, no documents, no free text of the family.
 */
export function useAiContext(): { facts: string[]; stopTitle: string | null } {
  const { today, members } = useApp();
  const stops = useTable('trip_stops').rows;
  const stays = useTable('stays').rows;
  const items = useTable('action_items').rows;
  const briefing = buildDayBriefing(stops, items, today);
  const stop = briefing.currentStop ?? briefing.featuredStop;
  const { weather } = useStationWeather(stop);
  const facts: string[] = [`Heute ist der ${formatDate(today)}.`];
  if (stop) {
    const phase = briefing.phase === 'during' ? 'Aktuelle Station' : briefing.phase === 'before' ? 'Nächste Station' : 'Letzte Station';
    facts.push(`${phase}: ${stop.title} (${stop.country})${stop.arrive_at ? `, ${formatDate(stop.arrive_at)}${stop.depart_at ? ` bis ${formatDate(stop.depart_at)}` : ''}` : ''}.`);
    const kinds = [...new Set(stays.filter((s) => s.stop_id === stop.id).map(accommodationKind))].filter((k) => k !== 'unknown');
    if (kinds.length) facts.push(`Unterkunft an dieser Station: ${kinds.map((k) => KIND_TEXT[k]).join(', ')}.`);
    const summary = summarizeWeather(weather?.days ?? []);
    if (summary) facts.push(`Wetter an der Station: ${summary.tmin ?? '?'} bis ${summary.tmax ?? '?'} Grad Celsius, Regenrisiko ${summary.rainChance ?? '?'} Prozent${summary.isClimateOnly ? ' (Durchschnitt, keine Vorhersage)' : ' (Vorhersage)'}.`);
  }
  const active = members.filter((m) => m.status === 'active');
  const adults = active.filter((m) => m.role === 'owner' || m.role === 'adult').length;
  if (active.length > 0) facts.push(`Reisegruppe: ${adults} Erwachsene und ${active.length - adults} Kinder bzw. Jugendliche, Mietwagen, Selbstversorgung.`);
  return { facts, stopTitle: stop?.title ?? null };
}
