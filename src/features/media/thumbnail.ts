const EDGE = 240;
let queue: Promise<unknown> = Promise.resolve();

async function render(file: Blob): Promise<string | null> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return null;
  try {
    // decoding straight to a small size keeps a 12-megapixel photo from filling the memory of a phone
    const bitmap = await createImageBitmap(file, { resizeWidth: EDGE, resizeQuality: 'low', imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
    try {
      const scale = Math.min(1, EDGE / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7));
      return blob ? URL.createObjectURL(blob) : null;
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/** Small preview of a photo as an object URL (the caller revokes it); null when the browser cannot decode the file. One at a time. */
export function makeThumbnail(file: Blob): Promise<string | null> {
  const next = queue.then(() => render(file));
  queue = next.catch(() => undefined);
  return next;
}
