'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import Link from 'next/link';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix missing marker icons in webpack/Next.js builds
function useLeafletIcons() {
  useEffect(() => {
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
  }, []);
}

// Thessaloniki city center
const THESSALONIKI_CENTER = [40.6301, 22.9439];
const DEFAULT_ZOOM = 13;

export default function ListingsMap({ listings }) {
  useLeafletIcons();

  const withCoords = listings.filter(
    (l) => l.lat != null && l.lng != null
  );

  return (
    <div className="h-full w-full rounded-xl overflow-hidden border border-gray-200">
      <MapContainer
        center={THESSALONIKI_CENTER}
        zoom={DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {withCoords.map((listing) => (
          <Marker key={listing.listing_id} position={[listing.lat, listing.lng]}>
            <Popup>
              <div className="text-sm min-w-[160px] max-w-[220px]">
                <p className="font-semibold text-navy mb-0.5 line-clamp-2">
                  {listing.title || listing.address}
                </p>
                <p className="text-gray-600 text-xs mb-1">
                  {listing.property_type} · {listing.neighborhood}
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
                    ? `€${listing.monthly_price}/mo`
                    : 'Price on request'}
                </p>
                <Link
                  href={`/listing/${listing.listing_id}`}
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
