/**
 * Matching of trip stops to the destination-image library. Mirrors the place derivation of the import pipeline
 * (scripts/destination-images/lib.mjs); tests/unit/destination-images-lib.test.ts keeps both in step.
 */
import type { TripStop } from '@/lib/domain/schemas';

export type ImageRole = 'hero' | 'card' | 'gallery';

export interface DestinationImage {
  id: string;
  place_key: string;
  place_label: string;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_km: number;
  role: ImageRole;
  variants: Partial<Record<'desktop' | 'tablet' | 'mobile' | 'card' | 'full' | 'thumb', string>>;
  width: number;
  height: number;
  alt_text: string;
  source_provider: string;
  source_url: string;
  photographer: string | null;
  license_type: string;
  license_url: string | null;
  attribution_text: string;
  location_verified: boolean;
}

const GENERIC = new Set(['wüste', 'gebirge', 'nationalpark', 'ocean', 'süd', 'ost', 'nord', 'west', 'camp', 'lodge', 'campsite']);

function slugify(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** "Namib Wüste / Sossusvlei" -> "sossusvlei"; "Etosha Nationalpark (Süd)" -> "etosha"; "Swakopmund Ocean" -> "swakopmund". */
export function placeKeyForStop(title: string): string {
  const parts = title.split('/').map((p) => p.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
  const cleaned = parts.map((p) => p.split(' ').filter((w) => !GENERIC.has(w.toLowerCase())).join(' ').trim()).filter(Boolean);
  return slugify(cleaned[cleaned.length - 1] ?? parts[parts.length - 1] ?? title);
}

function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface StopImages {
  hero: DestinationImage | null;
  card: DestinationImage | null;
  gallery: DestinationImage[];
}

const NONE: StopImages = { hero: null, card: null, gallery: [] };

/** The library images of a stop: same place key first, otherwise the nearest place whose radius covers the stop. */
export function imagesForStop(stop: Pick<TripStop, 'title' | 'latitude' | 'longitude'>, library: readonly DestinationImage[]): StopImages {
  if (library.length === 0) return NONE;
  const key = placeKeyForStop(stop.title);
  let candidates = library.filter((image) => image.place_key === key);
  if (candidates.length === 0 && stop.latitude !== null && stop.longitude !== null) {
    let best: { key: string; distance: number } | null = null;
    for (const image of library) {
      if (image.latitude === null || image.longitude === null) continue;
      const distance = distanceKm(stop.latitude, stop.longitude, image.latitude, image.longitude);
      if (distance <= image.radius_km && (!best || distance < best.distance)) best = { key: image.place_key, distance };
    }
    if (best) candidates = library.filter((image) => image.place_key === best.key);
  }
  if (candidates.length === 0) return NONE;
  // verified locations first, so that a place-authentic photo always wins over a regional motif
  const ordered = [...candidates].sort((a, b) => Number(b.location_verified) - Number(a.location_verified));
  return { hero: ordered.find((i) => i.role === 'hero') ?? null, card: ordered.find((i) => i.role === 'card') ?? null, gallery: ordered.filter((i) => i.role === 'gallery') };
}

export const VARIANT_WIDTH = { desktop: 1920, tablet: 1200, mobile: 800, card: 800, full: 1200, thumb: 320 } as const;

export const imageUrl = (path: string): string => `/media/destination/${path}`;

/** srcset over the variants that exist, widest last. */
export function srcSetFor(image: DestinationImage, keys: readonly (keyof typeof VARIANT_WIDTH)[]): string {
  return keys
    .filter((key) => image.variants[key])
    .map((key) => `${imageUrl(image.variants[key] as string)} ${VARIANT_WIDTH[key]}w`)
    .join(', ');
}
