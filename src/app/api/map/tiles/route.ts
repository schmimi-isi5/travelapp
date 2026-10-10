import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serves the self-hosted PMTiles archive (OpenStreetMap data, built by scripts/build-map-assets.sh) with HTTP range
 * support, which is how the PMTiles client reads single tiles. The archive holds public map data only, no personal data.
 */
function tilesFile(): string {
  return process.env.MAP_TILES_FILE ?? path.join(process.cwd(), 'data', 'map', 'namibia-botswana.pmtiles');
}

const RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;

function baseHeaders(size: number, mtimeMs: number): Record<string, string> {
  return {
    'Accept-Ranges': 'bytes',
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'public, max-age=3600',
    ETag: `"${size}-${Math.floor(mtimeMs)}"`,
  };
}

function notSatisfiable(size: number): Response {
  return new Response('range not satisfiable', { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
}

export async function GET(request: Request): Promise<Response> {
  const file = tilesFile();
  let info: { size: number; mtimeMs: number };
  try {
    info = await stat(file);
  } catch {
    return new Response('map tiles not installed', { status: 404 });
  }
  const { size } = info;
  const headers = baseHeaders(size, info.mtimeMs);
  const rangeHeader = request.headers.get('range');

  if (!rangeHeader) {
    const body = Readable.toWeb(createReadStream(file)) as ReadableStream;
    return new Response(body, { status: 200, headers: { ...headers, 'Content-Length': String(size) } });
  }

  const match = RANGE_PATTERN.exec(rangeHeader.trim());
  if (!match || (match[1] === '' && match[2] === '')) return notSatisfiable(size);
  let start: number;
  let end: number;
  if (match[1] === '') {
    start = Math.max(size - Number(match[2]), 0); // suffix range: last N bytes
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  if (start > end || start >= size) return notSatisfiable(size);

  const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
  return new Response(body, {
    status: 206,
    headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) },
  });
}
