'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-provider';
import type { TripStop } from '@/lib/domain/schemas';
import { cachedWeather, periodFor, refreshWeather } from '@/lib/weather/client';
import type { WeatherResult } from '@/lib/weather/types';

type StopForWeather = Pick<TripStop, 'id' | 'latitude' | 'longitude' | 'arrive_at' | 'depart_at'>;
export type WeatherStatus = 'unavailable_in_demo' | 'no_period' | 'loading' | 'ready' | 'offline_without_data' | 'failed';

/** Weather of a station: the last copy on the device at once, refreshed when online (live accounts only). */
export function useStationWeather(stop: StopForWeather | null | undefined): { weather: WeatherResult | null; isStale: boolean; status: WeatherStatus } {
  const { isSupabase, online, authStatus } = useApp();
  const [state, setState] = useState<{ weather: WeatherResult | null; isStale: boolean; failed: boolean }>({ weather: null, isStale: false, failed: false });
  const stopKey = stop ? `${stop.id}|${stop.latitude}|${stop.longitude}|${stop.arrive_at}|${stop.depart_at}` : '';

  useEffect(() => {
    if (!isSupabase || !stop || !periodFor(stop)) return;
    const cached = cachedWeather(stop);
    // Device storage can only be read in the browser, after mount.
    setState({ weather: cached?.result ?? null, isStale: cached?.isStale ?? false, failed: false });
    if (!online || authStatus !== 'ready') return;
    let isCancelled = false;
    void refreshWeather(stop).then((result) => {
      if (isCancelled) return;
      if (result) setState({ weather: result, isStale: false, failed: false });
      else setState((previous) => ({ ...previous, failed: true }));
    });
    return () => {
      isCancelled = true;
    };
    // stopKey covers every stop field the request depends on
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupabase, online, authStatus, stopKey]);

  if (!isSupabase) return { weather: null, isStale: false, status: 'unavailable_in_demo' };
  if (!stop || !periodFor(stop)) return { weather: null, isStale: false, status: 'no_period' };
  if (state.weather) return { weather: state.weather, isStale: state.isStale, status: 'ready' };
  if (!online) return { weather: null, isStale: false, status: 'offline_without_data' };
  return { weather: null, isStale: false, status: state.failed ? 'failed' : 'loading' };
}
