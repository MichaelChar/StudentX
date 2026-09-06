/*
  CARTO Positron basemap tiles — the one definition, shared by the two
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

  `NEXT_PUBLIC_*` is inlined at BUILD time. The value must therefore exist in
  the Cloudflare Workers Build environment, not merely at runtime — a key
  living only in a local `.env.local` produces a green build and a watermarked
  production map, which is a silent failure worth stating twice.

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
*/
export const CARTO_POSITRON_URL =
  `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png` +
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
