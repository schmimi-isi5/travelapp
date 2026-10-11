'use client';

import clsx from 'clsx';
import { Scene, type SceneName } from '@/components/scene';
import { useStopImages } from '@/features/media/use-destination-library';
import type { TripStop } from '@/lib/domain/schemas';
import { imageUrl, srcSetFor, type DestinationImage } from '@/lib/media/places';

const SRC_KEYS = { hero: ['mobile', 'tablet', 'desktop'], card: ['thumb', 'card'], gallery: ['thumb', 'full'] } as const;
const DEFAULT_SRC = { hero: 'desktop', card: 'card', gallery: 'full' } as const;

/** Photo from the destination library with srcset, stable dimensions and the descriptive alt text stored with the image. */
export function ResponsiveTravelImage({ image, kind, sizes, priority = false, className }: { image: DestinationImage; kind: keyof typeof SRC_KEYS; sizes: string; priority?: boolean; className?: string }) {
  const src = image.variants[DEFAULT_SRC[kind]] ?? Object.values(image.variants)[0];
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={imageUrl(src as string)} srcSet={srcSetFor(image, SRC_KEYS[kind])} sizes={sizes} width={image.width} height={image.height} alt={image.alt_text} loading={priority ? 'eager' : 'lazy'} decoding="async" fetchPriority={priority ? 'high' : 'auto'} className={clsx('h-full w-full object-cover', className)} />;
}

/** Small label for photos whose place is not proven by coordinates; credits are listed on the page "Bildnachweise", not under each photo. */
export function RegionMotifBadge({ image, className }: { image: DestinationImage; className?: string }) {
  if (image.location_verified) return null;
  return <span className={clsx('rounded bg-deep/80 px-1.5 py-0.5 text-xs font-semibold text-white', className)} data-testid="region-motif">Regionsmotiv</span>;
}

/** Full-bleed background for a stop: its hero photo with a readable overlay, or the vector illustration when there is none. */
export function DestinationHero({ stop, fallback, children, className, minHeight = 'min-h-[340px] md:min-h-[400px]' }: { stop: Pick<TripStop, 'title' | 'latitude' | 'longitude'> | null | undefined; fallback: SceneName; children?: React.ReactNode; className?: string; minHeight?: string }) {
  const { hero } = useStopImages(stop);
  return (
    <div className={clsx('relative flex flex-col overflow-hidden bg-deep', minHeight, className)} data-testid="destination-hero" data-image={hero ? 'photo' : 'illustration'}>
      <div className="absolute inset-0">
        {hero ? <ResponsiveTravelImage image={hero} kind="hero" sizes="100vw" priority /> : <Scene name={fallback} label="" />}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-deep via-deep/55 to-deep/10" aria-hidden />
      <div className="relative z-10 mt-auto">{children}</div>
      {hero && !hero.location_verified && <div className="relative z-10 px-4 pb-2 pt-1 text-right md:px-6"><RegionMotifBadge image={hero} /></div>}
    </div>
  );
}

/** Cover for list cards: the card photo, else the illustration. */
export function StopCover({ stop, fallback, label }: { stop: Pick<TripStop, 'title' | 'latitude' | 'longitude'>; fallback: SceneName; label: string }) {
  const { card, hero } = useStopImages(stop);
  const image = card ?? hero;
  if (!image) return <Scene name={fallback} label={label} />;
  return (
    <div className="relative h-full w-full" data-testid="stop-cover" data-image="photo">
      <ResponsiveTravelImage image={image} kind="card" sizes="(min-width: 640px) 160px, 112px" />
      {!image.location_verified && <span className="absolute bottom-1 left-1 rounded bg-deep/80 px-1.5 py-0.5 text-xs font-semibold text-white">Regionsmotiv</span>}
    </div>
  );
}

/**
 * Small regional picture for a stay. There are no photos of the lodges themselves (none with a verified licence), so this is
 * always labelled as a regional motif and never passed off as a photo of the accommodation.
 */
export function StayRegionThumb({ stop }: { stop: Pick<TripStop, 'title' | 'latitude' | 'longitude'> | null | undefined }) {
  const { card, hero } = useStopImages(stop);
  const image = card ?? hero;
  if (!image) return null;
  const path = image.variants.thumb ?? image.variants.card ?? Object.values(image.variants)[0];
  return (
    <div className="relative size-16 shrink-0 overflow-hidden rounded-md border border-line" data-testid="stay-region-thumb" title="Regionsmotiv, kein Foto der Unterkunft">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl(path as string)} alt={`Regionsmotiv: ${image.alt_text}`} width={64} height={64} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      <span className="absolute inset-x-0 bottom-0 bg-deep/80 px-1 text-center text-xs font-semibold leading-tight text-white">Region</span>
    </div>
  );
}
