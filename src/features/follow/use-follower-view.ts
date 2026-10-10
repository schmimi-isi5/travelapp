'use client';

import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { getLocalDb } from '@/lib/db/local';
import { buildFollowerView, type FollowerView } from '@/lib/follow/view';
import type { Entity, EntityName, MediaAsset } from '@/lib/domain/schemas';

export const DEMO_FOLLOW_TOKEN = 'demo';
const REFRESH_MS = 5 * 60_000;

export type FollowerState =
  | { status: 'loading' }
  | { status: 'ready'; view: FollowerView; demoAssets: Map<string, MediaAsset> | null; isRefreshing: boolean; refreshFailed: boolean }
  | { status: 'invalid' }
  | { status: 'error'; message: string };

/** Preview for the demo mode: the same projection as the server, fed from the local database. */
async function loadDemoView(today: string): Promise<{ view: FollowerView; assets: Map<string, MediaAsset> }> {
  const db = getLocalDb();
  const all = async <K extends EntityName>(name: K) => (await db.entity(name).toArray()) as unknown as Entity<K>[];
  const [trips, stops, entries, media, sightings, members, species] = await Promise.all([
    all('trips'),
    all('trip_stops'),
    all('journal_entries'),
    all('media_assets'),
    all('wildlife_sightings'),
    all('members'),
    all('wildlife_species'),
  ]);
  const trip = trips[0];
  if (!trip) throw new Error('Keine Reise vorhanden.');
  const view = buildFollowerView({
    trip,
    stops: stops.filter((s) => s.trip_id === trip.id),
    entries: entries.filter((e) => e.trip_id === trip.id),
    media: media.filter((m) => m.trip_id === trip.id),
    sightings: sightings.filter((s) => s.trip_id === trip.id),
    authorNames: Object.fromEntries(members.map((m) => [m.id, m.display_name])),
    speciesNames: Object.fromEntries(species.map((s) => [s.id, s.common_name_de])),
    today,
    generatedAt: new Date().toISOString(),
  });
  return { view, assets: new Map(media.map((m) => [m.id, m])) };
}

/** Loads the follower view for a link token (server) or the demo preview, and refreshes it every few minutes. */
export function useFollowerView(token: string): FollowerState & { reload: () => void } {
  const { isSupabase, ready, today } = useApp();
  const [state, setState] = useState<FollowerState>({ status: 'loading' });
  const [reloadCount, setReloadCount] = useState(0);
  const reload = useCallback(() => setReloadCount((n) => n + 1), []);

  useEffect(() => {
    const isDemo = token === DEMO_FOLLOW_TOKEN;
    if (isDemo && (isSupabase || !ready)) {
      if (isSupabase) setState({ status: 'invalid' });
      return;
    }
    let isCancelled = false;
    async function load() {
      setState((prev) => (prev.status === 'ready' ? { ...prev, isRefreshing: true } : prev));
      try {
        if (isDemo) {
          const { view, assets } = await loadDemoView(today);
          if (!isCancelled) setState({ status: 'ready', view, demoAssets: assets, isRefreshing: false, refreshFailed: false });
          return;
        }
        const res = await fetch(`/api/follow/${encodeURIComponent(token)}`, { cache: 'no-store' });
        if (isCancelled) return;
        if (res.status === 404) return setState({ status: 'invalid' });
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? `Fehler ${res.status}`);
        const view = (await res.json()) as FollowerView;
        setState({ status: 'ready', view, demoAssets: null, isRefreshing: false, refreshFailed: false });
      } catch (cause) {
        if (isCancelled) return;
        const message = cause instanceof TypeError ? 'Keine Verbindung. Bitte später erneut versuchen.' : cause instanceof Error ? cause.message : 'Unbekannter Fehler.';
        setState((prev) => (prev.status === 'ready' ? { ...prev, isRefreshing: false, refreshFailed: true } : { status: 'error', message }));
      }
    }
    void load();
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS);
    return () => {
      isCancelled = true;
      window.clearInterval(timer);
    };
  }, [token, isSupabase, ready, today, reloadCount]);

  return { ...state, reload };
}
