import { assertRead, assertWrite, canEditOwnedRow, ForbiddenError } from '../domain/policy';
import { ENTITY_SCHEMAS, type Entity, type EntityName, type SyncMutation } from '../domain/schemas';
import { getActor } from './actor';
import { getDeviceId, newId, nowIso } from './ids';
import { getLocalDb } from './local';

/** Tables whose rows carry an author and may be edited by that author regardless of role. */
const AUTHOR_FIELD: Partial<Record<EntityName, string>> = {
  journal_entries: 'author_user_id',
  media_assets: 'uploaded_by',
  wildlife_sightings: 'recorded_by',
  sighting_favorites: 'user_id',
  voice_transcripts: 'created_by',
};

export class ValidationError extends Error {
  readonly code = 'VALIDATION';
  constructor(
    readonly table: string,
    readonly issues: { path: string; message: string }[],
  ) {
    super(`Ungültige Daten für ${table}: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`);
  }
}

export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  constructor(table: string, id: string) {
    super(`${table}/${id} nicht gefunden`);
  }
}

type Input<K extends EntityName> = Partial<Entity<K>> & Record<string, unknown>;

function parseRow<K extends EntityName>(table: K, row: unknown): Entity<K> {
  const result = ENTITY_SCHEMAS[table].safeParse(row);
  if (!result.success) {
    throw new ValidationError(
      table,
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data as Entity<K>;
}

function assertOwnRow(table: EntityName, row: Record<string, unknown>): void {
  const field = AUTHOR_FIELD[table];
  const actor = getActor();
  if (!field) return;
  if (!canEditOwnedRow(actor.role, String(row[field] ?? ''), actor.userId)) throw new ForbiddenError(actor.role, table, 'write');
}

export async function list<K extends EntityName>(table: K): Promise<Entity<K>[]> {
  assertRead(getActor().role, table);
  const rows = await getLocalDb().entity(table).toArray();
  return rows as unknown as Entity<K>[];
}

export async function get<K extends EntityName>(table: K, id: string): Promise<Entity<K> | undefined> {
  assertRead(getActor().role, table);
  const row = await getLocalDb().entity(table).get(id);
  return row as unknown as Entity<K> | undefined;
}

async function enqueue(table: EntityName, id: string, operation: 'upsert' | 'delete', payload: Record<string, unknown> | null): Promise<void> {
  const db = getLocalDb();
  const key = `${table}:${id}`;
  const meta = await db.sync_meta.get(key);
  const baseVersion = meta?.synced_version ?? null;
  const pending = await db.sync_mutations.where('entity_id').equals(id).filter((m) => m.entity_type === table && m.status === 'pending').first();
  if (pending) {
    // Coalesce: keep the original base version (the server still compares against what it last acknowledged)
    // and the original timestamp (parents must stay ahead of children that reference them).
    await db.sync_mutations.put({ ...pending, operation, payload });
    return;
  }
  const mutation: SyncMutation = {
    id: newId(),
    mutation_id: newId(),
    device_id: getDeviceId(),
    entity_type: table,
    entity_id: id,
    operation,
    base_version: baseVersion,
    payload,
    status: 'pending',
    error: null,
    created_at: nowIso(),
  };
  await db.sync_mutations.put(mutation);
}

export async function create<K extends EntityName>(table: K, input: Input<K>): Promise<Entity<K>> {
  const actor = getActor();
  assertWrite(actor.role, table);
  const now = nowIso();
  const draft = { id: newId(), version: 1, created_at: now, updated_at: now, created_by: actor.userId, ...input };
  const row = parseRow(table, draft);
  assertOwnRow(table, row as Record<string, unknown>);
  const db = getLocalDb();
  await db.transaction('rw', [db.entity(table), db.sync_mutations, db.sync_meta], async () => {
    await db.entity(table).put(row as never);
    await enqueue(table, row.id, 'upsert', row as Record<string, unknown>);
  });
  return row;
}

export async function update<K extends EntityName>(table: K, id: string, patch: Input<K>): Promise<Entity<K>> {
  const actor = getActor();
  // Everyone may rename themselves; all other member changes (roles, removal) are owner-only.
  const isOwnDisplayName = table === 'members' && id === actor.userId && Object.keys(patch).every((key) => key === 'display_name');
  if (!isOwnDisplayName) assertWrite(actor.role, table);
  const db = getLocalDb();
  return db.transaction('rw', [db.entity(table), db.sync_mutations, db.sync_meta], async () => {
    const existing = (await db.entity(table).get(id)) as Record<string, unknown> | undefined;
    if (!existing) throw new NotFoundError(table, id);
    assertOwnRow(table, existing);
    const row = parseRow(table, { ...existing, ...patch, id, version: Number(existing.version) + 1, updated_at: nowIso() });
    await db.entity(table).put(row as never);
    await enqueue(table, id, 'upsert', row as Record<string, unknown>);
    return row;
  });
}

export async function remove(table: EntityName, id: string): Promise<void> {
  assertWrite(getActor().role, table);
  const db = getLocalDb();
  await db.transaction('rw', [db.entity(table), db.sync_mutations, db.sync_meta], async () => {
    const existing = (await db.entity(table).get(id)) as Record<string, unknown> | undefined;
    if (!existing) return;
    assertOwnRow(table, existing);
    await db.entity(table).delete(id);
    await enqueue(table, id, 'delete', null);
  });
}
