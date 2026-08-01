'use client';

import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const THESSALONIKI_CENTER = [40.6401, 22.9444];
const DEFAULT_ZOOM = 14;

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

function MapRecenter({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
    }
  }, [lat, lng, map]);
  return null;
}

function DraggableMarker({ lat, lng, onMove }) {
  const position = useMemo(() => [lat, lng], [lat, lng]);

  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng);
    },
  });

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return (
    <Marker
      position={position}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const p = e.target.getLatLng();
          onMove(p.lat, p.lng);
        },
      }}
    />
  );
}

/**
 * Draggable pin map for the address step. Click or drag sets lat/lng.
 */
export default function AddressMap({ lat, lng, onMove }) {
  useLeafletIcons();

  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);
  const center = hasPin ? [lat, lng] : THESSALONIKI_CENTER;

  return (
    <div className="h-64 sm:h-80 w-full rounded-sm overflow-hidden border border-night/10">
      <MapContainer
        center={center}
        zoom={hasPin ? 16 : DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {hasPin && <MapRecenter lat={lat} lng={lng} />}
        <DraggableMarker
          lat={hasPin ? lat : THESSALONIKI_CENTER[0]}
          lng={hasPin ? lng : THESSALONIKI_CENTER[1]}
          onMove={onMove}
        />
      </MapContainer>
    </div>
  );
}
