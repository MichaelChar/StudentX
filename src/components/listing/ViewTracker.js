'use client';

import { useEffect } from 'react';

/*
  Fire-and-forget view tracker for the listing detail page. Mounts
  unconditionally, signed in or not — the API route it calls was always
  written to accept anonymous views, and on an SEO-acquisition directory most
  traffic is anonymous. Errors are swallowed — analytics shouldn't block the
  experience.
*/
export default function ViewTracker({ listingId }) {
  useEffect(() => {
    if (!listingId) return;
    fetch(`/api/listings/${listingId}/view`, { method: 'POST' }).catch(() => {});
  }, [listingId]);
  return null;
}
