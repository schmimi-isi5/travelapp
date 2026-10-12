import { isOnline } from '../offline/network';
import { authHeaders } from '../supabase/auth-headers';
import { getAiConsent } from './client';
import type { ReceiptSuggestion } from './receipt-types';

const MAX_EDGE = 1600;
const QUALITIES = [0.8, 0.65, 0.5];
const MAX_BASE64 = 2_500_000;

export type ReceiptOutcome =
  | { ok: true; receipt: ReceiptSuggestion; provider: string }
  | { ok: false; reason: string };

/** Re-encodes the photo as a small JPEG (no EXIF, no GPS) and returns its base64, or null when it cannot be decoded. */
export async function receiptImageBase64(file: Blob): Promise<string | null> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of QUALITIES) {
        const url = canvas.toDataURL('image/jpeg', quality);
        const base64 = url.slice(url.indexOf(',') + 1);
        if (base64.length <= MAX_BASE64) return base64;
      }
      return null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/** Sends one receipt photo to the AI reading (only after the person confirmed it) and returns suggested fields. */
export async function scanReceipt(file: Blob): Promise<ReceiptOutcome> {
  if (!getAiConsent()) return { ok: false, reason: 'KI-Nutzung ist nicht freigegeben (Einstellungen). Bitte den Betrag selbst eintragen.' };
  if (!isOnline()) return { ok: false, reason: 'Offline: Die Belegerkennung braucht Netz. Bitte den Betrag selbst eintragen.' };
  const image = await receiptImageBase64(file);
  if (!image) return { ok: false, reason: 'Das Foto konnte nicht verarbeitet werden. Bitte ein anderes Foto wählen oder selbst eintragen.' };
  try {
    const res = await fetch('/api/ai/receipt', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ consent: true, image }) });
    if (res.status === 429) return { ok: false, reason: 'Das Kontingent für Belege ist vorerst aufgebraucht. Bitte selbst eintragen.' };
    if (!res.ok) return { ok: false, reason: 'Der Beleg konnte nicht gelesen werden. Bitte selbst eintragen.' };
    const { provider, ...receipt } = (await res.json()) as ReceiptSuggestion & { provider: string };
    return { ok: true, receipt, provider };
  } catch {
    return { ok: false, reason: 'Die Belegerkennung ist nicht erreichbar. Bitte selbst eintragen.' };
  }
}
