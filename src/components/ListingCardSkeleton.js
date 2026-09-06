import Skeleton from '@/components/ui/Skeleton';

/*
  Loading placeholder for `ListingCard`, shared by the results grid and
  `DirectoryCarousel`.

  It existed twice before this — byte-identical `SkeletonCard` functions
  defined locally in both files — and both copies had drifted away from the
  card they stand in for.

  THE OLD ONE DREW A FRAME THAT NO LONGER EXISTS. It was
  `rounded-control border border-night/10 bg-white overflow-hidden` wrapping
  the photo, which is what a listing card looked like BEFORE Feature 16 made
  the photo the frame:

      {/* Photo — this IS the card frame now * /}
      <div className="relative aspect-[4/3] rounded-photo overflow-hidden">

  So the loading state promised a bordered box and then a borderless card
  arrived. `Skeleton`'s whole premise is "matching final geometry"; this now
  does — `rounded-photo` on a 4:3 block, text below it, no outer frame.

  Two things the hand-rolled version silently lacked, both from the primitive:

  - `aria-hidden`. None of the app's 36 hand-rolled pulse blocks had it.
  - `motion-reduce:animate-none`. `globals.css`'s reduced-motion block only
    covers `.bauhaus-*` and `.sx-price-pin`, so a bare `animate-pulse` keeps
    pulsing for a reader who asked it not to. That is the real reason this
    refactor is worth doing rather than a tidy-up.

  Widths are staggered rather than uniform so the block reads as a card of
  text and not a stack of identical bars.
*/
export default function ListingCardSkeleton() {
  return (
    <div aria-hidden="true">
      <Skeleton variant="photo" />
      <div className="mt-4 space-y-3">
        {/* neighbourhood · city */}
        <Skeleton variant="text" width={112} />
        {/* title */}
        <Skeleton variant="text" width="75%" height={20} />
        <div className="flex items-center justify-between">
          {/* property type */}
          <Skeleton variant="text" width={80} />
          {/* price */}
          <Skeleton variant="text" width={64} height={16} />
        </div>
      </div>
    </div>
  );
}
