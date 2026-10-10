'use client';

import { Binoculars } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useApp } from '@/components/app-provider';
import { isAdult } from '@/lib/domain/policy';

/**
 * "Für Follower freigeben": publishes one item to the read-only follower links. Only owner and adult see it, because
 * publishing is an adult decision; the database enforces the same rule. `blockedReason` explains why an item cannot be shared.
 */
export function FollowerShareToggle({ checked, label, blockedReason, onChange }: { checked: boolean; label: string; blockedReason?: string | null; onChange: (next: boolean) => Promise<void> }) {
  const { role } = useApp();
  const id = useId();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Optimistic value: the box flips at once and settles when the stored state catches up (or snaps back on failure).
  const [pending, setPending] = useState<boolean | null>(null);
  useEffect(() => {
    if (pending !== null && pending === checked) setPending(null);
  }, [checked, pending]);
  if (!isAdult(role)) return null;

  async function toggle(next: boolean) {
    setIsBusy(true);
    setError(null);
    setPending(next);
    try {
      await onChange(next);
    } catch (cause) {
      setPending(null);
      setError(cause instanceof Error ? cause.message : 'Die Freigabe konnte nicht geändert werden.');
    } finally {
      setIsBusy(false);
    }
  }

  const isBlocked = Boolean(blockedReason);
  return (
    <div className="text-sm">
      <label htmlFor={id} className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-deep">
        <input id={id} type="checkbox" className="size-5 accent-deep" checked={pending ?? checked} disabled={isBusy || isBlocked} onChange={(e) => void toggle(e.target.checked)} />
        <Binoculars size={16} aria-hidden /> {label}
      </label>
      {isBlocked && <p className="text-slate">{blockedReason}</p>}
      {error && <p role="alert" className="text-danger">{error}</p>}
    </div>
  );
}
