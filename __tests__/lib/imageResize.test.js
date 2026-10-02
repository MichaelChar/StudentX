import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/*
  resizeToVariants against simulated browsers. A canvas asked for a type it
  can't encode returns PNG (that is the spec, not a failure) — which is how
  listing 0106003 ended up with ~750 KB PNG card photos named `.jpg` and
  served as image/jpeg: the old check accepted any `image/*` blob as "WebP".
*/

let encodable;
let requested;

class FakeOffscreenCanvas {
  constructor(width, height) {
    this.width = width;
    this.height = height;
  }
  getContext() {
    return { drawImage: () => {} };
  }
  async convertToBlob({ type }) {
    requested.push({ type, width: this.width, height: this.height });
    const produced = encodable.includes(type) ? type : 'image/png';
    return new Blob([new Uint8Array(16)], { type: produced });
  }
}

const bitmap = (width, height) => ({ width, height, close: vi.fn() });

beforeEach(() => {
  requested = [];
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function run(width = 3000, height = 4000) {
  vi.stubGlobal('createImageBitmap', async () => bitmap(width, height));
  const { resizeToVariants } = await import('@/lib/imageResize');
  return resizeToVariants(new Blob([new Uint8Array(8)], { type: 'image/heic' }));
}

describe('resizeToVariants', () => {
  it('uses WebP when the browser can encode it', async () => {
    encodable = ['image/webp', 'image/jpeg', 'image/png'];
    const v = await run();
    expect(v.ext).toBe('webp');
    expect(v.mime).toBe('image/webp');
    for (const k of ['thumb', 'card', 'full']) expect(v[k].type).toBe('image/webp');
  });

  it('falls back to REAL JPEG when WebP comes back as PNG (the 0106003 bug)', async () => {
    encodable = ['image/jpeg', 'image/png']; // older Safari: no WebP encoder
    const v = await run();
    expect(v.ext).toBe('jpg');
    expect(v.mime).toBe('image/jpeg');
    for (const k of ['thumb', 'card', 'full']) expect(v[k].type).toBe('image/jpeg');
  });

  it('never labels a PNG as .jpg, even if JPEG were unavailable too', async () => {
    encodable = ['image/png'];
    const v = await run();
    expect(v.mime).toBe('image/png');
    expect(v.ext).toBe('png');
  });

  it('downscales the longest edge to 400 / 800 / 1600 and never upscales', async () => {
    encodable = ['image/webp'];
    await run(3000, 4000);
    const sizes = requested.map((r) => Math.max(r.width, r.height));
    expect(new Set(sizes)).toEqual(new Set([400, 800, 1600]));

    // 640×480 source: the 800 and 1600 variants keep it (no upscale); only the
    // 400 thumb shrinks, keeping the aspect ratio.
    requested = [];
    await run(640, 480);
    const dims = requested.map((r) => `${r.width}x${r.height}`).sort();
    expect(dims).toEqual(['400x300', '640x480', '640x480']);
  });
});
