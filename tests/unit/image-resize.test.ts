import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_EDGE, MIN_BYTES_TO_RESIZE, resizeForUpload, targetSize } from '@/lib/db/image-resize';

afterEach(() => vi.unstubAllGlobals());

describe('targetSize', () => {
  it('keeps images that already fit and scales the long edge down with the aspect ratio', () => {
    expect(targetSize(2000, 1500)).toBeNull();
    expect(targetSize(MAX_EDGE, 100)).toBeNull();
    expect(targetSize(4032, 3024)).toEqual({ width: 2560, height: 1920 });
    expect(targetSize(3024, 4032)).toEqual({ width: 1920, height: 2560 });
    expect(targetSize(8000, 1)).toEqual({ width: 2560, height: 1 });
  });
});

describe('resizeForUpload', () => {
  const big = new Blob([new Uint8Array(MIN_BYTES_TO_RESIZE + 10)], { type: 'image/jpeg' });

  it('leaves small files, videos and unsupported types alone', async () => {
    expect(await resizeForUpload(new Blob([new Uint8Array(1000)], { type: 'image/jpeg' }))).toBeNull();
    expect(await resizeForUpload(new Blob([new Uint8Array(MIN_BYTES_TO_RESIZE + 1)], { type: 'video/mp4' }))).toBeNull();
    expect(await resizeForUpload(new Blob([new Uint8Array(MIN_BYTES_TO_RESIZE + 1)], { type: 'image/gif' }))).toBeNull();
  });

  it('falls back to the original when the browser cannot decode or encode', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    expect(await resizeForUpload(big)).toBeNull();
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('cannot decode')));
    expect(await resizeForUpload(big)).toBeNull();
  });

  it('returns the smaller re-encoded JPEG and closes the bitmap', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 4032, height: 3024, close }));
    const small = new Blob([new Uint8Array(500_000)], { type: 'image/jpeg' });
    const drawn: number[][] = [];
    vi.stubGlobal('OffscreenCanvas', class { constructor(public width: number, public height: number) { drawn.push([width, height]); } getContext() { return { drawImage: () => undefined }; } convertToBlob() { return Promise.resolve(small); } });
    expect(await resizeForUpload(big)).toBe(small);
    expect(drawn).toEqual([[2560, 1920]]);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('keeps the original when re-encoding would not make the file smaller', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 3000, height: 2000, close: () => undefined }));
    const bigger = new Blob([new Uint8Array(MIN_BYTES_TO_RESIZE + 500)], { type: 'image/jpeg' });
    vi.stubGlobal('OffscreenCanvas', class { getContext() { return { drawImage: () => undefined }; } convertToBlob() { return Promise.resolve(bigger); } });
    expect(await resizeForUpload(big)).toBeNull();
  });
});
