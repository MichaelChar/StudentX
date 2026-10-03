#!/usr/bin/env node
/*
  Renders public/boarding/og.jpg — the link-preview card for /boarding
  (WhatsApp, iMessage, Instagram, LinkedIn). 1200×630, JPEG: WhatsApp drops
  preview images much over ~600 KB, and a JPEG of this card is ~10x smaller
  than the PNG equivalent.

  Every word on the card comes from src/messages/en.json, so the card cannot
  drift from the page's founder-locked copy — re-run this after editing it:

      node scripts/og-boarding.mjs

  Uses Playwright's Chromium (a devDependency). If its browser build is not
  installed, point PLAYWRIGHT_CHROMIUM_EXECUTABLE at any Chromium binary.
*/
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const msgs = JSON.parse(readFileSync(join(root, 'src/messages/en.json'), 'utf8'));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const eyebrow = esc(msgs.home.boarding); // "Swiss Boarding Schools"
const headline = esc(msgs.boarding.hero.headline); // locked copy, lowercase by design
const cta = esc(msgs.boarding.hero.cta);
// Inlined as data URIs: a page built with setContent() has no origin that may
// read file:// URLs, so <img src="file://..."> silently renders nothing.
const MIME = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' };
const asset = (p) =>
  `data:${MIME[p.split('.').pop()]};base64,${readFileSync(join(root, 'public', p)).toString('base64')}`;

const html = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600&display=block">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#fff;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0a2540;overflow:hidden}
  .card{position:relative;display:grid;grid-template-columns:470px 1fr;height:100%}
  .photo{position:relative;background:#f6f4ff}
  .photo img{position:absolute;left:50%;bottom:0;transform:translateX(-50%);height:560px;width:auto}
  .copy{display:flex;flex-direction:column;justify-content:center;gap:26px;padding:0 72px 0 64px}
  .eyebrow{font-weight:600;font-size:20px;letter-spacing:.18em;text-transform:uppercase;color:rgba(10,37,64,.7)}
  h1{font-weight:400;font-size:60px;line-height:1.08;letter-spacing:0;word-spacing:.08em;text-wrap:balance}
  .row{display:flex;align-items:center;justify-content:space-between;gap:24px;margin-top:8px}
  .cta{background:#6058F7;color:#fff;border-radius:999px;padding:16px 28px;font-weight:600;font-size:24px;word-spacing:.08em;white-space:nowrap;flex:none}
  .mark{height:22px;width:auto;flex:none}
</style></head><body><div class="card">
  <div class="photo"><img src="${asset('boarding/michael.webp')}" alt=""></div>
  <div class="copy">
    <div class="eyebrow">${eyebrow}</div>
    <h1>${headline}</h1>
    <div class="row"><span class="cta">${cta}</span><img class="mark" src="${asset('logo-tesla-2048w.png')}" alt=""></div>
  </div>
</div></body></html>`;

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(async () => { await document.fonts.ready; });
const png = await page.screenshot({ type: 'png' });
await browser.close();

const out = join(root, 'public/boarding/og.jpg');
const info = await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(out);
console.log(`wrote public/boarding/og.jpg — ${info.width}×${info.height}, ${(info.size / 1024).toFixed(0)} KB`);
