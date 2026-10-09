import type { SupabaseClient } from '@supabase/supabase-js';
import type { EntityName, SyncMutation } from '../domain/schemas';
import { AuthRequiredError, type ApplyResult, type RemoteAdapter, type RemoteRow, type StorageBucket } from './remote';
import { MIN_INVITE_TOKEN_LENGTH, sha256Hex } from '../auth/token';
import { fromRow, isGenericEntity, parseEntity, RowParseError, TABLE_SPECS, toRow, type MapContext, type Row } from './supabase-mapper';

const PAGE_SIZE = 1000;
const AVATAR_COLORS = ['#0F3D4E', '#A8472B', '#4A5830', '#334155', '#8A5A2B', '#14566D'] as const;

export interface RemoteContext extends MapContext {
  deviceId: string;
  /** Whether the signed-in user may read finance tables; members/children read the overview views instead. */
  isAdult: () => boolean;
}

/** PostgREST answers with a SQLSTATE or PGRST code when the server handled the request; anything else is a transport problem. */
function isServerAnswer(error: { code?: string } | null | undefined): boolean {
  const code = error?.code ?? '';
  return /^[0-9A-Z]{5}$/.test(code) || code.startsWith('PGRST');
}

function describe(error: { message?: string; code?: string }): string {
  return `${error.message ?? 'Unbekannter Fehler'}${error.code ? ` (${error.code})` : ''}`;
}

function avatarColor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] as string;
}

function invitationVersion(row: Row): number {
  return 1 + (row.accepted_at ? 1 : 0) + (row.revoked_at ? 1 : 0);
}

/**
 * Supabase-backed remote. Optimistic concurrency uses the `version` column: updates only match a row whose version
 * equals the mutation's base version, so a lost race surfaces as a conflict instead of a silent overwrite.
 * Idempotency relies on the unique key (family_id, device_id, mutation_id) of `sync_mutations`; the log entry is written
 * first and carries no business payload (data minimisation).
 */
export class SupabaseRemote implements RemoteAdapter {
  readonly name = 'Supabase';
  /** Encrypted identity documents are not kept on the device after upload unless the user opts in. */
  readonly dropsSensitiveLocalCopies = true;

  constructor(
    private readonly client: SupabaseClient,
    private readonly ctx: RemoteContext,
  ) {}

  // ---------------------------------------------------------------- mutations

  /** Without a session every request would run as `anon`; that must never look like a permission decision. */
  private async requireSession(): Promise<void> {
    const { data } = await this.client.auth.getSession();
    if (!data.session) throw new AuthRequiredError();
  }

  async apply(mutation: SyncMutation): Promise<ApplyResult> {
    await this.requireSession();
    let logged: { status: 'new' | 'pending' | 'applied' | 'conflict' | 'rejected' };
    try {
      logged = await this.logMutation(mutation);
    } catch (error) {
      if (error instanceof MutationRejected) return { status: 'rejected', reason: error.message };
      throw error;
    }
    if (logged.status !== 'new') {
      if (logged.status === 'applied') return { status: 'duplicate', version: (await this.currentVersion(mutation)) ?? (mutation.base_version ?? 0) + 1 };
      if (logged.status === 'rejected') return { status: 'rejected', reason: 'Vom Server bereits abgelehnt' };
      if (logged.status === 'conflict') return { status: 'conflict', remote: await this.fetchOne(mutation.entity_type, mutation.entity_id) };
      // 'pending': a previous attempt crashed halfway, apply again below.
    }
    // Transport errors propagate and leave the log entry 'pending', so the retry picks it up.
    const result = await this.applyEntity(mutation);
    await this.finishMutation(mutation, result);
    return result;
  }

  private async logMutation(m: SyncMutation): Promise<{ status: 'new' | 'pending' | 'applied' | 'conflict' | 'rejected' }> {
    const { error } = await this.client.from('sync_mutations').insert({
      family_id: this.ctx.familyId,
      user_id: this.ctx.userId,
      device_id: m.device_id,
      mutation_id: m.mutation_id,
      entity_type: m.entity_type,
      entity_id: m.entity_id,
      base_version: m.base_version,
      payload: { operation: m.operation },
    });
    if (!error) return { status: 'new' };
    if (error.code === '23505') {
      const { data } = await this.client.from('sync_mutations').select('status').eq('family_id', this.ctx.familyId).eq('device_id', m.device_id).eq('mutation_id', m.mutation_id).maybeSingle();
      return { status: ((data as { status?: string } | null)?.status as 'pending' | 'applied' | 'conflict' | 'rejected') ?? 'pending' };
    }
    if (isServerAnswer(error)) {
      // e.g. 42501: a non-adult tried to sync a finance entity. The mutation itself is refused.
      throw new MutationRejected(describe(error));
    }
    throw new Error(`sync_mutations: ${describe(error)}`);
  }

  private async finishMutation(m: SyncMutation, result: ApplyResult): Promise<void> {
    const status = result.status === 'ok' || result.status === 'duplicate' ? 'applied' : result.status === 'conflict' ? 'conflict' : 'rejected';
    await this.client.from('sync_mutations').update({ status }).eq('family_id', this.ctx.familyId).eq('device_id', m.device_id).eq('mutation_id', m.mutation_id);
  }

  private async applyEntity(m: SyncMutation): Promise<ApplyResult> {
    try {
      switch (m.entity_type) {
        case 'family':
          return await this.applyFamily(m);
        case 'members':
          return await this.applyMember(m);
        case 'invitations':
          return await this.applyInvitation(m);
        default:
          if (isGenericEntity(m.entity_type)) return await this.applyGeneric(m);
          return { status: 'rejected', reason: `Unbekannter Datentyp ${m.entity_type}` };
      }
    } catch (error) {
      if (error instanceof MutationRejected) return { status: 'rejected', reason: error.message };
      throw error;
    }
  }

  private async applyGeneric(m: SyncMutation): Promise<ApplyResult> {
    const entity = m.entity_type as EntityName;
    const spec = TABLE_SPECS[entity];
    if (!spec) return { status: 'rejected', reason: `Unbekannter Datentyp ${entity}` };
    const table = this.client.from(spec.table);

    if (m.operation === 'delete') {
      const { data, error } = await table.delete().eq('id', m.entity_id).eq('version', m.base_version ?? -1).select('id');
      this.assertNoTransportError(error);
      if (error) return this.classify(error, entity, m);
      if (data?.length) return { status: 'ok', version: (m.base_version ?? 0) + 1 };
      const remote = await this.fetchOne(entity, m.entity_id);
      if (!remote) return { status: 'ok', version: (m.base_version ?? 0) + 1 }; // already gone
      return this.sameVersionMeansDenied(remote, m);
    }

    const row = toRow(entity, (m.payload ?? {}) as Row, this.ctx);
    if (m.base_version === null) {
      const { data, error } = await table.insert(row).select('version').single();
      this.assertNoTransportError(error);
      if (error) {
        if (error.code === '23505') return this.adoptExistingInsert(entity, m);
        return this.classify(error, entity, m);
      }
      return { status: 'ok', version: Number((data as Row).version) };
    }
    const { data, error } = await table.update(row).eq('id', m.entity_id).eq('version', m.base_version).select('version');
    this.assertNoTransportError(error);
    if (error) return this.classify(error, entity, m);
    if (data?.length) return { status: 'ok', version: Number((data[0] as Row).version) };
    const remote = await this.fetchOne(entity, m.entity_id);
    if (!remote) return { status: 'conflict', remote: null };
    return this.sameVersionMeansDenied(remote, m);
  }

  /** A retried insert whose first attempt succeeded: same id, version 1, written by this user. */
  private async adoptExistingInsert(entity: EntityName, m: SyncMutation): Promise<ApplyResult> {
    const spec = TABLE_SPECS[entity];
    const { data } = await this.client.from(spec?.table ?? entity).select('version, created_by').eq('id', m.entity_id).maybeSingle();
    const found = data as { version: number; created_by: string | null } | null;
    if (found && found.created_by === this.ctx.userId && Number(found.version) === 1) return { status: 'duplicate', version: 1 };
    return { status: 'conflict', remote: await this.fetchOne(entity, m.entity_id) };
  }

  /** Zero rows updated although the row exists at the expected version: row level security hid or blocked it. */
  private sameVersionMeansDenied(remote: RemoteRow, m: SyncMutation): ApplyResult {
    if (Number(remote.version) === m.base_version) return { status: 'rejected', reason: 'Keine Berechtigung für diese Änderung' };
    return { status: 'conflict', remote };
  }

  private classify(error: { code?: string; message?: string }, entity: EntityName, m: SyncMutation): ApplyResult {
    if (error.code === '42501') return { status: 'rejected', reason: `Keine Berechtigung (${entity})` };
    if (error.code === '23503') throw new Error(`${entity}/${m.entity_id}: Abhängiger Datensatz fehlt noch auf dem Server (${describe(error)})`);
    if (error.code === '23514' || error.code === '23502' || error.code === '22P02' || error.code === '23505') return { status: 'rejected', reason: describe(error) };
    throw new Error(`${entity}: ${describe(error)}`);
  }

  private assertNoTransportError(error: { code?: string; message?: string } | null): void {
    if (error && !isServerAnswer(error)) throw new Error(`Netzwerkfehler: ${error.message ?? 'unbekannt'}`);
  }

  private async applyFamily(m: SyncMutation): Promise<ApplyResult> {
    if (m.operation !== 'upsert' || m.base_version === null) return { status: 'rejected', reason: 'Familien werden nur über die Einrichtung angelegt' };
    const name = String((m.payload as Row | null)?.name ?? '').trim();
    const { data, error } = await this.client.from('families').update({ name }).eq('id', m.entity_id).eq('version', m.base_version).select('version');
    this.assertNoTransportError(error);
    if (error) return this.classify(error, 'family', m);
    if (data?.length) return { status: 'ok', version: Number((data[0] as Row).version) };
    const remote = await this.fetchOne('family', m.entity_id);
    return remote ? this.sameVersionMeansDenied(remote, m) : { status: 'conflict', remote: null };
  }

  private async applyMember(m: SyncMutation): Promise<ApplyResult> {
    const userId = m.entity_id;
    const { familyId } = this.ctx;
    if (m.operation === 'delete') {
      const { error } = await this.client.from('family_members').delete().eq('family_id', familyId).eq('user_id', userId).eq('version', m.base_version ?? -1);
      this.assertNoTransportError(error);
      return error ? this.classify(error, 'members', m) : { status: 'ok', version: (m.base_version ?? 0) + 1 };
    }
    if (m.base_version === null) return { status: 'rejected', reason: 'Mitglieder treten über eine Einladung bei' };
    const payload = (m.payload ?? {}) as Row;
    const current = await this.fetchOne('members', userId);
    if (!current) return { status: 'conflict', remote: null };
    if (Number(current.version) !== m.base_version) return { status: 'conflict', remote: current };
    let version = Number(current.version);
    if (payload.role !== current.role || payload.status !== current.status) {
      const { data, error } = await this.client
        .from('family_members')
        .update({ role: payload.role, status: payload.status })
        .eq('family_id', familyId)
        .eq('user_id', userId)
        .eq('version', m.base_version)
        .select('version');
      this.assertNoTransportError(error);
      if (error) return this.classify(error, 'members', m);
      if (!data?.length) return { status: 'rejected', reason: 'Nur der Owner darf Rollen ändern' };
      version = Number((data[0] as Row).version);
    }
    if (payload.display_name !== current.display_name) {
      if (userId !== this.ctx.userId) return { status: 'rejected', reason: 'Anzeigenamen kann nur die Person selbst ändern' };
      const { error } = await this.client.from('profiles').update({ display_name: String(payload.display_name).trim() }).eq('user_id', userId);
      this.assertNoTransportError(error);
      if (error) return this.classify(error, 'members', m);
    }
    return { status: 'ok', version };
  }

  private async applyInvitation(m: SyncMutation): Promise<ApplyResult> {
    const payload = (m.payload ?? {}) as Row;
    if (m.operation === 'delete') {
      const { error } = await this.client.from('invitations').delete().eq('id', m.entity_id);
      this.assertNoTransportError(error);
      return error ? this.classify(error, 'invitations', m) : { status: 'ok', version: 1 };
    }
    if (m.base_version === null) {
      const code = String(payload.code ?? '');
      const email = String(payload.email ?? '').trim();
      if (!email) return { status: 'rejected', reason: 'Für Einladungen ist eine E-Mail-Adresse erforderlich' };
      if (code.length < MIN_INVITE_TOKEN_LENGTH) return { status: 'rejected', reason: 'Einladungstoken zu kurz' };
      const { data, error } = await this.client
        .from('invitations')
        .insert({ id: m.entity_id, family_id: this.ctx.familyId, email, role: payload.role, token_hash: await sha256Hex(code), expires_at: payload.expires_at })
        .select('accepted_at, revoked_at')
        .single();
      this.assertNoTransportError(error);
      if (error) return this.classify(error, 'invitations', m);
      return { status: 'ok', version: invitationVersion(data as Row) };
    }
    const { data, error } = await this.client.from('invitations').update({ revoked_at: payload.revoked_at ?? null }).eq('id', m.entity_id).select('accepted_at, revoked_at');
    this.assertNoTransportError(error);
    if (error) return this.classify(error, 'invitations', m);
    if (!data?.length) return { status: 'rejected', reason: 'Einladung nicht gefunden oder keine Berechtigung' };
    return { status: 'ok', version: invitationVersion(data[0] as Row) };
  }

  private async currentVersion(m: SyncMutation): Promise<number | null> {
    const remote = await this.fetchOne(m.entity_type, m.entity_id);
    return remote ? Number(remote.version) : null;
  }

  // -------------------------------------------------------------------- reads

  /** Single row as an app entity, or null when it does not exist or is not visible. */
  async fetchOne(entity: string, id: string): Promise<RemoteRow | null> {
    try {
      const rows = await this.pullWhere(entity, (q) => q.eq(entity === 'members' ? 'user_id' : 'id', id));
      return rows[0] ?? null;
    } catch {
      return null;
    }
  }

  async pull(table: string): Promise<RemoteRow[]> {
    await this.requireSession();
    return this.pullWhere(table);
  }

  private async pullWhere(entity: string, filter?: (q: FilterBuilder) => FilterBuilder): Promise<RemoteRow[]> {
    if (entity === 'members') return this.pullMembers(filter);
    if (entity === 'family') return this.pageThrough('families', entity, filter);
    if (entity === 'invitations') return this.pageThrough('invitations', entity, filter);
    if (!isGenericEntity(entity)) return [];
    const spec = TABLE_SPECS[entity];
    // Members and children never read finance columns: they get the overview views (same ids and versions).
    const relation = !this.ctx.isAdult() && entity === 'stays' ? 'stays_overview' : !this.ctx.isAdult() && entity === 'bookings' ? 'bookings_overview' : (spec?.table ?? entity);
    return this.pageThrough(relation, entity, filter);
  }

  private async pageThrough(relation: string, entity: string, filter?: (q: FilterBuilder) => FilterBuilder): Promise<RemoteRow[]> {
    const out: RemoteRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      let query = this.client.from(relation).select('*') as unknown as FilterBuilder;
      if (filter) query = filter(query);
      const { data, error } = await (query as unknown as { order: (c: string) => { range: (a: number, b: number) => Promise<{ data: Row[] | null; error: { code?: string; message?: string } | null }> } }).order('id').range(from, from + PAGE_SIZE - 1);
      if (error) throw new Error(`${relation}: ${describe(error)}`);
      for (const record of data ?? []) {
        // The overview views carry no created_at; fall back to updated_at so the row stays representable.
        const raw = { ...record, created_at: record.created_at ?? record.updated_at };
        const mapped = entity === 'invitations' ? this.invitationEntity(raw) : raw;
        try {
          out.push(fromRow(entity as EntityName, mapped) as RemoteRow);
        } catch (parseError) {
          if (!(parseError instanceof RowParseError)) throw parseError;
          console.warn(JSON.stringify({ level: 'warn', message: 'remote row skipped', detail: parseError.message }));
        }
      }
      if ((data?.length ?? 0) < PAGE_SIZE) break;
    }
    return out;
  }

  private invitationEntity(row: Row): Row {
    return { ...row, version: invitationVersion(row), updated_at: row.accepted_at ?? row.revoked_at ?? row.created_at, source_type: 'user_entered', is_demo: false, code: '' };
  }

  private async pullMembers(filter?: (q: FilterBuilder) => FilterBuilder): Promise<RemoteRow[]> {
    let membersQuery = this.client.from('family_members').select('*') as unknown as FilterBuilder;
    if (filter) membersQuery = filter(membersQuery);
    const [{ data: members, error: memberError }, { data: profiles, error: profileError }] = await Promise.all([
      membersQuery as unknown as Promise<{ data: Row[] | null; error: { code?: string; message?: string } | null }>,
      this.client.from('profiles').select('user_id, display_name'),
    ]);
    if (memberError) throw new Error(`family_members: ${describe(memberError)}`);
    if (profileError) throw new Error(`profiles: ${describe(profileError)}`);
    const names = new Map((profiles ?? []).map((p) => [String(p.user_id), String(p.display_name)]));
    const out: RemoteRow[] = [];
    for (const m of members ?? []) {
      const userId = String(m.user_id);
      out.push(
        parseEntity('members', {
          id: userId,
          family_id: m.family_id,
          display_name: names.get(userId) ?? 'Mitglied',
          role: m.role,
          status: m.status,
          avatar_color: avatarColor(userId),
          version: m.version,
          created_at: m.created_at,
          updated_at: m.updated_at,
          source_type: 'user_entered',
          is_demo: false,
        }) as RemoteRow,
      );
    }
    return out;
  }

  // ------------------------------------------------------------------ storage

  async uploadBlob(path: string, blob: Blob, bucket: StorageBucket): Promise<void> {
    await this.requireSession();
    const { error } = await this.client.storage.from(bucket).upload(path, blob, { upsert: false, contentType: blob.type || 'application/octet-stream', cacheControl: '3600' });
    if (!error) return;
    const status = (error as { statusCode?: string }).statusCode;
    if (status === '409' || /already exists|duplicate/i.test(error.message)) return; // retry of an upload that succeeded
    throw new Error(`Upload ${bucket}/${path}: ${error.message}`);
  }

  async signedUrl(path: string, bucket: StorageBucket, ttlSeconds: number): Promise<string | null> {
    const { data, error } = await this.client.storage.from(bucket).createSignedUrl(path, ttlSeconds);
    return error ? null : (data?.signedUrl ?? null);
  }

  async download(path: string, bucket: StorageBucket): Promise<Blob | null> {
    const { data, error } = await this.client.storage.from(bucket).download(path);
    return error ? null : data;
  }
}

class MutationRejected extends Error {}

/** Minimal structural type for the chained PostgREST filter calls used above. */
interface FilterBuilder {
  eq: (column: string, value: unknown) => FilterBuilder;
}
