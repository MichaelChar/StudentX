#!/usr/bin/env node
/*
  Renders StudentX's app and browser icons from the X of the Tesla wordmark
  (public/logo-tesla-2048w.png) — white on iris. Replaces the Next.js starter
  triangle that src/app/favicon.ico still was until 2026-10-03.

      node scripts/app-icons.mjs

  Writes:
    src/app/favicon.ico          32 + 16px (PNG-in-ICO), for /favicon.ico requests
    src/app/icon.png             512px, rounded — Next emits <link rel="icon">
    src/app/apple-icon.png       180px, full-bleed — iOS rounds it itself
    public/icons/icon-192.png    manifest, full-bleed (the OS applies its mask)
    public/icons/icon-512.png    manifest, full-bleed
    public/icons/icon-maskable-512.png  manifest `maskable`: the X sits inside
                                 the 80% safe zone Android may crop to

  The mark is a stand-in derived from the wordmark; swap the glyph source here
  if a designed icon arrives.
*/
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const IRIS = '#6058F7';
const WORDMARK = join(root, 'public/logo-tesla-2048w.png');

// The X is the wordmark's last glyph: find it from the alpha channel rather
// than hard-coding pixel offsets, so a re-exported wordmark still works.
async function xGlyph() {
  const { data, info } = await sharp(WORDMARK).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const inkCol = (x) => { for (let y = 0; y < H; y++) if (data[(y * W + x) * C + 3] > 40) return true; return false; };
  let x1 = W - 1; while (x1 > 0 && !inkCol(x1)) x1--;
  let x0 = x1; while (x0 > 0 && (inkCol(x0 - 1) || inkCol(x0 - 2) || inkCol(x0 - 3))) x0--;
  let y0 = H, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = x0; x <= x1; x++) if (data[(y * W + x) * C + 3] > 40) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const glyph = sharp(WORDMARK).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 });
  // White, keeping the glyph's alpha as the shape.
  const alpha = await glyph.clone().ensureAlpha().extractChannel(3).toBuffer();
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  return sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).joinChannel(alpha).png().toBuffer();
}

async function icon(size, { glyphRatio, radius = 0 }) {
  const glyph = await sharp(await xGlyph()).resize({ width: Math.round(size * glyphRatio) }).toBuffer();
  const g = await sharp(glyph).metadata();
  const bg = radius
    ? Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius * size}" fill="${IRIS}"/></svg>`)
    : Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="${IRIS}"/></svg>`);
  return sharp(bg).composite([{ input: glyph, left: Math.round((size - g.width) / 2), top: Math.round((size - g.height) / 2) }]).png().toBuffer();
}

// ICO container holding PNG frames (supported by every current browser).
function ico(pngs) {
  const header = Buffer.alloc(6); header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let offset = 6 + dir.length;
  pngs.forEach(({ size, buf }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o); dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2); dir.writeUInt8(0, o + 3); dir.writeUInt16LE(1, o + 4); dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(buf.length, o + 8); dir.writeUInt32LE(offset, o + 12);
    offset += buf.length;
  });
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

mkdirSync(join(root, 'public/icons'), { recursive: true });
const out = [
  ['src/app/icon.png', await icon(512, { glyphRatio: 0.56, radius: 0.22 })],
  ['src/app/apple-icon.png', await icon(180, { glyphRatio: 0.56 })],
  ['public/icons/icon-192.png', await icon(192, { glyphRatio: 0.56 })],
  ['public/icons/icon-512.png', await icon(512, { glyphRatio: 0.56 })],
  ['public/icons/icon-maskable-512.png', await icon(512, { glyphRatio: 0.42 })],
];
for (const [path, buf] of out) writeFileSync(join(root, path), buf);
const favicon = ico([
  { size: 32, buf: await icon(32, { glyphRatio: 0.62, radius: 0.22 }) },
  { size: 16, buf: await icon(16, { glyphRatio: 0.66, radius: 0.22 }) },
]);
writeFileSync(join(root, 'src/app/favicon.ico'), favicon);
console.log('wrote', [...out.map(([p, b]) => `${p} (${(b.length / 1024).toFixed(1)} KB)`), `src/app/favicon.ico (${(favicon.length / 1024).toFixed(1)} KB)`].join('\n      '));
