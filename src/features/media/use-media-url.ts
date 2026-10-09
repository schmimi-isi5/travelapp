'use client';

import { useEffect, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { resolveMediaUrl } from '@/lib/db/media';
import type { MediaAsset } from '@/lib/domain/schemas';

/** Resolves an object URL for locally stored media; scene illustrations need no URL. */
export function useMediaUrl(asset: Pick<MediaAsset, 'id' | 'storage_path'>): string | null {
  const { remote, online } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (asset.storage_path.startsWith('scene:')) return;
    void resolveMediaUrl(asset, online ? remote : undefined).then((u) => active && setUrl(u));
    return () => {
      active = false;
    };
  }, [asset, remote, online]);
  return url;
}
