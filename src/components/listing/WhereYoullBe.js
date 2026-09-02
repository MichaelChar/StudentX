'use client';

import dynamic from 'next/dynamic';

import { APPROXIMATE_RADIUS_M } from '@/lib/approximateLocation';

/*
  "Where you'll be" — parity Feature 36.

  A thin client wrapper whose entire job is the dynamic import. The listing
  page is a SERVER component, and `next/dynamic` with `ssr: false` is not
  allowed in one; Leaflet touches `window` on import, so it cannot be
  server-rendered either. This file is the smallest thing that can sit between
  the two, matching how results/page.js loads ListingsMap.

  WHY THE RADIUS IS 200m AND NOT SMALLER.

  transformListing rounds public coordinates to 3 decimal places, so the point
  handed to this component is displaced from the real address by up to ~70m
  (56m of latitude, 42m of longitude at this latitude, ~70m on the diagonal).

  The circle therefore has to be BIGGER than 70m or it would be a lie: a
  student would reasonably read the ring as "the home is inside this", and at
  a smaller radius it sometimes would not be. 200m clears that error with room
  to spare and still reads as a neighbourhood rather than a building, which is
  the honest claim — the exact address is withheld until a booking is
  confirmed (#452).

  The number itself lives in lib/approximateLocation.js next to the function
  that computes the offset, so a test can assert the circle is bigger than the
  error rather than the two drifting apart in separate files.
*/

const ApproximateLocationMap = dynamic(
  () => import('@/components/listing/ApproximateLocationMap'),
  {
    ssr: false,
    // Same height as the map, so the section does not jump when it loads.
    loading: () => (
      <div className="h-72 w-full rounded-photo bg-parchment" aria-hidden="true" />
    ),
  },
);

export default function WhereYoullBe({ lat, lng, heading, caption }) {
  // Coordinates are NOT NULL in the database (migration 106), but the public
  // transform can still hand back null for a row that predates it or fails the
  // finite check. A map centred on null lands in the Atlantic.
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return (
    <ApproximateLocationMap
      lat={lat}
      lng={lng}
      radiusMeters={APPROXIMATE_RADIUS_M}
      heading={heading}
      caption={caption}
    />
  );
}
