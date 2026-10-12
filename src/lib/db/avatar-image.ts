/**
 * Profile photo: a small square JPEG (160 px) as data URL, small enough (< 40 KB) to live in the profile row and sync like any
 * other field. Re-encoding through a canvas drops EXIF data such as GPS. Returns null when the file cannot be decoded.
 */
export const AVATAR_EDGE = 160;
export const AVATAR_MAX_CHARS = 40_000;
const QUALITIES = [0.82, 0.7, 0.58, 0.46];

export async function avatarDataUrl(file: Blob): Promise<string | null> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    try {
      const edge = Math.min(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = AVATAR_EDGE;
      canvas.height = AVATAR_EDGE;
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, (bitmap.width - edge) / 2, (bitmap.height - edge) / 2, edge, edge, 0, 0, AVATAR_EDGE, AVATAR_EDGE);
      for (const quality of QUALITIES) {
        const url = canvas.toDataURL('image/jpeg', quality);
        if (url.length <= AVATAR_MAX_CHARS) return url;
      }
      return null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}
