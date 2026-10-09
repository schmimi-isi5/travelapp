import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { admin, backendAvailable, config, createFamilyWithRoles, deleteCreatedUsers, remoteFor, uniq } from './harness';

const available = await backendAvailable();
const PNG = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Fam = Awaited<ReturnType<typeof createFamilyWithRoles>>;

describe.skipIf(!available)('private storage (real Supabase Storage + RLS)', () => {
  let a: Fam;
  let b: Fam;
  const path = (f: Fam, name: string) => `${f.family.id}/${f.family.tripId}/${uniq()}-${name}`;

  beforeAll(async () => {
    a = await createFamilyWithRoles();
    b = await createFamilyWithRoles();
  });
  afterAll(deleteCreatedUsers);

  it('stores a member photo privately and serves it through a short-lived signed URL to family members only', async () => {
    const p = path(a, 'foto.png');
    await remoteFor(a.member, a.family.id, 'member').uploadBlob(p, new Blob([PNG], { type: 'image/png' }), 'media');
    const url = await remoteFor(a.child, a.family.id, 'child').signedUrl(p, 'media', 60);
    expect(url).toMatch(/token=/);
    const res = await fetch(url!);
    expect(res.status).toBe(200);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG);
    // another family can neither sign nor download the object, nor see it in a listing
    expect(await remoteFor(b.owner, b.family.id, 'owner').signedUrl(p, 'media', 60)).toBeNull();
    expect(await remoteFor(b.owner, b.family.id, 'owner').download(p, 'media')).toBeNull();
    const listing = await b.owner.client.storage.from('media').list(`${a.family.id}/${a.family.tripId}`);
    expect(listing.data ?? []).toEqual([]);
  });

  it('is not publicly readable', async () => {
    const p = path(a, 'public-check.png');
    await remoteFor(a.owner, a.family.id, 'owner').uploadBlob(p, new Blob([PNG], { type: 'image/png' }), 'media');
    const res = await fetch(`${config.url}/storage/v1/object/public/media/${p}`);
    expect(res.status).not.toBe(200);
    const anonRes = await fetch(`${config.url}/storage/v1/object/media/${p}`, { headers: { apikey: config.anonKey } });
    expect(anonRes.status).not.toBe(200);
  });

  it('expires signed URLs', async () => {
    const p = path(a, 'expiry.png');
    await remoteFor(a.owner, a.family.id, 'owner').uploadBlob(p, new Blob([PNG], { type: 'image/png' }), 'media');
    const url = await remoteFor(a.owner, a.family.id, 'owner').signedUrl(p, 'media', 2);
    expect((await fetch(url!)).status).toBe(200);
    await sleep(3500);
    expect((await fetch(url!)).status).not.toBe(200);
  });

  it('refuses uploads into another family prefix and malformed paths', async () => {
    const remote = remoteFor(a.member, a.family.id, 'member');
    await expect(remote.uploadBlob(`${b.family.id}/x/${uniq()}.png`, new Blob([PNG], { type: 'image/png' }), 'media')).rejects.toThrow();
    await expect(remote.uploadBlob(`not-a-uuid/${uniq()}.png`, new Blob([PNG], { type: 'image/png' }), 'media')).rejects.toThrow();
  });

  it('enforces file types: audio memos pass, executables are rejected', async () => {
    const remote = remoteFor(a.child, a.family.id, 'child');
    await remote.uploadBlob(path(a, 'memo.webm'), new Blob([new Uint8Array(2048)], { type: 'audio/webm' }), 'media');
    await expect(remote.uploadBlob(path(a, 'virus.exe'), new Blob([new Uint8Array(64)], { type: 'application/x-msdownload' }), 'media')).rejects.toThrow();
  });

  it('keeps private media of a child hidden from adults, but visible to the child', async () => {
    const p = path(a, 'privat.png');
    const row = await a.child.client.from('media_assets').insert({ family_id: a.family.id, trip_id: a.family.tripId, uploaded_by: a.child.id, kind: 'photo', storage_path: p, visibility: 'private', mime_type: 'image/png' });
    expect(row.error).toBeNull();
    await remoteFor(a.child, a.family.id, 'child').uploadBlob(p, new Blob([PNG], { type: 'image/png' }), 'media');
    expect(await remoteFor(a.child, a.family.id, 'child').signedUrl(p, 'media', 60)).not.toBeNull();
    expect(await remoteFor(a.owner, a.family.id, 'owner').signedUrl(p, 'media', 60)).toBeNull();
  });

  it('restricts the documents bucket to owners and adults and accepts encrypted (opaque) bytes', async () => {
    const p = `${a.family.id}/documents/${uniq()}-pass.bin`;
    const cipher = new Blob([crypto.getRandomValues(new Uint8Array(512))], { type: 'application/octet-stream' });
    await expect(remoteFor(a.member, a.family.id, 'member').uploadBlob(p, cipher, 'documents')).rejects.toThrow();
    await expect(remoteFor(a.child, a.family.id, 'child').uploadBlob(p, cipher, 'documents')).rejects.toThrow();
    await remoteFor(a.adult, a.family.id, 'adult').uploadBlob(p, cipher, 'documents');
    expect(await remoteFor(a.owner, a.family.id, 'owner').download(p, 'documents')).not.toBeNull();
    for (const user of [a.member, a.child]) {
      expect(await remoteFor(user, a.family.id, user.role).signedUrl(p, 'documents', 60), user.role).toBeNull();
      expect(await remoteFor(user, a.family.id, user.role).download(p, 'documents'), user.role).toBeNull();
    }
    expect(await remoteFor(b.adult, b.family.id, 'adult').download(p, 'documents')).toBeNull();
  });

  it('rejects documents above the 20 MB bucket limit', async () => {
    const big = new Blob([new Uint8Array(21 * 1024 * 1024)], { type: 'application/pdf' });
    await expect(remoteFor(a.owner, a.family.id, 'owner').uploadBlob(`${a.family.id}/documents/${uniq()}-big.pdf`, big, 'documents')).rejects.toThrow();
  }, 120_000);

  it('treats a retried upload of an existing object as success (idempotent)', async () => {
    const p = path(a, 'retry.png');
    const remote = remoteFor(a.owner, a.family.id, 'owner');
    await remote.uploadBlob(p, new Blob([PNG], { type: 'image/png' }), 'media');
    await expect(remote.uploadBlob(p, new Blob([PNG], { type: 'image/png' }), 'media')).resolves.toBeUndefined();
  });

  it('GDPR deletion removes the database rows and every storage object of the family', async () => {
    const { POST } = await import('@/app/api/account/delete/route');
    const f = await createFamilyWithRoles();
    const p = `${f.family.id}/${f.family.tripId}/${uniq()}-weg.png`;
    await f.owner.client.from('media_assets').insert({ family_id: f.family.id, trip_id: f.family.tripId, uploaded_by: f.owner.id, kind: 'photo', storage_path: p, mime_type: 'image/png' });
    await remoteFor(f.owner, f.family.id, 'owner').uploadBlob(p, new Blob([PNG], { type: 'image/png' }), 'media');
    const call = (token: string, body: unknown) => POST(new Request('http://app/api/account/delete', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
    expect((await call(f.adult.accessToken, { familyId: f.family.id, confirm: 'LÖSCHEN' })).status).toBe(403);
    expect((await call(f.owner.accessToken, { familyId: f.family.id, confirm: 'nein' })).status).toBe(400);
    const res = await call(f.owner.accessToken, { familyId: f.family.id, confirm: 'LÖSCHEN' });
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('deleted');
    const { data: fam } = await admin.from('families').select('id').eq('id', f.family.id);
    expect(fam).toEqual([]);
    const { data: listing } = await admin.storage.from('media').list(`${f.family.id}/${f.family.tripId}`);
    expect(listing ?? []).toEqual([]);
  });
});

describe.skipIf(available)('private storage (real Supabase Storage + RLS)', () => {
  it('is not_configured: no local Supabase stack reachable (run scripts/stack.sh up)', () => {
    expect(available).toBe(false);
  });
});
