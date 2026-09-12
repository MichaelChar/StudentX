/*
  CARTO Voyager basemap tiles — the one definition, shared by the two
  surfaces that use them: the results map (`ListingsMap`) and the PDP's
  "Where you'll be" (`ApproximateLocationMap`).

  It lives here because CARTO now requires an API key (issue #472) and that
  key has to appear in two tile URLs. Two copies of a URL carrying a
  credential is exactly the thing that drifts — one gets the key, the other
  quietly keeps serving watermarked tiles, and nobody notices because the
  watermark is easy to stop seeing.

  `/gigs` and the listing wizard's address picker are NOT here. They use plain
  OpenStreetMap tiles, which need no key and are not watermarked.

  THE KEY IS PUBLIC, AND THAT IS NOT AN OVERSIGHT. Leaflet builds this URL in
  the browser, so whatever goes in it ships in the client bundle and is
  readable in devtools. CARTO's protection is a DOMAIN RESTRICTION, not
  secrecy: the key is bound to studentx.uk at registration. Hence
  `NEXT_PUBLIC_`, alongside the Supabase anon key in `wrangler.jsonc`'s vars,
  which that file already documents as intentionally public for the same
  reason.

  `NEXT_PUBLIC_*` is inlined at BUILD time, so the value must exist AT BUILD.
  For production that means `.env.production`, which is committed and is what
  Next loads during a production build — not `wrangler.jsonc`, whose `vars` are
  runtime bindings, and not the Cloudflare dashboard, which has no build
  variables configured. A key living only in `.env.local` gives a green build
  and a watermarked production map: a silent failure, and one that already
  happened once (#472).

  The key is appended ONLY when present. Interpolating a missing value would
  send `?key=undefined`, which is worse than sending nothing: CARTO would
  reject it rather than fall back, and the map would be a grid of errors
  instead of the merely-watermarked tiles we have today. Absent key = exactly
  the current behaviour.
*/

const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_KEY;

/*
  `{s}` is Leaflet's subdomain placeholder and `{r}` resolves to `@2x` on
  retina — CARTO cites that extra request as one of raster's costs against
  vector. See the Maps section of CLAUDE.md for why moving to vector is a
  library migration rather than a URL change.

  THE `rastertiles/` PREFIX IS LOAD-BEARING. Positron is served at BOTH
  `/light_all/...` and `/rastertiles/light_all/...`, so the short form looks
  like the general shape of a CARTO tile URL. It is not: Voyager exists only
  under `rastertiles/`, and `/voyager/{z}/{x}/{y}.png` returns 404 — a grid of
  blank tiles on all four map surfaces, with no console error a passing build
  would surface. Verified 2026-09-12 against the live CDN, 1x and @2x.
*/
export const CARTO_TILE_URL =
  `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png` +
  (CARTO_KEY ? `?key=${CARTO_KEY}` : '');

/*
  Attribution is the free tier's actual price — CARTO's terms ask that the
  CARTO and OpenStreetMap credits stay visible. Do not remove it to tidy up a
  map corner.
*/
export const CARTO_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** True when a key is configured — used by the synthetic canary. */
export const CARTO_KEY_CONFIGURED = Boolean(CARTO_KEY);
