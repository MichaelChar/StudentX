'use client';

import { useEffect } from 'react';
import { markListingVisited } from '@/lib/visitedListings';

/*
  Records that this listing has been opened, so its map pin renders in the
  "visited" state next time the student is on the results page
  (parity Feature 12).

  Deliberately separate from ViewTracker, which sits a line above this one on
  the detail page and looks similar:

  - ViewTracker POSTs to the server and only mounts when `isAuthed`. It feeds
    landlord-facing view metrics.
  - This writes to localStorage only and mounts unconditionally, because a
    signed-out student browsing the directory is precisely who benefits from
    seeing which pins they have already checked.

  Folding the two together would mean either auth-gating a local UI hint or
  sending an analytics write for anonymous traffic. Both are worse than one
  extra six-line component.
*/
export default function VisitedTracker({ listingId }) {
  useEffect(() => {
    markListingVisited(listingId);
  }, [listingId]);
  return null;
}
