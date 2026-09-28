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

// Extension for each type encode() can return. PNG is listed so that, in the
// never-expected case of a canvas that encodes neither WebP nor JPEG, the file
// is at least NAMED and TYPED as what it is instead of masquerading as .jpg.
const EXT_FOR_MIME = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

/**
 * @param {File} file - the user-selected image file
 * @returns {Promise<{ thumb: Blob, card: Blob, full: Blob, ext: 'webp' | 'jpg' | 'png', mime: string }>}
 */
export async function resizeToVariants(file) {
  const bitmap = await createImageBitmap(file);
  try {
    // Probe encoding once on the first variant; reuse the chosen format
    // for the others so a single source can't end up with mixed
    // extensions (which would defeat the suffix-swap variant URL scheme).
    const probe = await encode(bitmap, sizeFor(bitmap, VARIANT_LONGEST_EDGE.card));
    // `mime` is what the browser ACTUALLY produced; callers upload with it as
    // the Content-Type, so the stored type can never disagree with the bytes.
    const mime = probe.type;
    const ext = EXT_FOR_MIME[mime] || 'jpg';
    const card = probe;
    const [thumb, full] = await Promise.all([
      encode(bitmap, sizeFor(bitmap, VARIANT_LONGEST_EDGE.thumb), mime),
      encode(bitmap, sizeFor(bitmap, VARIANT_LONGEST_EDGE.full), mime),
    ]);
    return { thumb, card, full, ext, mime };
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

  // Prefer WebP; fall back to JPEG if the browser can't encode it.
  //
  // A browser that can't encode the requested type does NOT fail — per spec,
  // canvas.toBlob / convertToBlob silently return PNG instead. The old check
  // (`blob.type.startsWith('image/')`) accepted that PNG as the WebP result,
  // so on such a browser (older Safari / iOS) every photo was stored as a
  // ~750 KB PNG named `.jpg` and served as image/jpeg — listing 0106003's
  // card photos were ~9.7 MB in total. Only the EXACT requested type counts.
  const tryMime = preferredMime || 'image/webp';
  const blob = await canvasToBlob(canvas, tryMime, QUALITY);
  if (blob && blob.size > 0 && blob.type === tryMime) return blob;
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
