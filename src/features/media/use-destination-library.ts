'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { prefetchLibraryImages, readCachedLibrary, refreshLibrary } from '@/lib/media/library';
import { imagesForStop, type DestinationImage, type StopImages } from '@/lib/media/places';
import type { TripStop } from '@/lib/domain/schemas';

/** The destination-image library: the last known copy at once (works offline), refreshed in the background when online. Live accounts only. */
export function useDestinationLibrary(): DestinationImage[] {
  const { isSupabase, online, authStatus } = useApp();
  const [library, setLibrary] = useState<DestinationImage[]>([]);

  useEffect(() => {
    if (!isSupabase) return;
    // Browser-only storage read after mount, so that the server render and the first client render agree.
    setLibrary(readCachedLibrary());
  }, [isSupabase]);

  useEffect(() => {
    if (!isSupabase || !online || authStatus !== 'ready') return;
    let isCancelled = false;
    void refreshLibrary().then((rows) => {
      if (isCancelled || !rows) return;
      setLibrary(rows);
      prefetchLibraryImages(rows);
    });
    return () => {
      isCancelled = true;
    };
  }, [isSupabase, online, authStatus]);

  return library;
}

export function useStopImages(stop: Pick<TripStop, 'title' | 'latitude' | 'longitude'> | undefined | null): StopImages {
  const library = useDestinationLibrary();
  if (!stop) return { hero: null, card: null, gallery: [] };
  return imagesForStop(stop, library);
}
