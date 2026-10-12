'use client';

import clsx from 'clsx';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Card } from '@/components/ui';
import { AiSuggestion } from '@/features/ai/ai-suggest';
import { requestAi } from '@/lib/ai/client';
import { findingFacts, type PlanFinding } from '@/lib/domain/trip-check';

const ICON = { critical: CircleAlert, warning: TriangleAlert, info: Info } as const;
const TEXT = { critical: 'dringend', warning: 'prüfen', info: 'Hinweis' } as const;
/** Findings shown before "Alle anzeigen"; the most urgent come first. */
const COLLAPSED_COUNT = 5;
const COLOUR = { critical: 'text-clay-700', warning: 'text-ochre-700', info: 'text-teal-700' } as const;

/** What a careful reader would notice in the plan (gaps, long drives, unconfirmed bookings). Works offline; the AI only phrases next steps. */
export function TripCheckCard({ findings }: { findings: readonly PlanFinding[] }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const shown = isExpanded ? findings : findings.slice(0, COLLAPSED_COUNT);
  return (
    <Card id="reise-check" data-testid="trip-check">
      <h2 className="mb-1 text-lg font-bold">Reise-Check</h2>
      {findings.length === 0 ? (
        <p className="flex items-center gap-2 text-slate"><CircleCheck size={18} aria-hidden className="text-savanna-700" /> Keine Auffälligkeiten: Termine, Unterkünfte und Fahrtage passen zusammen.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate" data-testid="trip-check-count">{findings.length} {findings.length === 1 ? 'Hinweis' : 'Hinweise'} zur Planung, nach Dringlichkeit sortiert.</p>
          <ul className="divide-y divide-line">
            {shown.map((finding) => {
              const Icon = ICON[finding.severity];
              return (
                <li key={finding.id} className="py-2" data-testid="trip-check-finding">
                  <Link href={finding.href} className="flex min-h-11 items-start gap-3 hover:underline">
                    <Icon size={18} aria-hidden className={clsx('mt-0.5 shrink-0', COLOUR[finding.severity])} />
                    <span className="min-w-0 text-[15px]">
                      <span className="sr-only">{TEXT[finding.severity]}: </span>
                      <strong>{finding.title}</strong>
                      <span className="block text-sm text-slate">{finding.detail}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {findings.length > COLLAPSED_COUNT && (
            <button type="button" aria-expanded={isExpanded} onClick={() => setIsExpanded((value) => !value)} className="mt-2 min-h-11 text-sm font-semibold text-deep underline">{isExpanded ? 'Weniger anzeigen' : `Alle ${findings.length} anzeigen`}</button>
          )}
          <AiSuggestion className="mt-3 border-t border-line pt-3" label="Nächste Schritte mit KI" testId="trip-check-ai" run={() => requestAi({ task: 'check_plan', input: { facts: findingFacts(findings) } })} />
        </>
      )}
    </Card>
  );
}
