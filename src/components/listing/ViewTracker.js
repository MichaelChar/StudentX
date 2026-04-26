'use client';

import { useEffect } from 'react';

/*
  Fire-and-forget view tracker for the listing detail page. Server-rendering
  the page handed us the listing data, so we're only here to record that a
  human (or crawler) opened it. Errors are swallowed — analytics shouldn't
  block the experience.
*/
export default function ViewTracker({ listingId }) {
  useEffect(() => {
    if (!listingId) return;
    fetch(`/api/listings/${listingId}/view`, { method: 'POST' }).catch(() => {});
  }, [listingId]);
  return null;
}
