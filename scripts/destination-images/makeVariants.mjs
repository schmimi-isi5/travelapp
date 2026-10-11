import { createRequire } from 'node:module';
const sharp = createRequire(import.meta.url)('sharp');

/** Re-encodes a photo into the planned WebP variants (cover crop, attention-based; no metadata is carried over). */
export async function makeVariants(buffer, plan) {
  const out = [];
  for (const spec of plan) {
    const pipeline = sharp(buffer, { limitInputPixels: 120_000_000 }).rotate();
    const resized = spec.height ? pipeline.resize({ width: spec.width, height: spec.height, fit: 'cover', position: 'attention', withoutEnlargement: true }) : pipeline.resize({ width: spec.width, withoutEnlargement: true });
    const { data, info } = await resized.webp({ quality: spec.quality, effort: 5 }).toBuffer({ resolveWithObject: true });
    out.push({ key: spec.key, buffer: data, width: info.width, height: info.height });
  }
  return out;
}
