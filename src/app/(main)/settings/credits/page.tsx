'use client';

import { ExternalLink } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { Card, PageHeader } from '@/components/ui';
import { useDestinationLibrary } from '@/features/media/use-destination-library';
import { imageUrl } from '@/lib/media/places';

/** Credits for the photographs of the destination library (licences such as CC BY require them; they are not shown under each photo). */
export default function CreditsPage() {
  const { isSupabase } = useApp();
  const library = useDestinationLibrary();
  const sorted = [...library].sort((a, b) => a.place_label.localeCompare(b.place_label, 'de') || a.role.localeCompare(b.role));

  return (
    <div className="mx-auto max-w-content space-y-6">
      <PageHeader title="Bildnachweise" subtitle="Urheber, Lizenz und Quelle der Ortsfotos in dieser App." />
      {!isSupabase ? (
        <Card><p className="text-sm text-slate">Im Demo-Modus gibt es keine Ortsfotos, nur eigene Illustrationen.</p></Card>
      ) : sorted.length === 0 ? (
        <Card><p className="text-sm text-slate">Noch keine Ortsfotos geladen.</p></Card>
      ) : (
        <ul className="space-y-2" data-testid="credits-list">
          {sorted.map((image) => {
            const path = image.variants.thumb ?? Object.values(image.variants)[0];
            return (
              <li key={image.id} className="flex gap-3 rounded-lg border border-line p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl(path as string)} alt="" width={64} height={48} loading="lazy" decoding="async" className="h-12 w-16 shrink-0 rounded object-cover" />
                <p className="min-w-0 text-sm">
                  <strong>{image.place_label}</strong>{!image.location_verified && ' (Regionsmotiv)'}<br />
                  <span className="text-slate">{image.attribution_text}</span>{' '}
                  <a href={image.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-deep underline" aria-label={`Quelle zum Foto: ${image.place_label}`}>Quelle <ExternalLink size={12} aria-hidden /></a>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
