'use client';

import { useEffect, useState } from 'react';
import { Link } from '@/i18n/navigation';
import ListingCard from '@/components/ListingCard';
import ListingCardSkeleton from '@/components/ListingCardSkeleton';
import Icon from '@/components/ui/Icon';

// Three, matching the three loading placeholders and the md grid's one row:
// a fourth would add a second row after load and shove the tiles down.
const MAX = 3;
// A real card's text block is a constant ~298px under its 4:3 photo (measured
// at 390, 820 and 1280px); ListingCardSkeleton's bars are ~88px. The spacer
// makes the placeholder the card's height so nothing jumps when cards land.
// Local to the homepage — the results grid keeps the shared skeleton as is.
const SKELETON_SPACER = 'h-[210px]';

/*
  "Homes in Thessaloniki" — the live listings, straight under the search bar.

  Fetched in the browser from /api/listings (the same public payload the results
  grid renders) rather than on the server: the homepage is prerendered and the
  incremental cache is build-time only, so a server fetch would freeze the row
  at the last deploy while listings go live through the admin with no deploy.

  On a failed or empty fetch the section renders nothing; the search bar above
  still leads to results.

  `isolate`: ListingCard's badge and heart carry their own z-index. Without a
  stacking context here they outrank the search bar's wrapper (z-[2] in
  page.js) and paint over its date panel, which opens down across this row.
*/
export default function HomeListings({ heading, showAll }) {
  const [listings, setListings] = useState(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/listings?page=1');
        if (!res.ok) throw new Error(`API ${res.status}`);
        const data = await res.json();
        if (!cancelled) setListings((data.listings || []).slice(0, MAX));
      } catch {
        if (!cancelled) setListings([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (listings && listings.length === 0) return null;

  return (
    <section aria-labelledby="home-listings" className="isolate py-10 md:py-12">
      <div className="mx-auto max-w-[1120px] px-5 md:px-6">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 id="home-listings" className="font-display text-2xl md:text-[28px] text-night">
            {heading}
          </h2>
          <Link
            href="/property/thessaloniki/results"
            aria-describedby="home-listings"
            className="inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-night underline-offset-4 hover:underline"
          >
            {showAll}
            <Icon name="chevronRight" className="h-4 w-4" />
          </Link>
        </div>
        {/* A swipeable row on phones (Airbnb's mobile pattern), a grid from md. */}
        <div className="-mx-5 flex snap-x snap-mandatory gap-4 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 md:pb-0">
          {(listings ?? Array.from({ length: 3 }, () => null)).map((listing, i) => (
            <div key={listing?.listing_id ?? `s${i}`} className="w-[82%] shrink-0 snap-start md:w-auto">
              {listing ? (
                <ListingCard listing={listing} />
              ) : (
                <>
                  <ListingCardSkeleton />
                  <div aria-hidden="true" className={SKELETON_SPACER} />
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
