/**
 * RFC 4122 v4 UUID. `randomUUID` only exists in secure contexts (HTTPS or localhost); opened over plain http on a LAN
 * address it is missing, so fall back to getRandomValues, which is available everywhere.
 */
export function newId(): string {
  const { crypto } = globalThis;
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
