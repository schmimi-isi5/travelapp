import sharp from 'sharp';

export const FOLLOWER_IMAGE_WIDTHS = [480, 1600] as const;
export type FollowerImageWidth = (typeof FOLLOWER_IMAGE_WIDTHS)[number];

const MAX_INPUT_PIXELS = 100_000_000;
const MAX_PARALLEL = 2;

let running = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running >= MAX_PARALLEL) await new Promise<void>((resolve) => waiting.push(resolve));
  running += 1;
  try {
    return await task();
  } finally {
    running -= 1;
    waiting.shift()?.();
  }
}

/**
 * Re-encodes a photo for followers: applies the EXIF orientation, scales it down and writes a fresh JPEG.
 * sharp drops all metadata by default, so camera data and GPS coordinates never leave the server.
 * At most MAX_PARALLEL conversions run at once to keep the memory of a small container bounded.
 */
export function sanitizeImage(input: Buffer, width: FollowerImageWidth): Promise<Buffer> {
  return withSlot(() =>
    sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer(),
  );
}
