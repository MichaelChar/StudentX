import Skeleton from '@/components/ui/Skeleton';

/*
  Instant feedback between tapping a listing card and the PDP's server render
  (listing + landlord + distances + availability — listing/[id]/page.js).

  Mirrors the real page so the swap doesn't jump:
  - below md: Feature 58's chromeless, full-bleed 3:4 hero (the page pulls it
    to the viewport edges with -mt-8 / -mx-5), then the content sheet with
    rounded top corners overlapping it;
  - md and up: the back link, the 392px mosaic, then the 1fr / 373px grid with
    the sticky booking card column from lg.

  404s DEPEND ON THE LAYOUT. A loading boundary makes the page stream: the
  skeleton is sent with a 200, and a notFound() called later, inside the page,
  can no longer change the status — a soft 404. Missing listings stay a real
  404 only because ./layout.js calls notFound() first, from the same cached
  getListingForRender(id), OUTSIDE this boundary. Keep it there. (gigs/[id]
  has no loading.js for exactly this reason: its notFound() is in the page.)
*/
const PULSE = 'bg-parchment animate-pulse motion-reduce:animate-none';

export default function ListingLoading() {
  return (
    <div
      className="mx-auto max-w-6xl px-5 pt-8 pb-28 md:py-12"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-8 hidden md:block" aria-hidden="true">
        <Skeleton variant="text" width={128} />
      </div>

      <section className="-mt-8 md:mt-0 md:mb-10" aria-hidden="true">
        <div className={`-mx-5 aspect-[3/4] md:hidden ${PULSE}`} />
        <div className="hidden md:block">
          <Skeleton variant="photo" width="100%" height={392} />
        </div>
      </section>

      <div
        className="relative -mx-5 -mt-6 rounded-t-modal bg-stone px-5 pt-6 md:mx-0 md:mt-0 md:rounded-none md:px-0 md:pt-0"
        aria-hidden="true"
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_373px] gap-10">
          <div className="space-y-8">
            <div className="space-y-4">
              <Skeleton variant="text" width={160} />
              <Skeleton variant="text" width="85%" height={36} />
              <Skeleton variant="text" width="55%" height={36} />
            </div>
            <div className="flex items-center gap-4">
              <Skeleton variant="circle" width={48} />
              <div className="flex-1 space-y-2">
                <Skeleton variant="text" width={72} />
                <Skeleton variant="text" width={140} height={16} />
              </div>
            </div>
            <div className="space-y-5">
              {[0, 1].map((i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton variant="circle" width={24} />
                  <div className="flex-1 space-y-2">
                    <Skeleton variant="text" width="45%" height={16} />
                    <Skeleton variant="text" width="65%" />
                  </div>
                </div>
              ))}
            </div>
            <Skeleton variant="card" width="100%" height={240} />
          </div>
          <div className="hidden lg:block">
            <div className="lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
              <Skeleton variant="card" width="100%" height={420} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
