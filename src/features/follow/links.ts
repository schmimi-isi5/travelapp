export interface LinkRow {
  id: string;
  label: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_seen_at: string | null;
  view_count: number;
}

export type LinkStatus = 'active' | 'ended' | 'expired';
export type ExpiryChoice = 'after_trip' | 'week' | 'month' | 'none';

export const EXPIRY_AFTER_TRIP_DAYS = 30;

export function linkStatus(link: Pick<LinkRow, 'revoked_at' | 'expires_at'>, now = Date.now()): LinkStatus {
  if (link.revoked_at) return 'ended';
  if (link.expires_at && Date.parse(link.expires_at) <= now) return 'expired';
  return 'active';
}

/** Expiry timestamp for a choice, or null for "no expiry". Returns undefined when the choice is not usable (trip end missing or already past). */
export function expiryFor(choice: ExpiryChoice, tripEndDate: string | null | undefined, now = Date.now()): string | null | undefined {
  if (choice === 'none') return null;
  if (choice === 'week') return new Date(now + 7 * 86_400_000).toISOString();
  if (choice === 'month') return new Date(now + 30 * 86_400_000).toISOString();
  if (!tripEndDate) return undefined;
  const end = new Date(`${tripEndDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + EXPIRY_AFTER_TRIP_DAYS);
  return end.getTime() > now ? end.toISOString() : undefined;
}

export function shareMessage(url: string, name: string): string {
  return `Hallo ${name}, hier könnt ihr unsere Reise verfolgen: ${url}\nDer Link ist nur für euch, bitte gebt ihn nicht weiter.`;
}

export const mailtoUrl = (url: string, name: string) => `mailto:?subject=${encodeURIComponent('Unsere Reise zum Mitverfolgen')}&body=${encodeURIComponent(shareMessage(url, name))}`;
export const whatsappUrl = (url: string, name: string) => `https://wa.me/?text=${encodeURIComponent(shareMessage(url, name))}`;
