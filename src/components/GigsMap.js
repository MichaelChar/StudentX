'use client';

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import Link from 'next/link';
import { useEffect } from 'react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { GIGS_MAP_DEFAULT_CENTER, GIGS_MAP_DEFAULT_ZOOM, getGigCountry } from '@/lib/gigCountries';

// Fix missing marker icons in webpack/Next.js builds (same shim as ListingsMap).
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

const CURRENCY_SYMBOL = { EUR: '€', GBP: '£', USD: '$' };

function payLabel(gig) {
  if (!gig.is_paid) return 'Unpaid';
  if (gig.pay_amount == null) return 'Pay on application';
  const symbol = CURRENCY_SYMBOL[gig.currency] || `${gig.currency} `;
  const per = gig.pay_period === 'total' ? '' : `/${gig.pay_period === 'hour' ? 'hr' : gig.pay_period === 'week' ? 'wk' : 'mo'}`;
  return `${symbol}${gig.pay_amount}${per}`;
}

/**
 * Map view of the gigs board — browse jobs by country. When the student has
 * narrowed to a single country we centre on it; otherwise the view defaults to
 * roughly all of Europe so cross-country pins are visible.
 */
export default function GigsMap({ gigs, selectedCountries = [] }) {
  useLeafletIcons();

  const withCoords = gigs.filter((g) => g.lat != null && g.lng != null);

  let center = GIGS_MAP_DEFAULT_CENTER;
  let zoom = GIGS_MAP_DEFAULT_ZOOM;
  if (selectedCountries.length === 1) {
    const meta = getGigCountry(selectedCountries[0]);
    if (meta) {
      center = meta.center;
      zoom = meta.zoom;
    }
  }

  return (
    <div className="h-full w-full rounded-sm overflow-hidden border border-gray-200">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {withCoords.map((gig) => (
          <Marker key={gig.gig_id} position={[gig.lat, gig.lng]}>
            <Popup>
              <div className="text-sm min-w-[160px] max-w-[220px]">
                <p className="font-semibold text-night mb-0.5 line-clamp-2">{gig.title}</p>
                {gig.employer_name && (
                  <p className="text-gray-600 text-xs mb-1">{gig.employer_name}</p>
                )}
                <p className="text-gray-500 text-xs mb-1">
                  {[gig.city, gig.country_name].filter(Boolean).join(', ')}
                </p>
                <p className="text-gray-500 text-xs mb-2">{payLabel(gig)}</p>
                <Link
                  href={`/gigs/${gig.gig_id}`}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  View gig →
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
