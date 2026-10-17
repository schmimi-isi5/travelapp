/** Builds small JPEG files with an EXIF block (camera, shooting time, GPS) for tests. */
export interface FixtureExif {
  make?: string;
  model?: string;
  /** "YYYY:MM:DD HH:MM:SS" */
  taken?: string;
  gps?: { latRef: 'N' | 'S'; lat: [number, number, number]; lonRef: 'E' | 'W'; lon: [number, number, number]; altitude?: number; belowSeaLevel?: boolean; zeroDenominator?: boolean };
  littleEndian?: boolean;
}

interface Tag {
  id: number;
  type: 1 | 2 | 4 | 5;
  count: number;
  data: number[];
}

export function jpegWithExif(exif: FixtureExif = {}): Uint8Array<ArrayBuffer> {
  const little = exif.littleEndian ?? true;
  const u16 = (n: number) => (little ? [n & 255, n >> 8] : [n >> 8, n & 255]);
  const u32 = (n: number) => (little ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255] : [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  const ascii = (id: number, text: string): Tag => ({ id, type: 2, count: text.length + 1, data: [...Buffer.from(`${text}\0`, 'latin1')] });
  const rational = (n: number, d: number) => [...u32(n), ...u32(d)];

  /** An IFD at `start`; values larger than 4 bytes go behind the entries. Returns the bytes and the position after them. */
  const ifd = (tags: (Tag & { pointer?: boolean })[], start: number) => {
    const sorted = [...tags].sort((a, b) => a.id - b.id);
    let dataAt = start + 2 + sorted.length * 12 + 4;
    const head: number[] = [...u16(sorted.length)];
    const tail: number[] = [];
    for (const tag of sorted) {
      head.push(...u16(tag.id), ...u16(tag.type), ...u32(tag.count));
      if (tag.data.length <= 4) head.push(...tag.data, ...Array(4 - tag.data.length).fill(0));
      else {
        head.push(...u32(dataAt));
        tail.push(...tag.data);
        dataAt += tag.data.length;
      }
    }
    head.push(...u32(0));
    return { bytes: [...head, ...tail], end: dataAt };
  };

  // layout: header(8) | IFD0 | Exif IFD | GPS IFD
  const ifd0Tags: Tag[] = [];
  if (exif.make) ifd0Tags.push(ascii(0x010f, exif.make));
  if (exif.model) ifd0Tags.push(ascii(0x0110, exif.model));
  const placeholder = (id: number): Tag => ({ id, type: 4, count: 1, data: u32(0) });
  const wantsExif = Boolean(exif.taken);
  const wantsGps = Boolean(exif.gps);
  if (wantsExif) ifd0Tags.push(placeholder(0x8769));
  if (wantsGps) ifd0Tags.push(placeholder(0x8825));
  const ifd0Size = ifd(ifd0Tags, 8).end - 8;
  const exifStart = 8 + ifd0Size;
  const exifTags = exif.taken ? [ascii(0x9003, exif.taken)] : [];
  const exifBlock = wantsExif ? ifd(exifTags, exifStart) : { bytes: [], end: exifStart };
  const gpsStart = exifBlock.end;
  const g = exif.gps;
  const gpsTags: Tag[] = g
    ? [
        ascii(1, g.latRef),
        { id: 2, type: 5, count: 3, data: [...rational(g.lat[0], 1), ...rational(g.lat[1], 1), ...rational(g.lat[2] * 100, g.zeroDenominator ? 0 : 100)] },
        ascii(3, g.lonRef),
        { id: 4, type: 5, count: 3, data: [...rational(g.lon[0], 1), ...rational(g.lon[1], 1), ...rational(g.lon[2] * 100, 100)] },
        ...(g.altitude !== undefined ? ([{ id: 5, type: 1, count: 1, data: [g.belowSeaLevel ? 1 : 0] }, { id: 6, type: 5, count: 1, data: rational(Math.round(g.altitude * 10), 10) }] as Tag[]) : []),
      ]
    : [];
  const finalIfd0Tags = ifd0Tags.map((t) => (t.id === 0x8769 ? { ...t, data: u32(exifStart) } : t.id === 0x8825 ? { ...t, data: u32(gpsStart) } : t));
  const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...ifd(finalIfd0Tags, 8).bytes, ...exifBlock.bytes, ...(wantsGps ? ifd(gpsTags, gpsStart).bytes : [])];
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const size = app1.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, size >> 8, size & 255, ...app1, 0xff, 0xd9]);
}

/** Etosha: 18°51'18" S, 16°19'45" E (about -18.855, 16.3292). */
export const ETOSHA_GPS: NonNullable<FixtureExif['gps']> = { latRef: 'S', lat: [18, 51, 18], lonRef: 'E', lon: [16, 19, 45], altitude: 1100 };
