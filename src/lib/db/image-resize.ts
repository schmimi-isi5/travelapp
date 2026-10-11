/**
 * Shrinks large photos on the phone before they are queued for upload. A 12 MP photo is 3-6 MB; at 2560 px on the long
 * edge and JPEG 85 it is typically well under 1.5 MB, which matters on the slow connections of a trip. The original stays
 * in the phone's own photo library. Re-encoding through a canvas also drops EXIF data such as GPS coordinates.
 * Every failure path returns null so the original file is stored instead; resizing never blocks an upload.
 */
export const RESIZE_PREF_KEY = 'nb-photo-resize';
export const MAX_EDGE = 2560;
export const JPEG_QUALITY = 0.85;
/** Smaller files are not worth re-encoding. */
export const MIN_BYTES_TO_RESIZE = 1_500_000;

const RESIZABLE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/avif']);

export function isResizeEnabled(): boolean {
  try {
    return window.localStorage.getItem(RESIZE_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setResizeEnabled(value: boolean): void {
  try {
    window.localStorage.setItem(RESIZE_PREF_KEY, value ? '1' : '0');
  } catch {
    /* not persisted */
  }
}

/** Scaled size keeping the aspect ratio, or null when the image already fits. */
export function targetSize(width: number, height: number, maxEdge = MAX_EDGE): { width: number; height: number } | null {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return null;
  const scale = maxEdge / longEdge;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function encodeJpeg(bitmap: ImageBitmap, width: number, height: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, width, height);
    return canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
  }
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(bitmap, 0, 0, width, height);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', JPEG_QUALITY));
}

/** A smaller JPEG for a photo, or null when the original should be kept. */
export async function resizeForUpload(file: Blob): Promise<Blob | null> {
  if (!RESIZABLE_TYPES.has(file.type) || file.size < MIN_BYTES_TO_RESIZE) return null;
  if (typeof createImageBitmap === 'undefined') return null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const size = targetSize(bitmap.width, bitmap.height) ?? { width: bitmap.width, height: bitmap.height };
      const blob = await encodeJpeg(bitmap, size.width, size.height);
      return blob && blob.size > 0 && blob.size < file.size ? blob : null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null; // undecodable (e.g. HEIC in a browser without support): keep the original
  }
}
