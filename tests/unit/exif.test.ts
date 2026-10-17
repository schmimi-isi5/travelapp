import { describe, expect, it } from 'vitest';
import { EMPTY_EXIF, readExifMetadata } from '@/lib/media/exif';
import { ETOSHA_GPS, jpegWithExif } from '../exif-fixture';

const read = (bytes: Uint8Array) => readExifMetadata(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);

describe('readExifMetadata', () => {
  it('reads position, altitude, camera and shooting time', () => {
    const meta = read(jpegWithExif({ make: 'Apple', model: 'iPhone 14', taken: '2026:10:20 09:15:30', gps: ETOSHA_GPS }));
    expect(meta.latitude).toBeCloseTo(-18.855, 3);
    expect(meta.longitude).toBeCloseTo(16.3292, 3);
    expect(meta.altitudeM).toBe(1100);
    expect(meta.camera).toBe('Apple iPhone 14');
    expect(meta.capturedAt).toBe('2026-10-20T09:15:30.000Z');
  });

  it('knows the hemispheres: south/west are negative, north/east positive', () => {
    const gps = (latRef: 'N' | 'S', lonRef: 'E' | 'W') => read(jpegWithExif({ gps: { latRef, lat: [10, 30, 0], lonRef, lon: [20, 15, 0] } }));
    expect(gps('N', 'E')).toMatchObject({ latitude: 10.5, longitude: 20.25 });
    expect(gps('S', 'W')).toMatchObject({ latitude: -10.5, longitude: -20.25 });
  });

  it('reads both byte orders (Android and iPhone write different ones)', () => {
    for (const littleEndian of [true, false]) {
      const meta = read(jpegWithExif({ littleEndian, make: 'Canon', model: 'Canon EOS R5', taken: '2026:10:21 18:00:00', gps: ETOSHA_GPS }));
      expect(meta.latitude, String(littleEndian)).toBeCloseTo(-18.855, 3);
      expect(meta.capturedAt, String(littleEndian)).toBe('2026-10-21T18:00:00.000Z');
      expect(meta.camera, String(littleEndian)).toBe('Canon EOS R5'); // the maker is not repeated
    }
  });

  it('reads an altitude below sea level as negative', () => {
    expect(read(jpegWithExif({ gps: { ...ETOSHA_GPS, altitude: 12.5, belowSeaLevel: true } })).altitudeM).toBe(-12.5);
  });

  it('returns what is there when the rest is missing', () => {
    expect(read(jpegWithExif({ taken: '2026:10:20 09:15:30' }))).toEqual({ ...EMPTY_EXIF, capturedAt: '2026-10-20T09:15:30.000Z' });
    expect(read(jpegWithExif({ make: 'Samsung' }))).toEqual({ ...EMPTY_EXIF, camera: 'Samsung' });
    expect(read(jpegWithExif({ gps: ETOSHA_GPS })).capturedAt).toBeNull();
    expect(read(jpegWithExif({}))).toEqual(EMPTY_EXIF);
  });

  it('does not take a "no fix" position (0, 0) or impossible values for a place', () => {
    expect(read(jpegWithExif({ gps: { latRef: 'N', lat: [0, 0, 0], lonRef: 'E', lon: [0, 0, 0] } }))).toMatchObject({ latitude: null, longitude: null });
    expect(read(jpegWithExif({ gps: { latRef: 'N', lat: [95, 0, 0], lonRef: 'E', lon: [10, 0, 0] } }))).toMatchObject({ latitude: null });
    expect(read(jpegWithExif({ gps: { ...ETOSHA_GPS, zeroDenominator: true } }))).toMatchObject({ latitude: null, longitude: null });
  });

  it('gives empty values for anything that is not a JPEG and never throws on damaged data', () => {
    expect(readExifMetadata(new TextEncoder().encode('not a jpeg').buffer as ArrayBuffer)).toEqual(EMPTY_EXIF);
    expect(readExifMetadata(new ArrayBuffer(0))).toEqual(EMPTY_EXIF);
    const good = jpegWithExif({ make: 'Apple', model: 'iPhone 14', taken: '2026:10:20 09:15:30', gps: ETOSHA_GPS });
    for (const cut of [5, 12, 20, 40, 60, 90, good.length - 5]) expect(() => read(good.slice(0, cut))).not.toThrow();
    const noisy = good.slice();
    for (let i = 14; i < noisy.length - 2; i += 3) noisy[i] = (noisy[i]! + 77) & 255;
    expect(() => read(noisy)).not.toThrow();
  });
});
