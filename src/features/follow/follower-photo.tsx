'use client';

import clsx from 'clsx';
import { useState } from 'react';
import { Scene, sceneNameFromPath } from '@/components/scene';
import type { MediaAsset } from '@/lib/domain/schemas';
import { photoSrcSet, photoUrl, type FollowerPhotoData } from './photo-url';

export type DemoAssets = Map<string, MediaAsset> | null;

/**
 * One published photo. In the demo preview the photos are our own illustrations; otherwise the server delivers a re-encoded JPEG
 * (no metadata). A sand-coloured box with a fixed ratio holds the place while it loads, so nothing jumps.
 */
export function FollowerPhoto({ photo, token, demoAssets, sizes, className, isEager }: { photo: FollowerPhotoData; token: string; demoAssets: DemoAssets; sizes?: string; className?: string; isEager?: boolean }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const label = photo.caption || 'Foto von unserer Reise';
  const asset = demoAssets?.get(photo.id);
  const scene = asset ? sceneNameFromPath(asset.storage_path) : null;
  if (scene) return <Scene name={scene} label={label} className={clsx('h-full w-full', className)} />;
  return (
    // the pictures come from our own API as re-encoded JPEGs of several widths; next/image would only add a second conversion
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoUrl(token, photo.id, 960)}
      srcSet={photoSrcSet(token, photo.id)}
      sizes={sizes ?? '(min-width: 768px) 33vw, 50vw'}
      alt={label}
      loading={isEager ? 'eager' : 'lazy'}
      decoding="async"
      onLoad={() => setIsLoaded(true)}
      className={clsx('h-full w-full bg-sand object-cover motion-safe:transition-opacity motion-safe:duration-300', isLoaded ? 'opacity-100' : 'opacity-0', className)}
    />
  );
}
