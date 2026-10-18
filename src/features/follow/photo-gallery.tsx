'use client';

import clsx from 'clsx';
import { Archive } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui';
import { FollowerPhoto, type DemoAssets } from './follower-photo';
import { PhotoLightbox } from './photo-lightbox';
import { photoFileName, photoUrl, type FollowerPhotoData } from './photo-url';

const MAX_ZIP_PHOTOS = 150;

async function zipAll(photos: readonly FollowerPhotoData[], token: string, onProgress: (done: number) => void): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  let done = 0;
  for (const photo of photos) {
    const response = await fetch(photoUrl(token, photo.id, 2400));
    if (!response.ok) throw new Error('Ein Foto konnte nicht geladen werden.');
    zip.file(photoFileName(photo), await response.blob());
    done += 1;
    onProgress(done);
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'Namibia-Botswana-Fotos.zip';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** The photo section: filter by place, big pictures, full-screen view and saving. */
export function PhotoGallery({ photos, token, demoAssets, newIds }: { photos: readonly FollowerPhotoData[]; token: string; demoAssets: DemoAssets; newIds: ReadonlySet<string> }) {
  const [stop, setStop] = useState<string>('all');
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [zipProgress, setZipProgress] = useState<number | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const places = useMemo(() => [...new Set(photos.map((p) => p.stop).filter((s): s is string => Boolean(s)))], [photos]);
  const visible = stop === 'all' ? photos : photos.filter((p) => p.stop === stop);
  const isFew = visible.length <= 2;
  const isDemo = demoAssets !== null;
  const canZip = !isDemo && photos.length > 1 && photos.length <= MAX_ZIP_PHOTOS;

  async function downloadAll() {
    setZipError(null);
    setZipProgress(0);
    try {
      await zipAll(photos, token, setZipProgress);
    } catch (cause) {
      setZipError(cause instanceof Error ? `${cause.message} Bitte später noch einmal versuchen.` : 'Das Paket konnte nicht erstellt werden.');
    } finally {
      setZipProgress(null);
    }
  }

  return (
    <div>
      {places.length > 1 && (
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Fotos nach Ort filtern">
          {['all', ...places].map((place) => (
            <button key={place} type="button" aria-pressed={stop === place} onClick={() => setStop(place)} className={clsx('min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold', stop === place ? 'border-deep bg-deep text-white' : 'border-line bg-white text-deep')}>
              {place === 'all' ? `Alle (${photos.length})` : `${place} (${photos.filter((p) => p.stop === place).length})`}
            </button>
          ))}
        </div>
      )}
      <ul className={clsx('-mx-4 grid gap-1.5 sm:mx-0 sm:gap-2', isFew ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:auto-rows-[11rem] sm:grid-cols-3 lg:auto-rows-[12rem] lg:grid-cols-4')} data-testid="photo-grid">
        {visible.map((photo, i) => (
          <li key={photo.id} className={clsx('relative overflow-hidden bg-sand sm:rounded-xl', isFew ? 'aspect-[4/3]' : i === 0 && stop === 'all' ? 'col-span-2 aspect-[16/10] sm:col-span-2 sm:row-span-2 sm:aspect-auto' : 'aspect-square sm:aspect-auto')}>
            <button type="button" onClick={() => setOpenIndex(i)} aria-label={`Foto öffnen: ${photo.caption || 'ohne Beschriftung'}`} className="group block h-full w-full">
              <FollowerPhoto photo={photo} token={token} demoAssets={demoAssets} sizes={i === 0 ? '(min-width: 768px) 66vw, 100vw' : '(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw'} className="motion-safe:transition-transform motion-safe:duration-300 group-hover:scale-[1.03]" isEager={i < 2} />
              {(photo.caption || photo.stop) && (
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-teal-950/80 to-transparent px-3 pb-2 pt-8 text-left text-xs font-semibold text-white">
                  {photo.caption || photo.stop}
                </span>
              )}
            </button>
            {newIds.has(photo.id) && <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-clay-strong px-2 py-0.5 text-xs font-bold text-white">Neu</span>}
          </li>
        ))}
      </ul>
      {canZip && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="secondary" onClick={() => void downloadAll()} disabled={zipProgress !== null}>
            <Archive size={16} aria-hidden /> {zipProgress !== null ? `Wird gepackt: ${zipProgress} von ${photos.length}` : `Alle ${photos.length} Fotos herunterladen (ZIP)`}
          </Button>
          <p className="text-xs text-muted">Die Fotos kommen in guter Qualität ohne Standortdaten. Bei vielen Fotos geht es am Computer am schnellsten.</p>
        </div>
      )}
      {zipError && <p role="alert" className="mt-2 text-sm text-danger">{zipError}</p>}
      <PhotoLightbox photos={visible} index={openIndex} token={token} demoAssets={demoAssets} onClose={() => setOpenIndex(null)} onIndexChange={setOpenIndex} />
    </div>
  );
}
