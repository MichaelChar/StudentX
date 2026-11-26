import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { IMAGES, MAP_PINS, PROPERTIES, getProperty, neighbours } from '@/lib/showcase/properties';
import { SHOWCASE_PAGE_ATTR } from '@/lib/showcase';
import messages from '@/messages/en.json';

// The showcase (src/app/[locale]/(showcase)). Its data is generated from the
// demo folder by scripts/showcase/prepare-images.py; these tests pin what the
// pages assume of it, so a rerun of the script can't quietly break a page.
const pub = (src) => join(process.cwd(), 'public', src);

describe('showcase properties', () => {
  it('has the shown properties, named by number', () => {
    expect(PROPERTIES.length).toBeGreaterThan(0);
    for (const p of PROPERTIES) expect(p.num, p.num).toMatch(/^\d{3}$/);
  });

  it('serves every photo and thumbnail it lists', () => {
    for (const p of PROPERTIES) {
      expect(p.photos.length, p.num).toBeGreaterThan(0);
      for (const ph of p.photos) {
        expect(existsSync(pub(ph.src)), ph.src).toBe(true);
        expect(existsSync(pub(ph.thumb)), ph.thumb).toBe(true);
        expect(ph.w * ph.h * ph.tw * ph.th, ph.src).toBeGreaterThan(0);
      }
    }
  });

  it('serves the hero, kitchen pair, MG² and founder images', () => {
    for (const [key, img] of Object.entries(IMAGES)) expect(existsSync(pub(img.src)), key).toBe(true);
    // The sweep only reads as before/after if both photos share one frame.
    expect([IMAGES.kitchenBefore.w, IMAGES.kitchenBefore.h]).toEqual([IMAGES.kitchenAfter.w, IMAGES.kitchenAfter.h]);
  });

  it('gives every property a map pin and a story', () => {
    for (const p of PROPERTIES) {
      expect(MAP_PINS[p.num], `MAP_PINS has no ${p.num}`).toBeDefined();
      expect(messages.showcase.property.stories[p.num], `no story for ${p.num}`).toBeTruthy();
    }
  });

  it('pages between properties, wrapping round', () => {
    const first = PROPERTIES[0].num;
    const last = PROPERTIES[PROPERTIES.length - 1].num;
    expect(neighbours(first).prev).toBe(last);
    expect(neighbours(last).next).toBe(first);
    expect(getProperty('999')).toBeNull();
  });
});

// The canary and verify-deploy assert `data-showcase-page` on `/` and on a
// property page (src/lib/showcase.js). A page that drops it would go red only
// in production, after the flip.
describe('showcase pages carry their marker', () => {
  const root = join(process.cwd(), 'src/app/[locale]/(showcase)');
  const pages = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full);
      // [...rest] renders nothing: it only hands unknown URLs to not-found.js.
      else if (e === 'page.js' && !full.includes('[...rest]')) pages.push(full);
    }
  })(root);

  it('finds the pages', () => {
    expect(pages.length).toBeGreaterThanOrEqual(8);
  });

  for (const file of pages) {
    it(file.slice(root.length) || '/', () => {
      expect(readFileSync(file, 'utf8')).toMatch(/showcasePageProps\(/);
    });
  }

  it('names the attribute the checks look for', () => {
    expect(SHOWCASE_PAGE_ATTR).toBe('data-showcase-page');
  });
});
