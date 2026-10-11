'use client';

import { Share, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useApp } from './app-provider';
import { Button } from './ui';

const DISMISSED_KEY = 'nb-install-hint-dismissed';

export type InstallPlatform = 'standalone' | 'ios' | 'android' | 'other';

/** How the app is running: installed (standalone), in a phone browser, or something else (desktop). */
export function detectPlatform(): InstallPlatform {
  if (typeof window === 'undefined') return 'other';
  const nav = navigator as Navigator & { standalone?: boolean };
  if (window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true) return 'standalone';
  const agent = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(agent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/.test(agent)) return 'android';
  return 'other';
}

/**
 * Asks the browser not to evict the offline data. Safari deletes the stored data of websites that were not opened for a
 * week; an app on the home screen is exempt from that rule, and persistent storage is an extra safeguard (best effort).
 */
export function usePersistentStorage(enabled: boolean): void {
  useEffect(() => {
    if (enabled) void navigator.storage?.persist?.().catch(() => false);
  }, [enabled]);
}

/** One-time hint for phones: put the app on the home screen so the offline data survives. Real accounts only. */
export function InstallHint() {
  const { isSupabase, authStatus } = useApp();
  const [platform, setPlatform] = useState<InstallPlatform>('standalone');
  const [isDismissed, setIsDismissed] = useState(true);

  useEffect(() => {
    // Browser-only facts: read once after mount so the server render stays empty.
    setPlatform(detectPlatform());
    try {
      setIsDismissed(window.localStorage.getItem(DISMISSED_KEY) === '1');
    } catch {
      setIsDismissed(false);
    }
  }, []);

  if (!isSupabase || authStatus !== 'ready' || isDismissed || (platform !== 'ios' && platform !== 'android')) return null;

  function dismiss() {
    setIsDismissed(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, '1');
    } catch {
      /* hint may reappear next time */
    }
  }

  return (
    <section aria-label="App installieren" className="mb-4 rounded-lg border border-line bg-white p-4 shadow-card" data-testid="install-hint">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-bold">App auf den Home-Bildschirm legen</h2>
        <button type="button" onClick={dismiss} aria-label="Hinweis schließen" className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-sand">
          <X size={18} aria-hidden />
        </button>
      </div>
      {platform === 'ios' ? (
        <p className="mt-1 text-sm text-slate">
          Safari löscht gespeicherte Daten von Websites, die eine Woche nicht geöffnet wurden. Als App auf dem Home-Bildschirm bleiben deine Offline-Daten erhalten. Tippe in Safari unten auf <Share size={14} aria-hidden className="inline align-text-bottom" /> <strong>Teilen</strong> und dann auf <strong>„Zum Home-Bildschirm“</strong>. Öffne die App danach von dort.
        </p>
      ) : (
        <p className="mt-1 text-sm text-slate">Tippe im Browser-Menü (⋮) auf <strong>„App installieren“</strong> oder <strong>„Zum Startbildschirm hinzufügen“</strong>. Öffne die App danach vom Startbildschirm, dann bleiben deine Offline-Daten zuverlässig erhalten.</p>
      )}
      <div className="mt-3">
        <Button size="sm" variant="secondary" onClick={dismiss}>Verstanden</Button>
      </div>
    </section>
  );
}
