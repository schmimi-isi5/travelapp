'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '@/components/app-provider';
import { canRead } from '../domain/policy';
import type { Entity, EntityName } from '../domain/schemas';
import { EDITORIAL_TIPS } from './editorial-tips';
import { getLocalDb } from './local';

/** Live rows of a table. Denied tables return an empty list so child roles never render finance data. */
export function useTable<K extends EntityName>(table: K): { rows: Entity<K>[]; loading: boolean } {
  const { role, ready } = useApp();
  const allowed = canRead(role, table);
  const rows = useLiveQuery(async () => (allowed ? ((await getLocalDb().entity(table).toArray()) as unknown as Entity<K>[]) : []), [table, allowed, ready]);
  return { rows: rows ?? [], loading: rows === undefined };
}

/** Travel tips: rows from the database plus, outside the demo, the bundled editorial guidance. */
export function useTips(): { rows: Entity<'travel_tips'>[]; loading: boolean } {
  const { isSupabase } = useApp();
  const { rows, loading } = useTable('travel_tips');
  return { rows: isSupabase ? [...rows, ...EDITORIAL_TIPS] : rows, loading };
}
