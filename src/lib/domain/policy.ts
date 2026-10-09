import type { EntityName, Role } from './schemas';

/**
 * Client-side mirror of the database RLS policy (supabase/migrations). In supabase mode the database is the
 * authority; in demo mode this module is the only guard, and the UI must additionally hide what it denies.
 */

const FINANCE_TABLES: ReadonlySet<EntityName> = new Set(['payments', 'documents', 'expenses', 'fx_rates', 'invitations']);
const ADULT_ROLES: ReadonlySet<Role> = new Set(['owner', 'adult']);

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
  constructor(
    readonly role: Role,
    readonly table: string,
    readonly action: 'read' | 'write',
  ) {
    super(`Rolle "${role}" darf ${table} nicht ${action === 'read' ? 'lesen' : 'ändern'}`);
  }
}

export function isAdult(role: Role): boolean {
  return ADULT_ROLES.has(role);
}

export function canRead(role: Role, table: EntityName): boolean {
  if (FINANCE_TABLES.has(table)) return isAdult(role);
  return true;
}

export function canWrite(role: Role, table: EntityName): boolean {
  switch (table) {
    case 'family':
    case 'members':
      return role === 'owner';
    case 'journal_entries':
    case 'media_assets':
    case 'voice_transcripts':
    case 'wildlife_sightings':
    case 'sighting_favorites':
      return true;
    default:
      return isAdult(role);
  }
}

/** Child-safe mode: no finance, no identity documents, no booking amounts. */
export function canSeeBookingAmounts(role: Role): boolean {
  return isAdult(role);
}

export function canEditOwnedRow(role: Role, authorId: string, actorId: string): boolean {
  return isAdult(role) || authorId === actorId;
}

export function assertRead(role: Role, table: EntityName): void {
  if (!canRead(role, table)) throw new ForbiddenError(role, table, 'read');
}

export function assertWrite(role: Role, table: EntityName): void {
  if (!canWrite(role, table)) throw new ForbiddenError(role, table, 'write');
}
