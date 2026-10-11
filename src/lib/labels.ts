/**
 * Central display labels (docs/design-audit, finding G10). Only the display text is mapped; stored values in the database
 * stay as they are. Keep technical terms (provider, supabase, user_entered, unknown …) out of the user interface.
 */
import { formatDuration } from './formatting';
import type { Role } from './domain/schemas';

const plural = new Intl.PluralRules('de-DE');

export const nights = (count: number): string => `${count} ${plural.select(count) === 'one' ? 'Nacht' : 'Nächte'}`;
export const persons = (count: number): string => `${count} ${plural.select(count) === 'one' ? 'Person' : 'Personen'}`;

export const roleLabel: Record<Role, string> = {
  owner: 'Organisator:in',
  adult: 'Erwachsene:r',
  member: 'Mitglied',
  child: 'Kind',
};

/** Where a drive time comes from; `unknown` has no label so that nothing like "Quelle unbekannt" is shown. */
export const durationSourceLabel: Record<string, string | undefined> = {
  offline_estimate: 'grobe Offline-Schätzung',
  provider: 'Quelle: Anbieter',
  user_entered: 'selbst eingetragen',
  unknown: undefined,
};

/** "ca. 330 km · ca. 4 Std. 30 Min.": unknown values are left out instead of "ca. ? km"; null when nothing is known. */
export function driveSummary(distanceKm: number | null | undefined, minutes: number | null | undefined): string | null {
  const parts: string[] = [];
  if (distanceKm !== null && distanceKm !== undefined) parts.push(`ca. ${Math.round(distanceKm)} km`);
  if (minutes !== null && minutes !== undefined) parts.push(`ca. ${formatDuration(minutes)}`);
  return parts.length ? parts.join(' · ') : null;
}
