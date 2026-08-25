'use client';

import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvent } from 'react-leaflet';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { priceIconOptions, PIN_CLASS } from '@/lib/mapPriceIcon';
import MapPinPopupCard from '@/components/property/MapPinPopupCard';
import {
  getVisitedSnapshot,
  getVisitedServerSnapshot,
  subscribeVisited,
} from '@/lib/visitedListings';

// Thessaloniki city center
const THESSALONIKI_CENTER = [40.6301, 22.9439];
const DEFAULT_ZOOM = 13;

/*
  Grace period before a hover-opened popup closes, in ms.

  Without it the popup is unusable: it opens above the pin, so the pointer has
  to cross a gap to reach it, and the marker's `mouseout` fires the instant it
  leaves the pill. The timer gives the pointer time to arrive, and entering the
  popup cancels it outright.
*/
const POPUP_CLOSE_DELAY_MS = 180;

/*
  Keep a hover popup inside the map pane.

  The map column is only ~450px wide, so a popup on a pin near either edge
  hangs outside the container and is clipped by its `overflow-hidden`
  (measured: 39px of 267 lost on the right-hand pin at the default zoom).

  Leaflet's own answer is `autoPan`, rejected on purpose where the Popup is
  configured below: it moves the map, which slides the pin out from under the
  pointer, which fires mouseout, which closes the popup — a jitter loop on what
  is only a hover.

  So the popup BODY is nudged back in-bounds while the tail stays where Leaflet
  put it, still pointing at its pin. That is what Google Maps and Airbnb both
  do, and it costs one transform.

  WHY A ResizeObserver AND NOT JUST THE popupopen HANDLER:
  at `popupopen` the popup is still empty — measured 97px wide against a final
  267px, so the naive version computed "it fits" and did nothing. The card's
  photo loads asynchronously, so the box grows at least twice after the event.
  Observing the wrapper re-clamps on every one of those. Applying a transform
  does not change layout size, so this cannot feed itself.

  Bound on the MAP, not per-Marker: one listener instead of one per pin.
*/
function PopupViewportClamp() {
  const observerRef = useRef(null);

  const clamp = useCallback((wrapper, container) => {
    // Reset before measuring, or each pass compounds the last shift.
    wrapper.style.transform = '';
    const w = wrapper.getBoundingClientRect();
    const c = container.getBoundingClientRect();
    const PAD = 8;

    let shift = 0;
    if (w.right > c.right - PAD) shift = c.right - PAD - w.right;
    else if (w.left < c.left + PAD) shift = c.left + PAD - w.left;

    if (shift) wrapper.style.transform = `translateX(${Math.round(shift)}px)`;
  }, []);

  const disconnect = useCallback(() => {
    observerRef.current?.disconnect();
    observerRef.current = null;
  }, []);

  useMapEvent('popupopen', (event) => {
    const popupEl = event.popup?.getElement?.();
    const wrapper = popupEl?.querySelector('.leaflet-popup-content-wrapper');
    const container = popupEl?.closest('.leaflet-container');
    if (!wrapper || !container) return;

    disconnect();
    clamp(wrapper, container);

    if (typeof ResizeObserver === 'undefined') return;
    observerRef.current = new ResizeObserver(() => clamp(wrapper, container));
    observerRef.current.observe(wrapper);
  });

  useMapEvent('popupclose', disconnect);

  // The map can unmount with a popup still open (switching to list view).
  useEffect(() => disconnect, [disconnect]);

  return null;
}

/*
  Reports the map's visible bounds to the parent (parity Feature 14).

  Reporting is all this does. Nothing here fetches: the decision (spec §15,
  re-confirmed 2026-08-24) is that results refetch only when the student asks
  via `Search this area`.

  WHY USER-INITIATED IS TRACKED SEPARATELY:
  `moveend` fires for programmatic moves too, and Leaflet emits a couple during
  initial layout as the sticky map column settles and the container is
  measured. Treating those as pans made `Search this area` appear on page load,
  before the student had touched anything — observed, not theorised.

  `dragstart` and `zoomstart` fire only for real gestures (including the +/−
  buttons), so they are what separates "the student moved the map" from "the
  map finished laying itself out". A non-user settle re-baselines silently
  instead of counting as drift.
*/
function MapViewportReporter({ onViewportChange }) {
  const map = useMap();
  const userMovedRef = useRef(false);

  const report = useCallback(
    (userInitiated) => {
      if (!onViewportChange) return;
      const b = map.getBounds();
      const bounds = {
        minLat: b.getSouth(),
        maxLat: b.getNorth(),
        minLng: b.getWest(),
        maxLng: b.getEast(),
      };

      /*
        Leaflet returns a zero-area box — a single point — while the container
        is still unsized, which is what `getBounds()` gives on mount. That is
        not a viewport anyone is looking at, so reporting it would seed a
        meaningless baseline. Wait for the real one; `moveend` follows as soon
        as the map has laid itself out.
      */
      if (bounds.minLat === bounds.maxLat || bounds.minLng === bounds.maxLng) return;

      onViewportChange(bounds, { userInitiated });
    },
    [map, onViewportChange],
  );

  // Ref writes in event handlers, not during render.
  useMapEvent('dragstart', () => {
    userMovedRef.current = true;
  });
  useMapEvent('zoomstart', () => {
    userMovedRef.current = true;
  });

  useMapEvent('moveend', () => {
    const userInitiated = userMovedRef.current;
    userMovedRef.current = false;
    report(userInitiated);
  });

  // Baseline on mount. The setState happens in the parent via a callback
  // rather than synchronously in this effect's body.
  useEffect(() => {
    report(false);
  }, [report]);

  return null;
}

export default function ListingsMap({
  listings,
  hoveredListingId = null,
  onPinHover,
  onViewportChange,
}) {
  /*
    Visited ids, via useSyncExternalStore — the React-sanctioned way to read a
    browser store that the server cannot see.

    The obvious alternative (useState + read in an effect) renders every pin
    white, then immediately corrects some to black. That is both a hydration
    mismatch and a synchronous setState in an effect body, which this repo's
    React Compiler lint rules reject. useSyncExternalStore makes the
    server/client difference explicit instead: getServerSnapshot says "nothing
    visited", and the client swaps in the real set at hydration.
  */
  const visitedIds = useSyncExternalStore(
    subscribeVisited,
    getVisitedSnapshot,
    getVisitedServerSnapshot,
  );

  /*
    Migration 106 made location.lat / location.lng NOT NULL, so in a correct
    database this filter drops nothing. It stays because the API's fallback
    SELECT path can still answer with a partially-joined row, and a listing
    with no coordinate would otherwise be rendered at [undefined, undefined]
    — which Leaflet turns into a thrown error, not a missing pin.
  */
  const withCoords = useMemo(
    () => listings.filter((l) => l.lat != null && l.lng != null),
    [listings],
  );

  /*
    CARD → PIN (parity Feature 13).

    The active class is toggled on the live DOM element rather than by handing
    <Marker> a new `icon` prop. Passing a fresh L.divIcon on every hover makes
    react-leaflet call setIcon, which DESTROYS AND REBUILDS the marker element
    — under the cursor. That drops the element's own CSS :hover mid-gesture and
    flickers the pin. Toggling a class leaves the node alone.
  */
  const markerRefs = useRef(new Map());

  useEffect(() => {
    markerRefs.current.forEach((marker, id) => {
      const el = marker?.getElement?.();
      if (!el) return;
      el.classList.toggle(`${PIN_CLASS}--active`, id === hoveredListingId);
    });
  }, [hoveredListingId, withCoords]);

  /*
    PIN → CARD (parity Feature 13). Deliberately does NOT scroll the grid to
    the matching card — Airbnb doesn't, and yanking the list out from under a
    student who is only reading the map is worse than the correspondence is
    worth. The popup carries the answer instead.
  */
  const closeTimer = useRef(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  // Timers outlive the component otherwise, and fire onPinHover into an
  // unmounted parent when the student switches to list view mid-hover.
  useEffect(() => cancelClose, [cancelClose]);

  const handlePinOver = useCallback(
    (listingId, event) => {
      cancelClose();
      event.target.openPopup();
      onPinHover?.(listingId);
    },
    [cancelClose, onPinHover],
  );

  const scheduleClose = useCallback(
    (listingId) => {
      cancelClose();
      closeTimer.current = setTimeout(() => {
        markerRefs.current.get(listingId)?.closePopup();
        onPinHover?.(null);
      }, POPUP_CLOSE_DELAY_MS);
    },
    [cancelClose, onPinHover],
  );

  return (
    <div className="h-full w-full rounded-card overflow-hidden border border-gray-200">
      <MapContainer
        center={THESSALONIKI_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        {/*
          CartoDB Positron, not OSM default (parity Feature 11).

          Airbnb's map is pale, desaturated and nearly label-free, so the map
          recedes and the price pins carry the attention. OSM default is the
          opposite — saturated, densely labelled, every POI marked. Same
          component, opposite impression.

          `{r}` resolves to `@2x` on retina. The host must be in BOTH the CSP
          `img-src` allowlist and `images.remotePatterns` in next.config.mjs —
          per CLAUDE.md, missing either breaks tiles in prod.
        */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        />
        <PopupViewportClamp />
        <MapViewportReporter onViewportChange={onViewportChange} />
        {/*
          Price-bubble pins (parity Feature 12). The teardrop markers — and
          the unpkg.com icon URLs that patched Leaflet's broken default icon
          paths under bundling — are gone: a divIcon carries its own markup, so
          there is no image to resolve and nothing to fetch cross-origin.
        */}
        {withCoords.map((listing) => (
          <Marker
            key={listing.listing_id}
            position={[listing.lat, listing.lng]}
            ref={(marker) => {
              // A ref callback runs outside render, so writing here does not
              // trip the no-writes-during-render rule.
              if (marker) markerRefs.current.set(listing.listing_id, marker);
              else markerRefs.current.delete(listing.listing_id);
            }}
            icon={L.divIcon(
              priceIconOptions(listing, {
                visited: visitedIds.has(listing.listing_id),
              }),
            )}
            eventHandlers={{
              mouseover: (e) => handlePinOver(listing.listing_id, e),
              mouseout: () => scheduleClose(listing.listing_id),
            }}
          >
            <Popup
              // autoPan would shove the whole map sideways to fit a popup the
              // student only grazed with the pointer, moving every other pin
              // out from under them. A hover must not move the map.
              autoPan={false}
              closeButton={false}
            >
              {/*
                MapPinPopupCard is deliberately link-free — an inner <a> inside
                this one would nest anchors. Click-through is owned here.
              */}
              <Link
                href={`/property/thessaloniki/listing/${listing.listing_id}`}
                className="block rounded-photo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
                // Entering the popup cancels the pending close so it stays
                // put; leaving it starts the same grace timer the pin uses, so
                // the popup dismisses itself without a close button.
                onMouseEnter={cancelClose}
                onMouseLeave={() => scheduleClose(listing.listing_id)}
              >
                <MapPinPopupCard listing={listing} />
              </Link>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
