import { describe, it, expect } from 'vitest';
import { LIVE_CITIES } from '@/lib/cityRoutes';
import { CITY_PICKER_ENABLED, PARKED_HUB_TARGET } from '@/lib/cityPicker';

// The /property city picker is parked while only one city is live
// (src/lib/cityPicker.js, CLAUDE.md "/property city picker (parked)").
// These tests pin the switch to the data, so going live in a second city
// restores the hub without anyone remembering to.
describe('/property city picker', () => {
  it('is enabled exactly when more than one city is live', () => {
    expect(CITY_PICKER_ENABLED).toBe(LIVE_CITIES.length > 1);
  });

  it('parks on the only live city', () => {
    if (LIVE_CITIES.length === 1) expect(PARKED_HUB_TARGET).toBe(LIVE_CITIES[0]);
    else expect(PARKED_HUB_TARGET).toBeNull();
  });

  // The redirect itself (src/middleware.js) is checked over HTTP rather than
  // here: importing the real middleware under Vitest fails on next-intl's ESM
  // build, which imports 'next/server' without an extension.
});
