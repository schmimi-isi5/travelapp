import { NextResponse } from 'next/server';
import { z } from 'zod';
import { log, requestId } from '@/lib/server/logger';
import { bearerToken, createAdminClient, createUserClient, isServerConfigured } from '@/lib/server/supabase-admin';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ familyId: z.string().uuid(), confirm: z.literal('LÖSCHEN') });
const STORAGE_BATCH = 100;

/**
 * GDPR erasure of a whole family (owner only). The database function `delete_family_data` runs under the caller's JWT,
 * so RLS and its owner check apply, and returns the storage paths. The files are then removed with the service role,
 * because SQL deletes on `storage.objects` are not supported by Supabase.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  if (!isServerConfigured()) {
    return NextResponse.json({ status: 'not_configured', message: 'Im Demo-Modus gibt es keine Server-Daten. Lokale Daten lassen sich unter Einstellungen löschen.' }, { status: 501 });
  }
  const token = bearerToken(request);
  if (!token) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'INVALID_REQUEST', message: 'familyId und Bestätigung „LÖSCHEN“ sind erforderlich.' }, { status: 400 });

  const { data, error } = await createUserClient(token).rpc('delete_family_data', { fid: parsed.data.familyId });
  if (error) {
    log('warn', 'family deletion refused', { requestId: id, code: error.code });
    return NextResponse.json({ error: 'DELETE_FAILED', message: 'Nur der Owner der Familie darf alle Daten löschen.' }, { status: 403 });
  }
  const paths = ((data as { storage_paths?: string[] } | null)?.storage_paths ?? []).filter((p) => typeof p === 'string');
  const admin = createAdminClient();
  let removed = 0;
  const failures: string[] = [];
  for (const bucket of ['media', 'documents'] as const) {
    for (let i = 0; i < paths.length; i += STORAGE_BATCH) {
      const { data: gone, error: removeError } = await admin.storage.from(bucket).remove(paths.slice(i, i + STORAGE_BATCH));
      if (removeError) failures.push(`${bucket}: ${removeError.message}`);
      else removed += gone?.length ?? 0;
    }
  }
  log(failures.length ? 'error' : 'info', 'family deleted', { requestId: id, objects: paths.length, removed, failures: failures.length });
  return NextResponse.json({ status: failures.length ? 'deleted_with_storage_errors' : 'deleted', objects: paths.length, removed, failures });
}
