'use client';

import { ChevronLeft, ChevronRight, Download, Share2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Scene, sceneNameFromPath } from '@/components/scene';
import { formatDateTime } from '@/lib/formatting';
import { canShareFiles, photoFileName, photoUrl, type FollowerPhotoData } from './photo-url';
import type { DemoAssets } from './follower-photo';

const SWIPE_PX = 50;
const DOUBLE_TAP_MS = 320;

/**
 * Full-screen view of the published photos: swipe or arrow keys to move on, double tap or button to zoom, save or share the picture.
 * A native <dialog> keeps focus inside and closes with Escape; the page below does not scroll while it is open.
 */
export function PhotoLightbox({ photos, index, token, demoAssets, onClose, onIndexChange }: { photos: readonly FollowerPhotoData[]; index: number | null; token: string; demoAssets: DemoAssets; onClose: () => void; onIndexChange: (index: number) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const lastTap = useRef(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const isOpen = index !== null;
  const photo = index !== null ? photos[index] : undefined;
  const scene = photo && demoAssets?.get(photo.id) ? sceneNameFromPath(demoAssets.get(photo.id)!.storage_path) : null;

  const go = useCallback((delta: number) => {
    if (index === null || photos.length === 0) return;
    setIsZoomed(false);
    setNote(null);
    onIndexChange((index + delta + photos.length) % photos.length);
  }, [index, photos.length, onIndexChange]);

  useEffect(() => setCanShare(canShareFiles()), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, go]);

  // the neighbours are loaded already, so the next swipe shows a picture at once
  useEffect(() => {
    if (index === null || scene) return;
    for (const delta of [1, -1]) {
      const next = photos[(index + delta + photos.length) % photos.length];
      if (next && !demoAssets?.has(next.id)) new Image().src = photoUrl(token, next.id, 1600);
    }
  }, [index, photos, token, demoAssets, scene]);

  async function share() {
    if (!photo) return;
    try {
      const blob = await (await fetch(photoUrl(token, photo.id, 2400))).blob();
      const file = new File([blob], photoFileName(photo), { type: 'image/jpeg' });
      await navigator.share({ files: [file], title: photo.caption || 'Foto von unserer Reise' });
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) setNote('Teilen hat nicht geklappt. Bitte „Herunterladen“ nutzen.');
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    start.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e: React.PointerEvent) {
    const from = start.current;
    start.current = null;
    if (!from) return;
    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;
    if (!isZoomed && Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.5) return go(dx < 0 ? 1 : -1);
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const now = Date.now();
      if (now - lastTap.current < DOUBLE_TAP_MS) setIsZoomed((z) => !z);
      lastTap.current = now;
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label={photo?.caption || 'Foto'}
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-dvw max-w-none border-0 bg-transparent p-0 text-white backdrop:bg-black/95"
      data-testid="lightbox"
    >
      {isOpen && photo && index !== null && (
        <div className="flex h-dvh flex-col bg-teal-950">
          <div className="flex items-center justify-between gap-2 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <p className="px-2 text-sm font-semibold" aria-live="polite" data-testid="lightbox-counter">{index + 1} von {photos.length}</p>
            <button type="button" onClick={onClose} aria-label="Schließen" className="grid size-12 place-items-center rounded-full hover:bg-white/10"><X size={24} aria-hidden /></button>
          </div>

          <div className="relative min-h-0 flex-1" onPointerDown={onPointerDown} onPointerUp={onPointerUp} style={{ touchAction: isZoomed ? 'auto' : 'pan-y' }}>
            <div className={isZoomed ? 'h-full overflow-auto' : 'grid h-full place-items-center overflow-hidden px-2'}>
              {scene ? (
                <div className="aspect-[4/3] w-full max-w-3xl overflow-hidden rounded-lg"><Scene name={scene} label={photo.caption || 'Illustration'} className="h-full w-full" /></div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={photo.id}
                  src={photoUrl(token, photo.id, isZoomed ? 2400 : 1600)}
                  alt={photo.caption || 'Foto von unserer Reise'}
                  draggable={false}
                  className={isZoomed ? 'max-w-none select-none' : 'max-h-full max-w-full select-none object-contain'}
                  style={isZoomed ? { width: '220%' } : undefined}
                />
              )}
            </div>
            {photos.length > 1 && !isZoomed && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label="Vorheriges Foto" className="absolute left-1 top-1/2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 hover:bg-black/60 sm:grid"><ChevronLeft size={26} aria-hidden /></button>
                <button type="button" onClick={() => go(1)} aria-label="Nächstes Foto" className="absolute right-1 top-1/2 hidden size-12 -translate-y-1/2 place-items-center rounded-full bg-black/40 hover:bg-black/60 sm:grid"><ChevronRight size={26} aria-hidden /></button>
              </>
            )}
          </div>

          <div className="space-y-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <div className="min-h-[2.75rem]">
              {photo.caption && <p className="font-display text-lg leading-snug">{photo.caption}</p>}
              <p className="text-sm text-white/80">{[photo.captured_at ? formatDateTime(photo.captured_at) : null, photo.stop].filter(Boolean).join(' · ')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setIsZoomed((z) => !z)} aria-pressed={isZoomed} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white/10 px-4 font-semibold hover:bg-white/20">
                {isZoomed ? <ZoomOut size={18} aria-hidden /> : <ZoomIn size={18} aria-hidden />} {isZoomed ? 'Verkleinern' : 'Vergrößern'}
              </button>
              {!scene && (
                <>
                  <a href={photoUrl(token, photo.id, 2400, true)} download={photoFileName(photo)} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-4 font-semibold text-teal-950 hover:bg-sand-50">
                    <Download size={18} aria-hidden /> Herunterladen
                  </a>
                  {canShare && <button type="button" onClick={() => void share()} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white/10 px-4 font-semibold hover:bg-white/20"><Share2 size={18} aria-hidden /> Teilen</button>}
                </>
              )}
            </div>
            {note && <p role="alert" className="text-sm text-gold-200">{note}</p>}
          </div>
        </div>
      )}
    </dialog>
  );
}
