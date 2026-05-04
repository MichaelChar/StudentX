// Browser-side image resizer used by ListingForm before uploading to
// Supabase Storage. Generates three variants (thumb / card / full) so
// the public site can pick the right size for the surface — listing
// cards don't need a 4 MB hero image.
//
// Output format is WebP at 0.82 quality, ~70-80% smaller than the
// JPEGs phones produce while staying visually lossless. Modern
// browsers (last ~5 years) all encode WebP via canvas; if encoding
// fails we fall through to JPEG so uploads never silently break.

const VARIANT_LONGEST_EDGE = {
  thumb: 400,
  card: 800,
  full: 1600,
};

const QUALITY = 0.82;

/**
 * @param {File} file - the user-selected image file
 * @returns {Promise<{ thumb: Blob, card: Blob, full: Blob, ext: 'webp' | 'jpg' }>}
 */
export async function resizeToVariants(file) {
  const bitmap = await createImageBitmap(file);
  try {
    // Probe encoding once on the first variant; reuse the chosen format
    // for the others so a single source can't end up with mixed
    // extensions (which would defeat the suffix-swap variant URL scheme).
    const probe = await encode(bitmap, sizeFor(bitmap, VARIANT_LONGEST_EDGE.card));
    const ext = probe.type === 'image/webp' ? 'webp' : 'jpg';
    const mime = probe.type;
    const card = probe;
    const [thumb, full] = await Promise.all([
      encode(bitmap, sizeFor(bitmap, VARIANT_LONGEST_EDGE.thumb), mime),
      encode(bitmap, sizeFor(bitmap, VARIANT_LONGEST_EDGE.full), mime),
    ]);
    return { thumb, card, full, ext };
  } finally {
    bitmap.close?.();
  }
}

function sizeFor(bitmap, target) {
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= target) {
    // Don't upscale — re-encode at source dimensions for format conversion.
    return { w: bitmap.width, h: bitmap.height };
  }
  const scale = target / longest;
  return {
    w: Math.max(1, Math.round(bitmap.width * scale)),
    h: Math.max(1, Math.round(bitmap.height * scale)),
  };
}

async function encode(bitmap, { w, h }, preferredMime) {
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);

  // Prefer WebP; fall back to JPEG if the browser refuses.
  const tryMime = preferredMime || 'image/webp';
  const blob = await canvasToBlob(canvas, tryMime, QUALITY);
  if (blob && blob.size > 0 && blob.type.startsWith('image/')) return blob;
  return canvasToBlob(canvas, 'image/jpeg', QUALITY);
}

function canvasToBlob(canvas, type, quality) {
  if (canvas.convertToBlob) {
    return canvas.convertToBlob({ type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      type,
      quality
    );
  });
}
