import { randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GET as getMedia } from '@/app/api/follow/[token]/media/[id]/route';
import { GET as getView } from '@/app/api/follow/[token]/route';
import { sha256Hex } from '@/lib/auth/token';
import { travelToday } from '@/lib/server/follow';
import type { FollowerView } from '@/lib/follow/view';
import { admin, backendAvailable, createFamilyWithRoles, deleteCreatedUsers } from './harness';

const available = await backendAvailable();
type Fam = Awaited<ReturnType<typeof createFamilyWithRoles>>;

const day = (offset: number) => {
  const d = new Date(`${travelToday()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};

/** A JPEG that carries camera data and GPS coordinates, like a phone photo. */
async function jpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 2400, height: 1600, channels: 3, background: '#c65a3a' } })
    .withExif({ IFD0: { Make: 'TestCam', Model: 'Secret-1' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '22/1 33/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '17/1 5/1 0/1' } })
    .jpeg()
    .toBuffer();
}

async function createLink(fam: Fam, by: Fam['owner'], label = 'Oma', expiresAt: string | null = null) {
  const token = randomBytes(32).toString('base64url');
  const { data, error } = await by.client.rpc('create_follower_link', { p_trip_id: fam.family.tripId, p_label: label, p_token_hash: await sha256Hex(token), p_expires_at: expiresAt });
  if (error) throw new Error(`create link: ${error.message}`);
  return { id: String(data), token };
}

const view = async (token: string) => {
  const res = await getView(new Request(`http://localhost/api/follow/${token}`), { params: Promise.resolve({ token }) });
  return { status: res.status, body: res.status === 200 ? ((await res.json()) as FollowerView) : await res.json().catch(() => null), headers: res.headers };
};
const media = (token: string, id: string, w = 1600) => getMedia(new Request(`http://localhost/api/follow/${token}/media/${id}?w=${w}`), { params: Promise.resolve({ token, id }) });

describe.skipIf(!available)('follower links (real Supabase + app routes)', () => {
  let a: Fam;
  let b: Fam;
  const ids = { sharedEntry: '', privateEntry: '', openEntry: '', sharedPhoto: '', hiddenPhoto: '', futurePhoto: '', sharedSighting: '', otherSighting: '', futureStop: '', species: '' };

  beforeAll(async () => {
    a = await createFamilyWithRoles();
    b = await createFamilyWithRoles();
    const trip = a.family.tripId;
    const mk = async (table: string, row: Record<string, unknown>) => {
      const { data, error } = await a.owner.client.from(table).insert(row).select('id').single();
      if (error) throw new Error(`${table}: ${error.message}`);
      return String((data as { id: string }).id);
    };
    await mk('trip_stops', { trip_id: trip, title: 'Windhoek', country: 'Namibia', sequence: 1, arrive_at: day(-4), depart_at: day(-2), latitude: -22.56, longitude: 17.08 });
    const stop2 = await mk('trip_stops', { trip_id: trip, title: 'Etosha', country: 'Namibia', sequence: 2, arrive_at: day(-2), depart_at: day(2), latitude: -19.2, longitude: 15.9 });
    ids.futureStop = await mk('trip_stops', { trip_id: trip, title: 'Chobe', country: 'Botswana', sequence: 3, arrive_at: day(5), latitude: -17.8, longitude: 25.1 });
    await mk('stays', { trip_id: trip, stop_id: stop2, name: 'GEHEIM-Lodge', address: 'Geheimweg 1', price_minor: 987654, currency: 'EUR', booking_ref: 'REF-GEHEIM' });
    const species = await mk('wildlife_species', { family_id: a.family.id, common_name_de: 'Elefant-Test', scientific_name: 'Loxodonta test' });
    ids.species = species;

    const member = a.member.id;
    const entry = (title: string, extra: Record<string, unknown> = {}) => ({ trip_id: trip, stop_id: stop2, author_user_id: a.owner.id, entry_date: day(-1), title, body: `Text ${title}`, ...extra });
    ids.sharedEntry = await mk('journal_entries', entry('Geteilt'));
    ids.openEntry = await mk('journal_entries', entry('Nicht geteilt'));
    // a private entry by a member (the owner cannot even read it)
    const { data: priv, error } = await a.member.client.from('journal_entries').insert({ trip_id: trip, stop_id: stop2, author_user_id: member, entry_date: day(-1), title: 'Privat', body: 'geheim', visibility: 'private' }).select('id').single();
    if (error) throw new Error(`private entry: ${error.message}`);
    ids.privateEntry = String((priv as { id: string }).id);

    const jpeg = await jpegWithGps();
    const photo = async (name: string, stopId: string, visibility = 'family') => {
      const path = `${a.family.id}/${trip}/${randomUUID()}-${name}.jpg`;
      const up = await admin.storage.from('media').upload(path, jpeg, { contentType: 'image/jpeg' });
      if (up.error) throw new Error(`upload: ${up.error.message}`);
      return mk('media_assets', { family_id: a.family.id, trip_id: trip, stop_id: stopId, uploaded_by: a.owner.id, kind: 'photo', storage_path: path, original_name: `${name}.jpg`, mime_type: 'image/jpeg', size_bytes: jpeg.length, caption: name, visibility });
    };
    ids.sharedPhoto = await photo('geteilt', stop2);
    ids.hiddenPhoto = await photo('nicht-geteilt', stop2);
    ids.futurePhoto = await photo('zukunft', ids.futureStop);
    ids.sharedSighting = await mk('wildlife_sightings', { trip_id: trip, stop_id: stop2, species_id: species, recorded_by: a.owner.id, count: 4, notes: 'Herde' });
    ids.otherSighting = await mk('wildlife_sightings', { trip_id: trip, stop_id: stop2, species_id: species, recorded_by: a.owner.id, count: 1, notes: 'nicht geteilt' });

    // an adult publishes selected items
    const share = async (table: string, id: string) => {
      const { error: shareError } = await a.adult.client.from(table).update({ shared_with_followers: true }).eq('id', id);
      if (shareError) throw new Error(`share ${table}: ${shareError.message}`);
    };
    await share('journal_entries', ids.sharedEntry);
    await share('media_assets', ids.sharedPhoto);
    await share('media_assets', ids.futurePhoto);
    await share('wildlife_sightings', ids.sharedSighting);
  }, 120_000);
  afterAll(deleteCreatedUsers);

  it('shows reached stops and only the explicitly shared items, never finance or lodge data', async () => {
    const { token } = await createLink(a, a.adult);
    const { status, body, headers } = await view(token);
    expect(status).toBe(200);
    const v = body as FollowerView;
    expect(v.stops.map((s) => s.title)).toEqual(['Windhoek', 'Etosha']);
    expect(v.stops.find((s) => s.id === v.currentStopId)?.title).toBe('Etosha');
    expect(v.entries.map((e) => e.title)).toEqual(['Geteilt']);
    expect(v.photos.map((p) => p.id)).toEqual([ids.sharedPhoto]); // the photo of the future stop is held back
    expect(v.sightings).toHaveLength(1);
    expect(v.sightings[0]).toMatchObject({ species: 'Elefant-Test', count: 4 });
    const json = JSON.stringify(v);
    for (const secret of ['GEHEIM', 'Geheimweg', '987654', 'REF-', 'Nicht geteilt', 'geheim', 'Chobe', 'storage_path', 'token_hash']) expect(json).not.toContain(secret);
    expect(headers.get('cache-control')).toContain('no-store');
    expect(headers.get('x-robots-tag')).toContain('noindex');
  });

  it('counts visits on the link', async () => {
    const { id, token } = await createLink(a, a.owner, 'Zähler');
    await view(token);
    await view(token);
    const { data } = await a.owner.client.from('follower_links').select('view_count, last_seen_at').eq('id', id).single();
    expect(data).toMatchObject({ view_count: 2 });
    expect((data as { last_seen_at: string | null }).last_seen_at).not.toBeNull();
  });

  it('lets only owner and adult create links, and members cannot publish', async () => {
    for (const user of [a.member, a.child]) {
      const { error } = await user.client.rpc('create_follower_link', { p_trip_id: a.family.tripId, p_label: 'x', p_token_hash: 'a'.repeat(64) });
      expect(error?.code).toBe('42501');
    }
    const { error } = await b.owner.client.rpc('create_follower_link', { p_trip_id: a.family.tripId, p_label: 'x', p_token_hash: 'b'.repeat(64) });
    expect(error?.code).toBe('42501');
    const publish = await a.member.client.from('wildlife_sightings').update({ shared_with_followers: true }).eq('id', ids.otherSighting);
    expect(publish.error?.code ?? 'no-error-but-no-row').toMatch(/42501|no-error/);
    const { data } = await admin.from('wildlife_sightings').select('shared_with_followers').eq('id', ids.otherSighting).single();
    expect((data as { shared_with_followers: boolean }).shared_with_followers).toBe(false);
  });

  it('keeps links invisible to members and other families (RLS) and the token hash unguessable', async () => {
    const { id } = await createLink(a, a.owner, 'Nur Erwachsene');
    expect((await a.adult.client.from('follower_links').select('id').eq('id', id)).data).toHaveLength(1);
    expect((await a.member.client.from('follower_links').select('id').eq('id', id)).data).toHaveLength(0);
    expect((await a.child.client.from('follower_links').select('id').eq('id', id)).data).toHaveLength(0);
    expect((await b.owner.client.from('follower_links').select('id').eq('id', id)).data).toHaveLength(0);
    const direct = await a.owner.client.from('follower_links').insert({ family_id: a.family.id, trip_id: a.family.tripId, label: 'direkt', token_hash: 'c'.repeat(64) });
    expect(direct.error).not.toBeNull();
  });

  it('treats unknown, malformed, revoked and expired links alike (404) and revoking takes effect immediately', async () => {
    expect((await view('x'.repeat(10))).status).toBe(404);
    expect((await view(randomBytes(32).toString('base64url'))).status).toBe(404);
    const live = await createLink(a, a.owner, 'Widerruf');
    expect((await view(live.token)).status).toBe(200);
    const denied = await a.member.client.rpc('revoke_follower_link', { p_link_id: live.id });
    expect(denied.error?.code).toBe('42501');
    expect((await b.owner.client.rpc('revoke_follower_link', { p_link_id: live.id })).error?.code).toBe('42501');
    expect((await view(live.token)).status).toBe(200);
    expect((await a.adult.client.rpc('revoke_follower_link', { p_link_id: live.id })).error).toBeNull();
    expect((await view(live.token)).status).toBe(404);
    expect((await media(live.token, ids.sharedPhoto)).status).toBe(404);

    const expiring = await createLink(a, a.owner, 'Ablauf', new Date(Date.now() + 3_600_000).toISOString());
    expect((await view(expiring.token)).status).toBe(200);
    await admin.from('follower_links').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', expiring.id);
    expect((await view(expiring.token)).status).toBe(404);
  });

  it('serves a shared photo as a re-encoded JPEG without camera data or GPS, scaled down', async () => {
    const { token } = await createLink(a, a.owner, 'Foto');
    const original = await sharp(await jpegWithGps()).metadata();
    expect(original.exif).toBeDefined(); // control: the stored original does carry EXIF/GPS
    const res = await media(token, ids.sharedPhoto, 480);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBe(480);
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
  });

  it('refuses photos that are not published, belong to a future stop, another family, or use an invalid size', async () => {
    const mine = await createLink(a, a.owner, 'Fremde');
    const theirs = await createLink(b, b.owner, 'Andere Familie');
    expect((await media(mine.token, ids.hiddenPhoto)).status).toBe(404);
    expect((await media(mine.token, ids.futurePhoto)).status).toBe(404);
    expect((await media(theirs.token, ids.sharedPhoto)).status).toBe(404);
    expect((await media(mine.token, ids.sharedPhoto, 999)).status).toBe(404);
    expect((await media(mine.token, 'not-a-uuid')).status).toBe(404);
    expect((await media(mine.token, ids.sharedPhoto)).status).toBe(200);
  });

  it('stops serving a photo as soon as it is unpublished', async () => {
    const { token } = await createLink(a, a.owner, 'Zurückgezogen');
    expect((await media(token, ids.sharedPhoto)).status).toBe(200);
    await a.adult.client.from('media_assets').update({ shared_with_followers: false }).eq('id', ids.sharedPhoto);
    expect((await media(token, ids.sharedPhoto)).status).toBe(404);
    expect(((await view(token)).body as FollowerView).photos).toEqual([]);
    await a.adult.client.from('media_assets').update({ shared_with_followers: true }).eq('id', ids.sharedPhoto);
  });
});
