export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

const DEVICE_KEY = 'nb-device-id';

/** Stable per-browser device id used for mutation provenance. */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'device-server';
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const created = newId();
    window.localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return 'device-unknown';
  }
}
