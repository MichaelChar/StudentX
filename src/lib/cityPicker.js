import { LIVE_CITIES } from './cityRoutes';

/*
  /property CITY PICKER — PARKED WHILE ONLY ONE CITY IS LIVE.
  ────────────────────────────────────────────────────────────

  /property is the multi-city hub: the animated globe (HubBackground), the
  country/city diagram (HubDiagram) and "Hover over your city". With
  Thessaloniki the only live city there is nothing to choose, and the page
  cost a 7.8s largest paint on desktop (polish plan PERF-3).

  Founder's call, 2026-10-03: until a second city is live, /property sends
  visitors straight to that city with a TEMPORARY 307 (src/middleware.js),
  and the sitemap stops listing /property. NOTHING IS DELETED — the hub page
  and its animation stay exactly as built, because they come back when there
  are more cities.

  It comes back on its own. CITY_PICKER_ENABLED is computed from the live
  cities in cityRoutes.js, so flipping a second city's `status` to 'live'
  restores the hub — no other change needed. To force it back sooner, set
  FORCE_CITY_PICKER to true.

  Referenced from CLAUDE.md ("/property city picker (parked)"). Search for
  this file name or "CITY_PICKER_ENABLED" to find every place that obeys it.
*/
const FORCE_CITY_PICKER = false;

export const CITY_PICKER_ENABLED = FORCE_CITY_PICKER || LIVE_CITIES.length > 1;

/** The city /property redirects to while the picker is parked, else null. */
export const PARKED_HUB_TARGET = CITY_PICKER_ENABLED ? null : LIVE_CITIES[0] ?? null;
