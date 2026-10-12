'use client';

import clsx from 'clsx';
import { useApp } from '@/components/app-provider';
import { Card } from '@/components/ui';
import { AiSuggestion } from '@/features/ai/ai-suggest';
import { useStationWeather } from '@/features/tips/use-station-weather';
import { STATUS_TEXT } from '@/features/tips/weather-tile';
import { requestAi } from '@/lib/ai/client';
import { buildDayPlan } from '@/lib/domain/day-plan';
import type { ActionItem, Booking, Route, Stay, TripStop } from '@/lib/domain/schemas';

/** The briefing of a station: what is known about the day (weather, drive and daylight, stay, activities, tasks), plus an optional AI preview. */
export function DayBriefingCard({ stop, stopCount, previous, leg, stays, bookings, items }: { stop: TripStop; stopCount: number; previous: TripStop | null; leg: Route | undefined; stays: readonly Stay[]; bookings: readonly Booking[]; items: readonly ActionItem[] }) {
  const { today } = useApp();
  const { weather, status } = useStationWeather(stop);
  const days = weather?.days ?? [];
  const weatherDay = days.find((d) => d.date === today) ?? days[0];
  const plan = buildDayPlan({ stop, stopCount, previous, leg, stays, bookings, items, weatherDay, today });
  return (
    <Card data-testid="day-briefing">
      <h2 className="mb-2 text-lg font-bold">Tagesbriefing</h2>
      <dl className="space-y-2 text-[15px]">
        {plan.rows.map((row) => (
          <div key={row.key} className="grid gap-x-3 sm:grid-cols-[7rem_1fr]">
            <dt className="text-sm font-semibold text-muted">{row.label}</dt>
            <dd className={clsx(row.isAttention ? 'font-semibold text-ochre-700' : 'text-slate')}>{row.text}</dd>
          </div>
        ))}
        {!weatherDay && status !== 'ready' && (
          <div className="grid gap-x-3 sm:grid-cols-[7rem_1fr]"><dt className="text-sm font-semibold text-muted">Wetter</dt><dd className="text-slate" data-testid="briefing-weather-status">{STATUS_TEXT[status]}</dd></div>
        )}
      </dl>
      <AiSuggestion className="mt-4 border-t border-line pt-3" label="Tagesvorschau mit KI" testId="day-briefing-ai" run={() => requestAi({ task: 'day_briefing', input: { stopTitle: stop.title, facts: plan.facts } })} />
    </Card>
  );
}
