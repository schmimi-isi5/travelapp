/** What a JPEG's EXIF block says about where, when and with what a photo was taken. Everything is optional: nothing is guessed. */
export interface ExifMetadata {
  /** Shooting time as written by the camera (local clock time, marked as UTC like the rest of the app). */
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Metres above sea level (negative below). */
  altitudeM: number | null;
  /** "Make Model", e.g. "Apple iPhone 14". */
  camera: string | null;
}

export const EMPTY_EXIF: ExifMetadata = { capturedAt: null, latitude: null, longitude: null, altitudeM: null, camera: null };

interface Entry {
  type: number;
  count: number;
  /** Absolute position of the value bytes (inline in the entry or at the offset it points to). */
  at: number;
}

const TYPE_SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1 };

/** Reads the TIFF structure inside an APP1 "Exif" segment. Never throws: damaged or truncated data yields what could be read. */
function readTiff(view: DataView, tiff: number): ExifMetadata {
  const out: ExifMetadata = { ...EMPTY_EXIF };
  try {
    const order = view.getUint16(tiff);
    if (order !== 0x4949 && order !== 0x4d4d) return out;
    const little = order === 0x4949;
    const u16 = (o: number) => view.getUint16(o, little);
    const u32 = (o: number) => view.getUint32(o, little);
    const inside = (o: number, n: number) => o >= 0 && o + n <= view.byteLength;

    const ifd = (start: number): Map<number, Entry> => {
      const entries = new Map<number, Entry>();
      if (!inside(start, 2)) return entries;
      const count = Math.min(u16(start), 512);
      for (let i = 0; i < count; i++) {
        const entry = start + 2 + i * 12;
        if (!inside(entry, 12)) break;
        const type = u16(entry + 2);
        const n = u32(entry + 4);
        const size = (TYPE_SIZE[type] ?? 1) * n;
        const at = size <= 4 ? entry + 8 : tiff + u32(entry + 8);
        if (inside(at, size)) entries.set(u16(entry), { type, count: n, at });
      }
      return entries;
    };
    const ascii = (e: Entry | undefined): string | null => {
      if (!e || e.type !== 2) return null;
      let text = '';
      for (let i = 0; i < e.count; i++) {
        const c = view.getUint8(e.at + i);
        if (c === 0) break;
        text += String.fromCharCode(c);
      }
      return text.trim() || null;
    };
    const rationals = (e: Entry | undefined, n: number): number[] | null => {
      if (!e || e.type !== 5 || e.count < n) return null;
      const values: number[] = [];
      for (let i = 0; i < n; i++) {
        const numerator = u32(e.at + i * 8);
        const denominator = u32(e.at + i * 8 + 4);
        if (denominator === 0) return null;
        values.push(numerator / denominator);
      }
      return values;
    };

    const ifd0 = ifd(tiff + u32(tiff + 4));
    const make = ascii(ifd0.get(0x010f));
    const model = ascii(ifd0.get(0x0110));
    // many cameras repeat the maker in the model name ("Canon Canon EOS R5")
    out.camera = model ? (make && !model.toLowerCase().startsWith(make.toLowerCase().split(' ')[0] ?? '') ? `${make} ${model}` : model) : make;

    const exifPointer = ifd0.get(0x8769);
    if (exifPointer) {
      const taken = ascii(ifd(tiff + u32(exifPointer.at)).get(0x9003));
      const match = taken ? /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(taken) : null;
      if (match && match[1] !== '0000') out.capturedAt = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}.000Z`;
    }

    const gpsPointer = ifd0.get(0x8825);
    if (gpsPointer) {
      const gps = ifd(tiff + u32(gpsPointer.at));
      const lat = rationals(gps.get(2), 3);
      const lon = rationals(gps.get(4), 3);
      const latRef = ascii(gps.get(1));
      const lonRef = ascii(gps.get(3));
      if (lat && lon && (latRef === 'N' || latRef === 'S') && (lonRef === 'E' || lonRef === 'W')) {
        const toDegrees = ([d, m, s]: number[]) => (d ?? 0) + (m ?? 0) / 60 + (s ?? 0) / 3600;
        const latitude = (latRef === 'S' ? -1 : 1) * toDegrees(lat);
        const longitude = (lonRef === 'W' ? -1 : 1) * toDegrees(lon);
        // 0/0 is what cameras write when they had no fix: not a place
        if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 && !(latitude === 0 && longitude === 0)) {
          out.latitude = Math.round(latitude * 1e6) / 1e6;
          out.longitude = Math.round(longitude * 1e6) / 1e6;
          const altitude = rationals(gps.get(6), 1)?.[0];
          const below = gps.get(5) && gps.get(5)!.type === 1 ? view.getUint8(gps.get(5)!.at) === 1 : false;
          if (altitude !== undefined && Number.isFinite(altitude) && altitude < 10_000) out.altitudeM = Math.round((below ? -altitude : altitude) * 10) / 10;
        }
      }
    }
  } catch {
    // truncated or damaged block: keep whatever was read before
  }
  return out;
}

/** Reads capture time, GPS position, altitude and camera from a JPEG. Returns empty values for anything else. */
export function readExifMetadata(buffer: ArrayBuffer): ExifMetadata {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return { ...EMPTY_EXIF };
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    const marker = view.getUint16(offset);
    const size = view.getUint16(offset + 2);
    if (marker === 0xffe1 && offset + 10 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) return readTiff(view, offset + 10);
    if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
    offset += 2 + size;
  }
  return { ...EMPTY_EXIF };
}
