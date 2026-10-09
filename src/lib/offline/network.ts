const KEY = 'nb-simulate-offline';
const listeners = new Set<() => void>();

function readSimulated(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let simulatedOffline = readSimulated();

/** True when neither the browser nor the offline simulation reports a lost connection. */
export function isOnline(): boolean {
  const browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
  return browserOnline && !simulatedOffline;
}

export function isSimulatedOffline(): boolean {
  return simulatedOffline;
}

export function setSimulatedOffline(value: boolean): void {
  simulatedOffline = value;
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(KEY, value ? '1' : '0');
  } catch {
    /* storage unavailable: the simulation then only lives for this page load */
  }
  listeners.forEach((l) => l());
}

export function subscribeNetwork(listener: () => void): () => void {
  listeners.add(listener);
  if (typeof window !== 'undefined') {
    window.addEventListener('online', listener);
    window.addEventListener('offline', listener);
  }
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', listener);
      window.removeEventListener('offline', listener);
    }
  };
}
