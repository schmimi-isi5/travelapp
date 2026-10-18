import { createInviteToken, sha256Hex } from '@/lib/auth/token';
import { getSupabase } from '@/lib/supabase/client';

/** The link made for the family's own preview. It is hidden from the list of links and ends by itself. */
export const PREVIEW_LABEL = 'Vorschau (nur für euch)';
/** Added to the preview address so the page can say "this is the preview". */
export const PREVIEW_QUERY = 'vorschau';
export const PREVIEW_HOURS = 2;
const REUSE_MARGIN_MS = 10 * 60_000;

const storageKey = (tripId: string) => `nb-follow-preview:${tripId}`;

interface StoredPreview {
  token: string;
  expiresAt: number;
}

/** The stored preview token when it has at least ten more minutes to live; otherwise null (a fresh link is made). */
export function reusablePreviewToken(stored: string | null, now: number): string | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as Partial<StoredPreview>;
    return typeof parsed.token === 'string' && typeof parsed.expiresAt === 'number' && parsed.expiresAt - now > REUSE_MARGIN_MS ? parsed.token : null;
  } catch {
    return null;
  }
}

export const previewPath = (token: string): string => `/f/${token}?${PREVIEW_QUERY}=1`;

/**
 * Address of the live follower page as the followers see it. A short-lived link (two hours) is made on the first use and reused
 * while it lasts, so the list of real links stays clean and nothing long-lived is created by looking.
 */
export async function ensurePreviewPath(tripId: string, now = Date.now()): Promise<string> {
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(storageKey(tripId));
  } catch {
    // storage blocked: a new link is made each time
  }
  const reusable = reusablePreviewToken(stored, now);
  if (reusable) return previewPath(reusable);
  const token = createInviteToken();
  const expiresAt = now + PREVIEW_HOURS * 3_600_000;
  const { error } = await getSupabase().rpc('create_follower_link', { p_trip_id: tripId, p_label: PREVIEW_LABEL, p_token_hash: await sha256Hex(token), p_expires_at: new Date(expiresAt).toISOString() });
  if (error) throw new Error(error.message);
  try {
    window.localStorage.setItem(storageKey(tripId), JSON.stringify({ token, expiresAt } satisfies StoredPreview));
  } catch {
    // the preview still opens now
  }
  return previewPath(token);
}
