import { beforeEach, describe, expect, it } from 'vitest';
import { addMedia, detectKind, MediaError, OFFLINE_QUEUE_LIMIT_BYTES, readExifCaptureDate, validateFile } from '@/lib/db/media';
import { addDocument, DocumentError, openDocument } from '@/lib/db/documents';
import { loadBlob } from '@/lib/db/blob-store';
import { getLocalDb, getRemoteSimDb } from '@/lib/db/local';
import { list } from '@/lib/db/repo';
import { DEMO_FAMILY_ID, DEMO_TRIP_ID } from '@/lib/db/demo-data';
import { DemoRemote } from '@/lib/offline/remote-demo';
import { setSimulatedOffline } from '@/lib/offline/network';
import { syncNow } from '@/lib/offline/sync';
import { freshWorld } from './helpers';

function jpegWithExif(date: string): ArrayBuffer {
  const ascii = new TextEncoder().encode(`${date}\0`);
  // TIFF (little endian): header, IFD0 with ExifIFD pointer, ExifIFD with DateTimeOriginal.
  const tiff = new Uint8Array(8 + 2 + 12 + 4 + 2 + 12 + 4 + ascii.length);
  const v = new DataView(tiff.buffer);
  tiff.set([0x49, 0x49, 0x2a, 0x00]);
  v.setUint32(4, 8, true);
  v.setUint16(8, 1, true);
  v.setUint16(10, 0x8769, true); v.setUint16(12, 4, true); v.setUint32(14, 1, true); v.setUint32(18, 26, true);
  v.setUint32(22, 0, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 0x9003, true); v.setUint16(30, 2, true); v.setUint32(32, ascii.length, true); v.setUint32(36, 44, true);
  v.setUint32(40, 0, true);
  tiff.set(ascii, 44);
  const exif = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff]);
  const out = new Uint8Array(2 + 2 + 2 + exif.length + 2);
  const o = new DataView(out.buffer);
  o.setUint16(0, 0xffd8); o.setUint16(2, 0xffe1); o.setUint16(4, exif.length + 2);
  out.set(exif, 6);
  o.setUint16(6 + exif.length, 0xffd9);
  return out.buffer;
}

describe('media validation', () => {
  it('detects kinds and rejects unknown types, empty and oversized files', () => {
    expect(detectKind('image/jpeg')).toBe('photo');
    expect(detectKind('audio/webm;codecs=opus')).toBe('audio');
    expect(detectKind('application/x-msdownload')).toBeNull();
    expect(() => validateFile({ name: 'a.exe', type: 'application/x-msdownload', size: 5 })).toThrow(MediaError);
    expect(() => validateFile({ name: 'a.jpg', type: 'image/jpeg', size: 0 })).toThrow(/leer/);
    expect(() => validateFile({ name: 'a.jpg', type: 'image/jpeg', size: 26 * 1024 * 1024 })).toThrow(/groß/);
    expect(validateFile({ name: 'v.mp4', type: 'video/mp4', size: 1000 })).toBe('video');
  });
  it('reads the EXIF capture date but nothing else', () => {
    expect(readExifCaptureDate(jpegWithExif('2026:10:21 17:40:05'))).toBe('2026-10-21T17:40:05.000Z');
    expect(readExifCaptureDate(new ArrayBuffer(8))).toBeNull();
  });
});

describe('media storage and upload queue', () => {
  beforeEach(() => freshWorld());

  it('stores a file, queues it offline and uploads it after reconnecting', async () => {
    setSimulatedOffline(true);
    const file = new File([new Uint8Array(2048)], 'foto.png', { type: 'image/png' });
    const asset = await addMedia({ file, familyId: DEMO_FAMILY_ID, tripId: DEMO_TRIP_ID });
    expect(asset.upload_state).toBe('queued');
    expect(await getRemoteSimDb().blobs.get(asset.storage_path)).toBeUndefined();
    setSimulatedOffline(false);
    const summary = await syncNow(new DemoRemote());
    expect(summary.uploaded).toBe(1);
    expect(await getRemoteSimDb().blobs.get(asset.storage_path)).toBeDefined();
    expect((await list('media_assets')).find((m) => m.id === asset.id)?.upload_state).toBe('uploaded');
    expect((await getRemoteSimDb().entity('media_assets').get(asset.id))?.upload_state).toBe('uploaded');
  });
  it('refuses new files when the offline queue limit would be exceeded', async () => {
    setSimulatedOffline(true);
    const big = { name: 'x.mp4', type: 'video/mp4', size: OFFLINE_QUEUE_LIMIT_BYTES + 1 } as File;
    await expect(addMedia({ file: big, familyId: DEMO_FAMILY_ID, tripId: DEMO_TRIP_ID })).rejects.toMatchObject({ code: expect.stringMatching(/TOO_LARGE|QUEUE_FULL/) });
  });
  it('rejects disallowed types before anything is stored', async () => {
    const before = await getLocalDb().blobs.count();
    await expect(addMedia({ file: new File(['x'], 'a.exe', { type: 'application/x-msdownload' }), familyId: DEMO_FAMILY_ID, tripId: DEMO_TRIP_ID })).rejects.toBeInstanceOf(MediaError);
    expect(await getLocalDb().blobs.count()).toBe(before);
  });
});

describe('document vault', () => {
  beforeEach(() => freshWorld());

  it('stores sensitive documents encrypted and only opens them with the right passphrase', async () => {
    const secret = new Uint8Array([37, 80, 68, 70, 1, 2, 3, 4, 5]);
    const doc = await addDocument({ file: new File([secret], 'pass.pdf', { type: 'application/pdf' }), familyId: DEMO_FAMILY_ID, classification: 'passport', passphrase: 'geheim-123' });
    expect(doc.access_level).toBe('sensitive');
    const stored = new Uint8Array(await (await loadBlob(getLocalDb(), doc.id))!.blob.arrayBuffer());
    expect(Array.from(stored).join(',')).not.toContain('37,80,68,70');
    await expect(openDocument(doc, 'falsch')).rejects.toMatchObject({ code: 'WRONG_PASSPHRASE' });
    await expect(openDocument(doc)).rejects.toMatchObject({ code: 'PASSPHRASE_REQUIRED' });
    const opened = new Uint8Array(await (await openDocument(doc, 'geheim-123')).arrayBuffer());
    expect(Array.from(opened)).toEqual(Array.from(secret));
  });
  it('requires a passphrase for sensitive classes and validates the file type', async () => {
    const pdf = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    await expect(addDocument({ file: pdf, familyId: DEMO_FAMILY_ID, classification: 'insurance' })).rejects.toBeInstanceOf(DocumentError);
    await expect(addDocument({ file: new File(['x'], 'a.exe', { type: 'application/x-msdownload' }), familyId: DEMO_FAMILY_ID, classification: 'invoice' })).rejects.toMatchObject({ code: 'TYPE_NOT_ALLOWED' });
  });
  it('invoices stay readable for adults without a passphrase', async () => {
    const doc = await addDocument({ file: new File(['rechnung'], 'r.pdf', { type: 'application/pdf' }), familyId: DEMO_FAMILY_ID, classification: 'invoice', stayId: 'demo-stay-etosha' });
    expect(await (await openDocument(doc)).text()).toBe('rechnung');
  });
});

describe('blob storage fallback (browsers that cannot persist Blobs in IndexedDB)', () => {
  beforeEach(() => freshWorld());

  it('stores the bytes as an ArrayBuffer when putting a Blob fails and still reads a Blob back', async () => {
    const { storeBlob, loadBlob } = await import('@/lib/db/blob-store');
    const db = getLocalDb();
    const realPut = db.blobs.put.bind(db.blobs);
    let calls = 0;
    db.blobs.put = (async (record: Parameters<typeof realPut>[0]) => {
      calls += 1;
      if (record.blob) throw new Error('DataError: Blob not supported');
      return realPut(record);
    }) as typeof db.blobs.put;
    await storeBlob(db, 'x', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), 'x.png');
    expect(calls).toBe(2);
    const loaded = await loadBlob(db, 'x');
    expect(loaded?.blob.type).toBe('image/png');
    expect(new Uint8Array(await loaded!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });
});
