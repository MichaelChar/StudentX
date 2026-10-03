'use client';

import { useEffect } from 'react';
import { markListingVisited } from '@/lib/visitedListings';

/*
  Records that this listing has been opened, so its map pin renders in the
  "visited" state next time the student is on the results page
  (parity Feature 12).

  Deliberately separate from ViewTracker, which sits a line above this one on
  the detail page and looks similar:

  - ViewTracker POSTs to the server, unconditionally, and feeds landlord-facing
    view metrics.
  - This writes to localStorage only, and mounts unconditionally for the same
    reason ViewTracker does — a signed-out student is most of the traffic and
    still benefits from seeing which pins they have already checked.

  Folding the two together would still be worse: one is a local UI hint, the
  other a server-side analytics write, and conflating them couples unrelated
  failure modes for no benefit.
*/
export default function VisitedTracker({ listingId }) {
  useEffect(() => {
    markListingVisited(listingId);
  }, [listingId]);
  return null;
}
