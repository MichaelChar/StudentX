'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import Link from 'next/link';
import { useMemo, useSyncExternalStore } from 'react';
import { useLocale } from 'next-intl';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { formatPropertyType } from '@/lib/propertyType';
import { formatMoney } from '@/lib/formatMoney';
import { priceIconOptions } from '@/lib/mapPriceIcon';
import {
  getVisitedSnapshot,
  getVisitedServerSnapshot,
  subscribeVisited,
} from '@/lib/visitedListings';

// Thessaloniki city center
const THESSALONIKI_CENTER = [40.6301, 22.9439];
const DEFAULT_ZOOM = 13;

export default function ListingsMap({ listings }) {
  const locale = useLocale();

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
            icon={L.divIcon(
              priceIconOptions(listing, {
                visited: visitedIds.has(listing.listing_id),
              }),
            )}
            title={
              listing.monthly_price != null
                ? `${formatMoney(listing.monthly_price, listing.currency)}/mo`
                : undefined
            }
          >
            <Popup>
              <div className="text-sm min-w-[160px] max-w-[220px]">
                <p className="font-semibold text-night mb-0.5 line-clamp-2">
                  {listing.title || listing.address}
                </p>
                <p className="text-gray-600 text-xs mb-1">
                  {formatPropertyType(listing.property_type, locale)} · {listing.neighborhood}
                </p>
                {/* Address kept on the popup even when title differs — students
                    are comparing pins by location, not by marketing copy. */}
                {listing.address && listing.title !== listing.address && (
                  <p className="text-gray-500 text-xs mb-1 line-clamp-1">
                    {listing.address}
                  </p>
                )}
                <p className="text-gray-500 text-xs mb-2">
                  {listing.monthly_price != null
                    ? `${formatMoney(listing.monthly_price, listing.currency)}/mo`
                    : 'Price on request'}
                </p>
                <Link
                  href={`/property/thessaloniki/listing/${listing.listing_id}`}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  View listing →
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
