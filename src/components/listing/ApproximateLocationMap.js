'use client';

import { MapContainer, TileLayer, Circle } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

/*
  ApproximateLocationMap — Feature 36 "Where you'll be".

  A privacy control, not a locator. The listing is someone's home; the
  exact address is withheld until a booking is confirmed. This renders a
  translucent circle around coords the CALLER has already coarsened.
  Rounding, jittering, or otherwise transforming lat/lng here was
  rejected: anonymisation belongs upstream so every surface (and the
  audit trail) shares one number.

  No Marker. A pin, or a circle small enough to pick out a building,
  would defeat the point. Leaflet is imported only for MapContainer /
  TileLayer / Circle — L.Icon is not patched because we never place one.

  Copy arrives translated. No useTranslations.

  Interaction is off entirely (not just scrollWheelZoom). Tried-and-
  rejected: allow pan with maxZoom locked. Panning a coarsened point
  still lets a student study the street grid at the circle's centre,
  which is more precise than this section is meant to offer. Commute
  context already lives in Feature 29's highlight rows. A fully static
  map can also be taken out of the accessibility tree (see `inert`
  below) so SR users get the heading and caption, not a control that
  does nothing.
*/

/*
  Zoom 15 at Thessaloniki's latitude (~40.6) draws a 200 m radius as
  ~110 px across. In the h-64 / sm:h-80 frame (256 / 320 px) that is
  roughly a third of the height — clearly an area.

  Zoom 16 (~221 px) fills most of the frame and reads as "this
  building". Zoom 14 (~55 px) shrinks the circle into a point-of-
  interest blob, which looks MORE precise, not less. Zoom is also
  locked as min=max so a later edit that re-enables zoom controls
  cannot in-zoom past this.
*/
const APPROXIMATE_ZOOM = 15;

const FALLBACK_RADIUS_METERS = 200;

/*
  Token `blue` (#635BFF) as a hex, not `var(--color-blue)`. Leaflet
  writes stroke/fill as SVG presentation attributes, which do not
  resolve CSS custom properties.
*/
const CIRCLE_PATH = {
  color: '#635BFF',
  fillColor: '#635BFF',
  fillOpacity: 0.16,
  weight: 2,
  opacity: 0.85,
};

const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export default function ApproximateLocationMap({
  lat,
  lng,
  radiusMeters = FALLBACK_RADIUS_METERS,
  heading,
  caption,
}) {
  // A map centred on null lands in the Atlantic. Strings are not
  // coerced — Number.isFinite does not, and the contract is numbers.
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  // Degenerate / missing radius would draw a pin-like point. Fall back
  // to the documented 200 m privacy radius rather than render one.
  // Finite values (including larger ones) pass through unclamped: a
  // bigger circle is more private, and shrinking a caller-supplied
  // radius would be making it more precise.
  const radius =
    Number.isFinite(radiusMeters) && radiusMeters > 0
      ? radiusMeters
      : FALLBACK_RADIUS_METERS;

  const hasHeading = typeof heading === 'string' && heading.length > 0;
  const hasCaption = typeof caption === 'string' && caption.length > 0;

  return (
    <div>
      {hasHeading ? (
        <h2 className="mb-4 font-display text-2xl leading-tight text-night">
          {heading}
        </h2>
      ) : null}

      {/*
        `inert` removes the subtree from pointer, keyboard, and the
        accessibility tree — including Leaflet's OSM/CARTO attribution
        links. Visible on-screen credit still satisfies the tile
        licence; taking those two links out of the tab order was
        preferred over leaving a decorative map as two extra tab stops.
        `aria-hidden` covers browsers that do not implement `inert`.
      */}
      <div
        className="h-64 w-full overflow-hidden rounded-photo border border-night/10 bg-parchment sm:h-80"
        inert
        aria-hidden="true"
      >
        <MapContainer
          center={[lat, lng]}
          zoom={APPROXIMATE_ZOOM}
          minZoom={APPROXIMATE_ZOOM}
          maxZoom={APPROXIMATE_ZOOM}
          scrollWheelZoom={false}
          dragging={false}
          zoomControl={false}
          doubleClickZoom={false}
          touchZoom={false}
          boxZoom={false}
          keyboard={false}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
          <Circle
            center={[lat, lng]}
            radius={radius}
            interactive={false}
            pathOptions={CIRCLE_PATH}
          />
        </MapContainer>
      </div>

      {hasCaption ? (
        <p className="mt-3 font-sans text-sm leading-snug text-night/60">
          {caption}
        </p>
      ) : null}
    </div>
  );
}
