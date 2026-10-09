'use client';

import { Film, Heart, Mic } from 'lucide-react';
import { Scene, sceneNameFromPath } from '@/components/scene';
import type { MediaAsset } from '@/lib/domain/schemas';
import { useMediaUrl } from './use-media-url';

/** Visual body of a media asset: illustration, local image, video or audio player. */
export function MediaBody({ asset, className = '', controls = false }: { asset: MediaAsset; className?: string; controls?: boolean }) {
  const url = useMediaUrl(asset);
  const scene = sceneNameFromPath(asset.storage_path);
  const label = asset.caption || asset.original_name || 'Medium';
  if (scene) return <Scene name={scene} label={label} className={className} />;
  if (asset.kind === 'photo') {
    // eslint-disable-next-line @next/next/no-img-element
    return url ? <img src={url} alt={label} loading="lazy" className={`h-full w-full object-cover ${className}`} /> : <div className="grid h-full place-items-center bg-sand text-sm text-slate">Lädt …</div>;
  }
  if (asset.kind === 'video') {
    return url ? <video src={url} controls={controls} preload="metadata" aria-label={label} className={`h-full w-full object-cover ${className}`} /> : <div className="grid h-full place-items-center bg-sand"><Film aria-hidden /></div>;
  }
  return (
    <div className="grid h-full w-full place-items-center bg-deep-50 p-3">
      <div className="text-center">
        <Mic aria-hidden className="mx-auto text-deep" />
        {url && <audio src={url} controls aria-label={label} className="mt-2 w-full max-w-xs" />}
      </div>
    </div>
  );
}

export function FavoriteMark({ active }: { active: boolean }) {
  return active ? <Heart size={16} aria-label="Favorit" className="fill-clay text-clay" /> : null;
}
