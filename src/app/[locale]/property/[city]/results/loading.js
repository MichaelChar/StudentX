import Skeleton from '@/components/ui/Skeleton';
import ListingCardSkeleton from '@/components/ListingCardSkeleton';

/*
  Instant feedback while the results page's server fetches run (listings,
  faculties, neighbourhoods, price distribution — results/page.js). Without
  this the previous page stayed frozen until the whole response was ready,
  which is the moment that makes a web app feel slower than a native one.

  Geometry mirrors ResultsClient so nothing jumps when the real page swaps in:
  the same max-w-7xl container and padding, the eyebrow + h1 block, the chip
  row, the 62/38 card-grid / map split from `lg`, and 2-up cards from `sm`.
  Skeleton and ListingCardSkeleton are aria-hidden; the wrapper carries the
  busy state for assistive tech.
*/
export default function ResultsLoading() {
  return (
    <div
      className="mx-auto max-w-7xl px-5 pt-6 pb-10 md:pt-8 md:pb-14"
      aria-busy="true"
      aria-live="polite"
    >
      {/* eyebrow + title */}
      <div className="mb-10 space-y-3" aria-hidden="true">
        <Skeleton variant="text" width={96} />
        <Skeleton variant="text" width="min(22rem, 80%)" height={32} />
      </div>

      {/* filter chip row */}
      <div className="mb-8 flex gap-2 overflow-hidden" aria-hidden="true">
        {[92, 104, 96, 72, 112, 96, 80].map((w, i) => (
          <Skeleton key={i} variant="text" width={w} height={34} className="shrink-0" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[62fr_38fr] lg:items-start gap-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {Array.from({ length: 4 }, (_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
        <div
          className="hidden lg:block lg:sticky lg:top-[calc(var(--header-h)+1.5rem)] lg:h-[calc(100vh-var(--header-h)-3rem)]"
          aria-hidden="true"
        >
          <Skeleton variant="card" width="100%" height="100%" />
        </div>
      </div>
    </div>
  );
}
