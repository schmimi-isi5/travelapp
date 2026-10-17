import { beforeEach, describe, expect, it } from 'vitest';
import { setActor } from '@/lib/db/actor';
import { DEMO_FAMILY_ID, DEMO_TRIP_ID, DEMO_USERS } from '@/lib/db/demo-data';
import { getLocalDb } from '@/lib/db/local';
import { addMedia } from '@/lib/db/media';
import { pendingMetadataPhotos, scanExistingPhotos } from '@/lib/db/photo-metadata';
import { get, list } from '@/lib/db/repo';
import { ETOSHA_GPS, jpegWithExif } from '../exif-fixture';
import { freshWorld } from './helpers';

const jpeg = (name: string, exif?: Parameters<typeof jpegWithExif>[0]) => new File([jpegWithExif(exif)], name, { type: 'image/jpeg' });
const upload = (file: File, extra: Partial<Parameters<typeof addMedia>[0]> = {}) => addMedia({ file, familyId: DEMO_FAMILY_ID, tripId: DEMO_TRIP_ID, ...extra });
const stopId = async (title: string) => (await list('trip_stops')).find((s) => s.title.startsWith(title))!.id;
const noRemote = { download: async () => null };

describe('photo metadata at upload', () => {
  beforeEach(() => freshWorld('owner', DEMO_USERS.ownerA));

  it('keeps position, altitude and camera and files the photo at the station near it', async () => {
    const asset = await upload(jpeg('etosha.jpg', { make: 'Apple', model: 'iPhone 14', taken: '2026:10:21 17:30:00', gps: ETOSHA_GPS }), { readExif: true });
    expect(asset).toMatchObject({ altitude_m: 1100, camera: 'Apple iPhone 14', stop_source: 'gps', captured_at: '2026-10-21T17:30:00.000Z' });
    expect(asset.latitude).toBeCloseTo(-18.855, 3);
    expect(asset.longitude).toBeCloseTo(16.3292, 3);
    expect(asset.stop_id).toBe(await stopId('Etosha'));
    expect(asset.exif_read_at).not.toBeNull();
    expect((await get('media_assets', asset.id))?.latitude).toBe(asset.latitude);
  });

  it('files a photo without a position by its shooting day', async () => {
    const asset = await upload(jpeg('dune.jpg', { taken: '2026:10:16 08:00:00' }), { readExif: true });
    expect(asset).toMatchObject({ stop_source: 'date', latitude: null, longitude: null });
    expect(asset.stop_id).toBe(await stopId('Sossusvlei'));
  });

  it('leaves a photo with neither position nor date without a station', async () => {
    const asset = await upload(jpeg('plain.jpg', { make: 'Samsung' }), { readExif: true });
    expect(asset).toMatchObject({ stop_id: null, stop_source: null, camera: 'Samsung' });
  });

  it('keeps the station a person chose, and does not assign when "no station" was chosen on purpose', async () => {
    const windhoek = await stopId('Windhoek');
    const chosen = await upload(jpeg('a.jpg', { gps: ETOSHA_GPS }), { readExif: true, stopId: windhoek });
    expect(chosen).toMatchObject({ stop_id: windhoek, stop_source: 'manual' });
    expect(chosen.latitude).not.toBeNull(); // the position is kept even though the station was set by hand
    const none = await upload(jpeg('b.jpg', { gps: ETOSHA_GPS }), { readExif: true, autoAssignStop: false });
    expect(none).toMatchObject({ stop_id: null, stop_source: null });
    expect(none.latitude).not.toBeNull();
  });

  it('reads nothing when reading is switched off, and nothing from other file types', async () => {
    expect(await upload(jpeg('c.jpg', { gps: ETOSHA_GPS }))).toMatchObject({ latitude: null, stop_id: null, exif_read_at: null });
    const png = await upload(new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 1])], 'd.png', { type: 'image/png' }), { readExif: true });
    expect(png).toMatchObject({ latitude: null, exif_read_at: null });
  });
});

describe('reading the metadata of photos that are already stored', () => {
  beforeEach(() => freshWorld('owner', DEMO_USERS.ownerA));

  it('reads the stored files, files photos at their station and marks them as read', async () => {
    const gps = await upload(jpeg('gps.jpg', { make: 'Google', model: 'Pixel 8', taken: '2026:10:21 10:00:00', gps: ETOSHA_GPS }));
    const dated = await upload(jpeg('dated.jpg', { taken: '2026:10:16 08:00:00' }));
    const empty = await upload(jpeg('empty.jpg', {}));
    const windhoek = await stopId('Windhoek');
    const placed = await upload(jpeg('placed.jpg', { gps: ETOSHA_GPS }), { stopId: windhoek });
    expect((await pendingMetadataPhotos()).map((m) => m.id).sort()).toEqual([gps.id, dated.id, empty.id, placed.id].sort());

    const summary = await scanExistingPhotos(noRemote);
    expect(summary).toEqual({ checked: 4, withLocation: 2, assigned: 2, withoutMetadata: 1, failed: 0 });

    expect(await get('media_assets', gps.id)).toMatchObject({ camera: 'Google Pixel 8', stop_source: 'gps', altitude_m: 1100, captured_at: '2026-10-21T10:00:00.000Z', stop_id: await stopId('Etosha') });
    expect(await get('media_assets', dated.id)).toMatchObject({ stop_source: 'date', stop_id: await stopId('Sossusvlei') });
    expect(await get('media_assets', empty.id)).toMatchObject({ stop_id: null, latitude: null });
    // a station that was set before is kept, the position is still stored
    const kept = await get('media_assets', placed.id);
    expect(kept).toMatchObject({ stop_id: windhoek, stop_source: 'manual' });
    expect(kept?.latitude).not.toBeNull();
    for (const m of await list('media_assets')) if (m.id === gps.id || m.id === dated.id || m.id === empty.id || m.id === placed.id) expect(m.exif_read_at).not.toBeNull();

    // nothing is read twice
    expect(await pendingMetadataPhotos()).toEqual([]);
    expect(await scanExistingPhotos(noRemote)).toEqual({ checked: 0, withLocation: 0, assigned: 0, withoutMetadata: 0, failed: 0 });
  });

  it('fetches a file that is not on this device and counts it as failed, to be tried again, when that is not possible', async () => {
    const photo = await upload(jpeg('far.jpg', { gps: ETOSHA_GPS }));
    await getLocalDb().blobs.delete(photo.id);
    const failed = await scanExistingPhotos(noRemote);
    expect(failed).toMatchObject({ checked: 0, failed: 1 });
    expect((await get('media_assets', photo.id))?.exif_read_at).toBeNull();

    const bytes = jpegWithExif({ gps: ETOSHA_GPS });
    const downloaded: string[] = [];
    const ok = await scanExistingPhotos({ download: async (path: string) => { downloaded.push(path); return new Blob([bytes], { type: 'image/jpeg' }); } });
    expect(ok).toMatchObject({ checked: 1, withLocation: 1, assigned: 1, failed: 0 });
    expect(downloaded).toEqual([photo.storage_path]);
    // a network error is a failure too, not a crash
    const second = await upload(jpeg('far2.jpg', { gps: ETOSHA_GPS }));
    await getLocalDb().blobs.delete(second.id);
    expect(await scanExistingPhotos({ download: async () => { throw new Error('offline'); } })).toMatchObject({ failed: 1 });
  });

  it('touches only the photos the person may edit: children and members their own, adults all', async () => {
    const own = await upload(jpeg('own.jpg', { gps: ETOSHA_GPS }));
    setActor({ userId: DEMO_USERS.childB, role: 'child' });
    const childs = await upload(jpeg('kind.jpg', { gps: ETOSHA_GPS }));
    expect((await pendingMetadataPhotos()).map((m) => m.id)).toEqual([childs.id]);
    expect((await scanExistingPhotos(noRemote)).checked).toBe(1);
    expect((await get('media_assets', own.id))?.exif_read_at).toBeNull();
    setActor({ userId: DEMO_USERS.adultB, role: 'adult' });
    expect((await pendingMetadataPhotos()).map((m) => m.id)).toEqual([own.id]);
  });
});
