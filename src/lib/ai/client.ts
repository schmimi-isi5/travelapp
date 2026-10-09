import type { TravelTip } from '../domain/schemas';
import { isOnline } from '../offline/network';
import { runLocal } from './fallback';
import type { AiRequest, AiResult, ProviderStatus } from './types';

const CONSENT_KEY = 'nb-ai-consent';

export function getAiConsent(): boolean {
  try {
    return window.localStorage.getItem(CONSENT_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAiConsent(value: boolean): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, value ? '1' : '0');
  } catch {
    /* not persisted */
  }
}

export async function fetchProviderStatus(): Promise<ProviderStatus | null> {
  if (!isOnline()) return null;
  try {
    const res = await fetch('/api/ai/status', { cache: 'no-store' });
    return res.ok ? ((await res.json()) as ProviderStatus) : null;
  } catch {
    return null;
  }
}

export interface AiOutcome {
  result: AiResult;
  /** Why the local fallback was used, or null if the provider answered. */
  fallbackReason: string | null;
}

/**
 * Sends text to the server-side provider only with explicit opt-in, online and with a ready provider.
 * In every other case the deterministic local fallback answers, labeled as such.
 */
export async function requestAi(request: AiRequest, tips: readonly TravelTip[] = []): Promise<AiOutcome> {
  const local = (reason: string): AiOutcome => ({ result: runLocal(request, tips), fallbackReason: reason });
  if (!getAiConsent()) return local('KI-Nutzung nicht freigegeben (Einstellungen). Es wird nichts übertragen.');
  if (!isOnline()) return local('Offline: lokale, regelbasierte Hilfe.');
  const status = await fetchProviderStatus();
  if (!status || status.state !== 'ready') return local(status?.detail ?? 'KI-Dienst nicht erreichbar.');
  try {
    const res = await fetch('/api/ai/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ consent: true, ...request }) });
    if (!res.ok) return local('KI-Dienst hat nicht geantwortet.');
    return { result: (await res.json()) as AiResult, fallbackReason: null };
  } catch {
    return local('KI-Dienst nicht erreichbar.');
  }
}
