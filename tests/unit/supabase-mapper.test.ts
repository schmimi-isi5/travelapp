import { describe, expect, it } from 'vitest';
import { buildDemoData } from '@/lib/db/demo-data';
import { ENTITY_NAMES, ENTITY_SCHEMAS, type EntityName } from '@/lib/domain/schemas';
import { fromRow, RowParseError, TABLE_SPECS, toRow, writableColumns } from '@/lib/offline/supabase-mapper';

const ctx = { familyId: 'fam-1', userId: 'user-1' };
const SERVER_MANAGED = ['version', 'created_at', 'updated_at', 'created_by'];
const demo = buildDemoData();

describe('supabase mapper', () => {
  it('has a database mapping for every entity that is written through the generic path', () => {
    const special = ['family', 'members', 'invitations'];
    for (const name of ENTITY_NAMES) expect(name in TABLE_SPECS || special.includes(name), name).toBe(true);
  });

  it('never sends server-managed or local-only columns', () => {
    for (const [name, spec] of Object.entries(TABLE_SPECS)) {
      for (const column of spec!.columns) expect(SERVER_MANAGED, `${name}.${column}`).not.toContain(column);
      expect(spec!.columns, name).not.toContain('sync_state');
      expect(spec!.columns, name).not.toContain('upload_state');
    }
  });

  it('whitelists only fields that exist in the entity schema (or are injected from the session)', () => {
    for (const [name, spec] of Object.entries(TABLE_SPECS)) {
      const shape = Object.keys((ENTITY_SCHEMAS[name as EntityName] as unknown as { shape: Record<string, unknown> }).shape);
      const injected = Object.keys(spec!.inject?.(ctx) ?? {});
      for (const column of spec!.columns) expect([...shape, ...injected], `${name}.${column}`).toContain(column);
    }
  });

  it('round-trips every demo row of every generic table without losing app fields', () => {
    for (const [name, rows] of Object.entries(demo) as [EntityName, Record<string, unknown>[]][]) {
      if (!(name in TABLE_SPECS)) continue;
      const written = new Set(writableColumns(name));
      for (const original of rows) {
        const dbRow = toRow(name, original, ctx);
        // The database adds version/timestamps; absent app fields come back as null.
        const fromDb = { ...dbRow, version: 3, created_at: '2026-10-01T00:00:00+00:00', updated_at: '2026-10-02T00:00:00+00:00', created_by: 'u' };
        const back = fromRow(name, Object.fromEntries(Object.entries(fromDb).map(([k, v]) => [k, v ?? null])));
        for (const key of Object.keys(original)) {
          if (!written.has(key) || key === 'version' || key.endsWith('_at') && ['created_at', 'updated_at'].includes(key)) continue;
          expect(back[key], `${name}.${key}`).toEqual(original[key]);
        }
      }
    }
  });

  it('translates the vocabulary that differs between app and database', () => {
    const stay = toRow('stays', { id: 's', trip_id: 't', name: 'x', quote_status: 'none' }, ctx);
    expect(stay.quote_status).toBe('unknown');
    expect(fromRow('stays', { id: 's', trip_id: 't', name: 'x', quote_status: 'unknown', created_at: 'a', updated_at: 'b', version: 1 }).quote_status).toBe('none');
    const route = toRow('routes', { id: 'r', trip_id: 't', from_stop_id: 'a', to_stop_id: 'b', duration_source: 'offline_estimate' }, ctx);
    expect(route.duration_source).toBe('estimate');
    expect(fromRow('routes', { id: 'r', trip_id: 't', from_stop_id: 'a', to_stop_id: 'b', duration_source: 'routing_provider', distance_km: null, duration_minutes: null, created_at: 'a', updated_at: 'b', version: 1 }).duration_source).toBe('provider');
  });

  it('injects the family scope for tables whose app entity has none', () => {
    expect(toRow('fx_rates', { id: 'f', from_currency: 'NAD', to_currency: 'EUR', rate: 0.05, as_of: '2026-10-01', source: 'Beleg' }, ctx).family_id).toBe('fam-1');
    expect(toRow('sighting_favorites', { id: 'f', species_id: 's', user_id: 'u' }, ctx).family_id).toBe('fam-1');
  });

  it('normalises database timestamps to calendar days where the app works with days', () => {
    const stop = fromRow('trip_stops', { id: 's', trip_id: 't', title: 'W', country: 'Namibia', latitude: '-22.5', longitude: 17, arrive_at: '2026-10-13T00:00:00+00:00', depart_at: null, sequence: 1, created_at: 'a', updated_at: 'b', version: 1, summary: null, highlights: [] });
    expect(stop.arrive_at).toBe('2026-10-13');
    expect(stop.latitude).toBe(-22.5);
    expect(stop.summary).toBe('');
  });

  it('turns database nulls into app defaults and reports rows it cannot represent', () => {
    expect(fromRow('journal_entries', { id: 'j', trip_id: 't', author_user_id: 'u', entry_date: '2026-10-16', title: 'T', body: 'x', visibility: 'family', status: 'published', location: null, summary: null, created_at: 'a', updated_at: 'b', version: 2 }).summary).toBeNull();
    expect(() => fromRow('stays', { id: 's', trip_id: 't', name: '', created_at: 'a', updated_at: 'b', version: 1 })).toThrow(RowParseError);
  });
});
