'use client';

import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Badge, Button, Notice } from '@/components/ui';
import type { AiOutcome } from '@/lib/ai/client';

/**
 * One look for every optional AI helper: a button, then the answer with its origin ("KI-Entwurf" or "regelbasiert"), its note
 * and, where it makes sense, a button that takes the text over. Nothing is sent before the button is pressed; the request
 * itself (consent, sign-in, quota, fallback) is handled by `requestAi`.
 */
export function AiSuggestion({ label, run, onAccept, acceptLabel = 'Übernehmen', showLocal = false, testId, className }: {
  label: string;
  run: () => Promise<AiOutcome>;
  onAccept?: (text: string) => void;
  acceptLabel?: string;
  /** Show the rule-based answer too (useful when it is not just a repeat of what is on screen). */
  showLocal?: boolean;
  testId?: string;
  className?: string;
}) {
  const [outcome, setOutcome] = useState<AiOutcome | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  async function ask() {
    setIsBusy(true);
    try {
      setOutcome(await run());
    } finally {
      setIsBusy(false);
    }
  }
  const isAi = outcome?.result.origin === 'ai_generated';
  const isShown = outcome !== null && (isAi || showLocal);
  return (
    <div className={className}>
      <Button size="sm" variant="secondary" disabled={isBusy} onClick={() => void ask()}><Sparkles size={14} aria-hidden /> {isBusy ? 'Wird erstellt …' : label}</Button>
      {isShown && outcome && (
        <div className="mt-3 rounded-md bg-sand-50 p-3 text-sm" data-testid={testId} aria-live="polite">
          <Badge tone={isAi ? 'ai' : 'neutral'}>{isAi ? `KI-Entwurf (${outcome.result.provider})` : 'Regelbasiert, keine KI'}</Badge>
          <p className="mt-2 whitespace-pre-line">{outcome.result.text}</p>
          <p className="mt-2 text-xs text-muted">{outcome.result.availability_note}</p>
          {onAccept && <Button size="sm" variant="ghost" className="mt-2" onClick={() => onAccept(outcome.result.text)}>{acceptLabel}</Button>}
        </div>
      )}
      {outcome?.fallbackReason && !isAi && <div className="mt-3"><Notice tone="info">{outcome.fallbackReason}</Notice></div>}
    </div>
  );
}
