import { ENTITY_SCHEMAS, type EntityName } from '../domain/schemas';

/**
 * Translation between the app's entities (src/lib/domain/schemas.ts) and the Postgres rows of
 * supabase/migrations. The whitelist per table keeps local-only fields (sync_state, upload_state, invitation code)
 * and server-managed columns (version, created_at, updated_at, created_by) out of write payloads.
 */

export type Row = Record<string, unknown>;

export interface MapContext {
  familyId: string;
  userId: string;
}

interface TableSpec {
  /** Postgres table (relation) the entity is stored in. */
  table: string;
  /** Columns the client may write. Everything else is dropped. */
  columns: readonly string[];
  /** Columns holding a calendar day in the app but timestamptz in Postgres. */
  dayOnly?: readonly string[];
  /** Columns that must be JS numbers (PostgREST may return numeric as string). */
  numeric?: readonly string[];
  /** Fixed values injected from the session when absent (family scope). */
  inject?: (ctx: MapContext) => Row;
}

const P = ['is_demo', 'source_type'] as const;

export const TABLE_SPECS: Partial<Record<EntityName, TableSpec>> = {
  trips: { table: 'trips', columns: ['id', 'family_id', 'title', 'start_date', 'end_date', 'countries', ...P] },
  trip_stops: { table: 'trip_stops', columns: ['id', 'trip_id', 'title', 'country', 'latitude', 'longitude', 'arrive_at', 'depart_at', 'sequence', 'summary', 'source_reference', 'highlights', 'verified_at', ...P], dayOnly: ['arrive_at', 'depart_at'], numeric: ['latitude', 'longitude'] },
  routes: { table: 'routes', columns: ['id', 'trip_id', 'from_stop_id', 'to_stop_id', 'distance_km', 'duration_minutes', 'duration_source', ...P], numeric: ['distance_km'] },
  stays: { table: 'stays', columns: ['id', 'trip_id', 'stop_id', 'name', 'address', 'check_in', 'check_out', 'booking_status', 'quote_status', 'price_minor', 'currency', 'booking_ref', 'contact', 'notes', 'due_at', 'verified_at', 'source_reference', ...P] },
  bookings: { table: 'bookings', columns: ['id', 'trip_id', 'stop_id', 'stay_id', 'kind', 'title', 'booking_status', 'starts_at', 'deadline_at', 'reminder_at', 'amount_minor', 'currency', 'reference', 'provider', 'contact', 'notes', 'verified_at', 'source_reference', ...P] },
  documents: { table: 'documents', columns: ['id', 'family_id', 'booking_id', 'stay_id', 'title', 'storage_path', 'original_name', 'mime_type', 'size_bytes', 'classification', 'access_level', ...P] },
  payments: { table: 'payments', columns: ['id', 'family_id', 'booking_id', 'stay_id', 'amount_minor', 'currency', 'paid_at', 'verification_status', 'source_document_id', 'notes', ...P] },
  action_items: { table: 'action_items', columns: ['id', 'family_id', 'trip_id', 'stop_id', 'stay_id', 'booking_id', 'title', 'status', 'owner_user_id', 'due_at', 'priority', 'is_demo'] },
  journal_entries: { table: 'journal_entries', columns: ['id', 'trip_id', 'stop_id', 'author_user_id', 'entry_date', 'title', 'body', 'visibility', 'status', 'location', 'summary', 'shared_with_followers', ...P] },
  media_assets: { table: 'media_assets', columns: ['id', 'family_id', 'trip_id', 'stop_id', 'journal_entry_id', 'uploaded_by', 'kind', 'storage_path', 'original_name', 'captured_at', 'mime_type', 'size_bytes', 'caption', 'album', 'is_favorite', 'visibility', 'shared_with_followers', ...P] },
  voice_transcripts: { table: 'voice_transcripts', columns: ['id', 'media_id', 'provider', 'body', 'language', 'status', ...P] },
  wildlife_species: { table: 'wildlife_species', columns: ['id', 'family_id', 'common_name_de', 'scientific_name', 'is_demo'], inject: (c) => ({ family_id: c.familyId }) },
  wildlife_sightings: { table: 'wildlife_sightings', columns: ['id', 'trip_id', 'stop_id', 'species_id', 'seen_at', 'recorded_by', 'count', 'notes', 'media_id', 'shared_with_followers', ...P] },
  sighting_favorites: { table: 'sighting_favorites', columns: ['id', 'family_id', 'species_id', 'user_id'], inject: (c) => ({ family_id: c.familyId }) },
  expenses: { table: 'expenses', columns: ['id', 'trip_id', 'category', 'description', 'amount_minor', 'currency', 'spent_at', 'booking_id', 'payment_id', 'entered_by', ...P], dayOnly: ['spent_at'] },
  fx_rates: { table: 'fx_rates', columns: ['id', 'family_id', 'from_currency', 'to_currency', 'rate', 'as_of', 'source', 'is_demo'], numeric: ['rate'], inject: (c) => ({ family_id: c.familyId }) },
  travel_tips: { table: 'travel_tips', columns: ['id', 'stop_id', 'title', 'body', 'category', 'source_type', 'source_reference', 'verified_at', 'warning_level', 'is_demo'] },
  emergency_contacts: { table: 'emergency_contacts', columns: ['id', 'trip_id', 'name', 'phone', 'type', 'notes', 'available_offline', ...P] },
};

/** Entities with their own persistence rules in SupabaseRemote (not handled by the generic path). */
export const SPECIAL_ENTITIES: readonly EntityName[] = ['family', 'members', 'invitations'];

export function isGenericEntity(entity: string): entity is keyof typeof TABLE_SPECS {
  return entity in TABLE_SPECS;
}

const QUOTE_TO_DB: Record<string, string> = { none: 'unknown' };
const QUOTE_FROM_DB: Record<string, string> = { unknown: 'none' };
const DURATION_TO_DB: Record<string, string> = { offline_estimate: 'estimate', provider: 'routing_provider' };
const DURATION_FROM_DB: Record<string, string> = { estimate: 'offline_estimate', routing_provider: 'provider' };

function mapValue(map: Record<string, string>, value: unknown): unknown {
  return typeof value === 'string' && value in map ? map[value] : value;
}

/** Entity → writable database row. Never contains server-managed columns. */
export function toRow(entity: EntityName, value: Row, ctx: MapContext): Row {
  const spec = TABLE_SPECS[entity];
  if (!spec) throw new Error(`Keine Datenbankzuordnung für ${entity}`);
  const source: Row = { ...(spec.inject?.(ctx) ?? {}), ...value };
  const row: Row = {};
  for (const column of spec.columns) {
    if (source[column] !== undefined) row[column] = source[column];
  }
  if (entity === 'stays' && 'quote_status' in row) row.quote_status = mapValue(QUOTE_TO_DB, row.quote_status);
  if (entity === 'routes' && 'duration_source' in row) row.duration_source = mapValue(DURATION_TO_DB, row.duration_source);
  return row;
}

export class RowParseError extends Error {
  constructor(
    readonly entity: string,
    readonly rowId: unknown,
    detail: string,
  ) {
    super(`Zeile ${entity}/${String(rowId)} entspricht nicht dem App-Schema: ${detail}`);
  }
}

/** Database row → app entity (validated and defaulted). Throws RowParseError for rows the app cannot represent. */
export function fromRow(entity: EntityName, dbRow: Row): Row {
  const spec = TABLE_SPECS[entity];
  const row: Row = { ...dbRow };
  if (spec) {
    for (const column of spec.dayOnly ?? []) if (typeof row[column] === 'string') row[column] = (row[column] as string).slice(0, 10);
    for (const column of spec.numeric ?? []) if (row[column] !== null && row[column] !== undefined) row[column] = Number(row[column]);
  }
  if (entity === 'stays') row.quote_status = mapValue(QUOTE_FROM_DB, row.quote_status);
  if (entity === 'routes') row.duration_source = mapValue(DURATION_FROM_DB, row.duration_source);
  return parseEntity(entity, row);
}

/**
 * Validates against the entity schema. A database NULL is kept where the schema accepts it; where the schema wants a
 * value (e.g. `summary text` that is NULL in Postgres but `''` in the app) only that field falls back to its default.
 */
export function parseEntity(entity: EntityName, row: Row): Row {
  const schema = ENTITY_SCHEMAS[entity];
  const first = schema.safeParse(row);
  if (first.success) return { ...(first.data as Row) };
  const relaxed: Row = { ...row };
  for (const issue of first.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && relaxed[key] === null) relaxed[key] = undefined;
  }
  const second = schema.safeParse(relaxed);
  if (second.success) return { ...(second.data as Row) };
  throw new RowParseError(entity, row.id, second.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
}

/** Keys of the app row that are written to the database for this entity (used by tests and diagnostics). */
export function writableColumns(entity: EntityName): readonly string[] {
  return TABLE_SPECS[entity]?.columns ?? [];
}
