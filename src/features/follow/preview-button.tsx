'use client';

import { Eye } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApp } from '@/components/app-provider';
import { Button } from '@/components/ui';
import { isAdult } from '@/lib/domain/policy';
import { ensurePreviewPath, PREVIEW_QUERY } from './preview';

/**
 * "Vorschau": opens the page the followers see. In the demo it is the demo page; live it is the real page behind a short-lived link
 * of its own. Only adults (they are the ones who may create links).
 */
export function FollowerPreviewButton({ variant = 'primary' }: { variant?: 'primary' | 'link' }) {
  const { role, isSupabase, tripId } = useApp();
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!isAdult(role)) return null;

  async function open() {
    setIsBusy(true);
    setError(null);
    try {
      router.push(await ensurePreviewPath(tripId));
    } catch (cause) {
      setError(cause instanceof Error ? `Die Vorschau konnte nicht geöffnet werden: ${cause.message}` : 'Die Vorschau konnte nicht geöffnet werden.');
      setIsBusy(false);
    }
  }

  const demoHref = `/f/demo?${PREVIEW_QUERY}=1`;
  if (variant === 'link') {
    return isSupabase ? (
      <span>
        <button type="button" onClick={() => void open()} disabled={isBusy} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-deep underline"><Eye size={16} aria-hidden /> {isBusy ? 'Wird geöffnet …' : 'Vorschau für Mitreisende'}</button>
        {error && <span role="alert" className="block text-sm text-danger">{error}</span>}
      </span>
    ) : (
      <Link href={demoHref} className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-deep underline"><Eye size={16} aria-hidden /> Vorschau für Mitreisende</Link>
    );
  }
  return isSupabase ? (
    <div>
      <Button onClick={() => void open()} disabled={isBusy}><Eye size={18} aria-hidden /> {isBusy ? 'Wird geöffnet …' : 'Vorschau öffnen'}</Button>
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </div>
  ) : (
    <Link href={demoHref} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-deep px-5 py-2 font-semibold text-white hover:bg-deep-700"><Eye size={18} aria-hidden /> Vorschau öffnen</Link>
  );
}
